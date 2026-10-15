import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { checkSign, normalize, flattenLandmarks } from '../utils/normalize';
import { API_URL, MEDIAPIPE_WASM_URL, HAND_MODEL_URL } from '../config';

export default function LearnMode() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { lessonId } = useParams();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const consecutiveCorrectRef = useRef(0);
  const signCompletedRef = useRef(false);
  const pendingFeedbackRef = useRef({ text: '', since: 0 });
  const shownFeedbackRef = useRef('');
  const lastClassifierCallRef = useRef(0);
  const classifierInFlightRef = useRef(false);
  // Latest classifier opinion: { letter, confidence, time }
  const predictionRef = useRef(null);
  // The frame loop is started once, so it must read the latest
  // lesson and sign index from refs instead of from state
  const lessonRef = useRef(null);
  const currentSignIndexRef = useRef(0);
  const animFrameRef = useRef(null);
  // Each mount gets its own session id. React StrictMode mounts twice in
  // development, so async work from an old session must stop itself
  const sessionRef = useRef(0);

  const [lesson, setLesson] = useState(null);
  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  // Frames in a row the sign must match (about half a second)
  const REQUIRED_CONSECUTIVE = 15;
  // A new feedback message must hold this long before it is shown, so it does not flicker
  const FEEDBACK_HOLD_MS = 400;
  // Double-check with the trained classifier (alphabet lessons only)
  const CLASSIFIER_INTERVAL_MS = 300;
  const CLASSIFIER_MIN_CONFIDENCE = 0.6;

  useEffect(() => {
    const session = sessionRef.current;
    fetchLesson(session);
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    lessonRef.current = lesson;
  }, [lesson]);

  useEffect(() => {
    currentSignIndexRef.current = currentSignIndex;
  }, [currentSignIndex]);

  const cleanup = () => {
    sessionRef.current += 1;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const fetchLesson = async (session) => {
    try {
      const response = await axios.get(
        `${API_URL}/lessons/${lessonId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (sessionRef.current !== session) return;
      lessonRef.current = response.data.lesson;
      setLesson(response.data.lesson);
      setIsLoading(false);
      await initMediaPipe(session);
    } catch (error) {
      console.error('Error fetching lesson:', error);
      setIsLoading(false);
    }
  };

  const initMediaPipe = async (session) => {
    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

      const vision = await FilesetResolver.forVisionTasks(
        MEDIAPIPE_WASM_URL
      );

      const hands = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_URL,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
      });

      // Page was closed while MediaPipe was loading
      if (sessionRef.current !== session) {
        hands.close();
        return;
      }
      handsRef.current = hands;

      await startCamera(session);
    } catch (error) {
      console.error('MediaPipe error:', error);
    }
  };

  const startCamera = async (session) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (sessionRef.current !== session || !videoRef.current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    animFrameRef.current = requestAnimationFrame(processFrame);
  };

  const processFrame = () => {
    if (!handsRef.current && !streamRef.current) return;
    if (!handsRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = Date.now();
    const results = handsRef.current.detectForVideo(videoRef.current, now);

    drawSkeleton(results);

    if (results.landmarks && results.landmarks.length > 0 && !signCompletedRef.current) {
      askClassifier(results.landmarks[0]);
      compareSign(results.landmarks[0]);
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  };

  const drawSkeleton = (results) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17]
      ];

      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      connections.forEach(([start, end]) => {
        ctx.beginPath();
        ctx.moveTo(landmarks[start].x * canvas.width, landmarks[start].y * canvas.height);
        ctx.lineTo(landmarks[end].x * canvas.width, landmarks[end].y * canvas.height);
        ctx.stroke();
      });

      ctx.fillStyle = '#60A5FA';
      landmarks.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  // Ask the trained classifier which letter it sees, a few times per second.
  // Runs in the background; compareSign uses the latest answer.
  const askClassifier = (landmarks) => {
    const lesson = lessonRef.current;
    if (!lesson || lesson.category !== 'alphabets') return;
    const now = performance.now();
    if (classifierInFlightRef.current || now - lastClassifierCallRef.current < CLASSIFIER_INTERVAL_MS) return;
    lastClassifierCallRef.current = now;
    classifierInFlightRef.current = true;

    const flat = flattenLandmarks(normalize(landmarks));
    axios.post(
      `${API_URL}/ai/detect`,
      { landmarks: flat },
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(response => {
      const { letter, confidence } = response.data;
      predictionRef.current = { letter, confidence, time: performance.now() };
    }).catch(() => {
      // AI service not available - learning mode still works with the reference comparison
      predictionRef.current = null;
    }).finally(() => {
      classifierInFlightRef.current = false;
    });
  };

  // The classifier's answer if it is recent and confident, otherwise null
  const confidentOtherLetter = (target) => {
    const prediction = predictionRef.current;
    if (!prediction || performance.now() - prediction.time > 1000) return null;
    if (prediction.confidence < CLASSIFIER_MIN_CONFIDENCE) return null;
    return prediction.letter !== target ? prediction.letter : null;
  };

  // Only show a new message once it has stayed the same for FEEDBACK_HOLD_MS
  const showFeedbackSteadily = (text, type) => {
    const now = performance.now();
    const pending = pendingFeedbackRef.current;
    if (pending.text !== text) {
      pendingFeedbackRef.current = { text, since: now };
      return;
    }
    if (now - pending.since >= FEEDBACK_HOLD_MS && shownFeedbackRef.current !== text) {
      shownFeedbackRef.current = text;
      setFeedback(text);
      setFeedbackType(type);
    }
  };

  const compareSign = (landmarks) => {
    const lesson = lessonRef.current;
    if (!lesson || !lesson.signs || lesson.signs.length === 0) return;

    const currentSign = lesson.signs[currentSignIndexRef.current];
    if (!currentSign || !currentSign.landmarkData || currentSign.landmarkData.length === 0) return;

    // Convert flat reference array to landmark objects
    const refFlat = currentSign.landmarkData;
    const refLandmarks = [];
    for (let i = 0; i < refFlat.length; i += 3) {
      refLandmarks.push({ x: refFlat[i], y: refFlat[i+1], z: refFlat[i+2] });
    }

    const result = checkSign(landmarks, refLandmarks, currentSign.threshold || 0.15);
    const otherLetter = confidentOtherLetter(currentSign.word);

    if (result.result === 'correct' && !otherLetter) {
      consecutiveCorrectRef.current += 1;
      if (consecutiveCorrectRef.current >= REQUIRED_CONSECUTIVE) {
        signCompletedRef.current = true;
        shownFeedbackRef.current = '✅ Correct! Well done!';
        setFeedback('✅ Correct! Well done!');
        setFeedbackType('correct');
        setCorrectCount(prev => prev + 1);
        consecutiveCorrectRef.current = 0;
      } else {
        showFeedbackSteadily('Looking good — hold it steady...', 'almost');
      }
      return;
    }

    consecutiveCorrectRef.current = 0;
    if (otherLetter) {
      // The shape is close to the reference but the classifier sees another letter
      const hint = result.result === 'wrong' && result.feedback ? ` ${result.feedback}.` : '';
      showFeedbackSteadily(`That looks like ${otherLetter}, not ${currentSign.word}.${hint}`, 'wrong');
    } else if (result.result === 'almost') {
      showFeedbackSteadily(result.feedback, 'almost');
    } else {
      showFeedbackSteadily(result.feedback || 'Keep trying!', 'wrong');
    }
  };

  // Used by both Next (after a correct sign) and Skip (sign not counted)
  const handleNext = () => {
    if (!lesson) return;

    if (currentSignIndex >= lesson.signs.length - 1) {
      // Lesson complete
      saveProgress();
      setIsComplete(true);
    } else {
      currentSignIndexRef.current = currentSignIndex + 1;
      setCurrentSignIndex(currentSignIndex + 1);
      setFeedback('');
      setFeedbackType('');
      shownFeedbackRef.current = '';
      pendingFeedbackRef.current = { text: '', since: 0 };
      predictionRef.current = null;
      signCompletedRef.current = false;
      consecutiveCorrectRef.current = 0;
    }
  };

  const saveProgress = async () => {
    try {
      await axios.post(
        `${API_URL}/progress/save`,
        {
          lessonId,
          signsCorrect: correctCount,
          totalSigns: lesson.signs.length
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-xl">Loading lesson and MediaPipe...</p>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center bg-gray-800 rounded-2xl p-10 max-w-md">
          <p className="text-6xl mb-4">🎉</p>
          <h2 className="text-3xl font-bold mb-2">Lesson Complete!</h2>
          <p className="text-gray-400 mb-6">
            You got {correctCount} out of {lesson?.signs?.length} signs correct
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition duration-200"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!lesson || !lesson.signs || lesson.signs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-xl mb-4">No signs found in this lesson yet.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentSign = lesson.signs[currentSignIndex];

  return (
    <div className="min-h-screen bg-gray-900 text-white">

      {/* Navbar */}
      <div className="bg-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-blue-400">SignBridge</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400">
            {correctCount} correct — Sign {currentSignIndex + 1} of {lesson.signs.length}
          </span>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition duration-200"
          >
            Exit Lesson
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Current sign word */}
        <h2 className="text-4xl font-bold text-center mb-8">
          Sign: <span className="text-blue-400">{currentSign.word}</span>
        </h2>

        <div className="grid grid-cols-2 gap-6 mb-6">

          {/* Left - Webcam */}
          <div>
            <p className="text-gray-400 text-sm mb-2 text-center">Your Hand</p>
            <div className="relative bg-gray-800 rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
          </div>

          {/* Right - Reference image */}
          <div>
            <p className="text-gray-400 text-sm mb-2 text-center">Reference Sign</p>
            <div className="bg-gray-800 rounded-2xl overflow-hidden flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
              {currentSign.referenceImageURL ? (
                <img
                  src={currentSign.referenceImageURL}
                  alt={`Sign for ${currentSign.word}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-gray-500 text-center px-4">No reference image available</p>
              )}
            </div>
          </div>

        </div>

        {/* Signs that have not been collected and trained yet */}
        {(!currentSign.landmarkData || currentSign.landmarkData.length === 0) && (
          <div className="rounded-xl p-4 mb-6 text-center text-lg font-semibold bg-yellow-500 bg-opacity-20 border border-yellow-500 text-yellow-400">
            AI feedback for this sign is not trained yet — practise using the reference image
          </div>
        )}

        {/* Feedback banner */}
        {feedback && (
          <div className={`rounded-xl p-4 mb-6 text-center text-lg font-semibold ${
            feedbackType === 'correct'
              ? 'bg-green-500 bg-opacity-20 border border-green-500 text-green-400'
              : feedbackType === 'almost'
                ? 'bg-yellow-500 bg-opacity-20 border border-yellow-500 text-yellow-400'
                : 'bg-red-500 bg-opacity-20 border border-red-500 text-red-400'
          }`}>
            {feedback}
          </div>
        )}

        {/* Next / Skip buttons - a skipped sign does not count as correct */}
        <div className="flex gap-3">
          {feedbackType !== 'correct' && (
            <button
              onClick={handleNext}
              className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition duration-200"
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={feedbackType !== 'correct'}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-lg transition duration-200"
          >
            {currentSignIndex >= lesson.signs.length - 1 ? 'Complete Lesson' : 'Next Sign →'}
          </button>
        </div>

      </div>
    </div>
  );
}