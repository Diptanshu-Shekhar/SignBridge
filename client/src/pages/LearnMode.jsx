import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { normalize, checkSign } from '../utils/normalize';

export default function LearnMode() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { lessonId } = useParams();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const consecutiveCorrectRef = useRef(0);
  const signCompletedRef = useRef(false);

  const [lesson, setLesson] = useState(null);
  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  const REQUIRED_CONSECUTIVE = 5;

  useEffect(() => {
    fetchLesson();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (handsRef.current) handsRef.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const fetchLesson = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/lessons/${lessonId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLesson(response.data.lesson);
      await initMediaPipe();
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching lesson:', error);
      setIsLoading(false);
    }
  };

  const initMediaPipe = async () => {
    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      handsRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
      });

      await startCamera();
    } catch (error) {
      console.error('MediaPipe error:', error);
    }
  };

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    requestAnimationFrame(processFrame);
  };

  const processFrame = useCallback(() => {
    if (!handsRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      requestAnimationFrame(processFrame);
      return;
    }

    const now = Date.now();
    const results = handsRef.current.detectForVideo(videoRef.current, now);

    drawSkeleton(results);

    if (results.landmarks && results.landmarks.length > 0 && !signCompletedRef.current) {
      compareSign(results.landmarks[0]);
    }

    requestAnimationFrame(processFrame);
  }, [lesson, currentSignIndex]);

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

  const compareSign = (landmarks) => {
    if (!lesson || !lesson.signs || lesson.signs.length === 0) return;

    const currentSign = lesson.signs[currentSignIndex];
    if (!currentSign || !currentSign.landmarkData || currentSign.landmarkData.length === 0) return;

    // Convert flat reference array to landmark objects
    const refFlat = currentSign.landmarkData;
    const refLandmarks = [];
    for (let i = 0; i < refFlat.length; i += 3) {
      refLandmarks.push({ x: refFlat[i], y: refFlat[i+1], z: refFlat[i+2] });
    }

    const result = checkSign(landmarks, refLandmarks, currentSign.threshold || 0.15);

    if (result.result === 'correct') {
      consecutiveCorrectRef.current += 1;
      if (consecutiveCorrectRef.current >= REQUIRED_CONSECUTIVE) {
        signCompletedRef.current = true;
        setFeedback('✅ Correct! Well done!');
        setFeedbackType('correct');
        setCorrectCount(prev => prev + 1);
        consecutiveCorrectRef.current = 0;
      }
    } else {
      consecutiveCorrectRef.current = 0;
      setFeedback(result.feedback || 'Keep trying!');
      setFeedbackType('wrong');
    }
  };

  const handleNext = () => {
    if (!lesson) return;

    if (currentSignIndex >= lesson.signs.length - 1) {
      // Lesson complete
      saveProgress();
      setIsComplete(true);
    } else {
      setCurrentSignIndex(prev => prev + 1);
      setFeedback('');
      setFeedbackType('');
      signCompletedRef.current = false;
      consecutiveCorrectRef.current = 0;
    }
  };

  const saveProgress = async () => {
    try {
      await axios.post(
        'http://localhost:5000/progress/save',
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
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
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

        {/* Feedback banner */}
        {feedback && (
          <div className={`rounded-xl p-4 mb-6 text-center text-lg font-semibold ${
            feedbackType === 'correct'
              ? 'bg-green-500 bg-opacity-20 border border-green-500 text-green-400'
              : 'bg-red-500 bg-opacity-20 border border-red-500 text-red-400'
          }`}>
            {feedback}
          </div>
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={feedbackType !== 'correct'}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-lg transition duration-200"
        >
          {currentSignIndex >= lesson.signs.length - 1 ? 'Complete Lesson' : 'Next Sign →'}
        </button>

      </div>
    </div>
  );
}