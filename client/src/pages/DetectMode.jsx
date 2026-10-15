import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { normalize, flattenLandmarks } from '../utils/normalize';
import { API_URL, MEDIAPIPE_WASM_URL, HAND_MODEL_URL } from '../config';

const CONFUSING_PAIRS = ['A', 'S', 'U', 'V', 'M', 'N'];
// Minimum classifier confidence for a prediction to count
// Tune these using the live "Model sees" readout on the page
const NORMAL_THRESHOLD = 0.5;
const STRICT_THRESHOLD = 0.6;
// Consecutive matching predictions (one every 250ms) needed to confirm a letter
const STABILITY_COUNT = 8;
const STRICT_STABILITY_COUNT = 12;
const REQUEST_INTERVAL_MS = 250;

export default function DetectMode() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  // Each mount gets its own session id. React StrictMode mounts twice in
  // development, so async work from an old session must stop itself
  const sessionRef = useRef(0);
  const lastSentRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const stabilityBufferRef = useRef([]);
  // Last letter added to the sentence. The same letter is only added again
  // after the hand leaves the frame, so a held sign does not repeat
  const lastAddedRef = useRef(null);
  const tokenRef = useRef(token);
  const recognitionRef = useRef(null);

  const [sentence, setSentence] = useState('');
  const [currentLetter, setCurrentLetter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [hearingText, setHearingText] = useState('');
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [livePrediction, setLivePrediction] = useState(null);
  const [handVisible, setHandVisible] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const session = sessionRef.current;
    initMediaPipe(session);
    return () => {
      cleanup();
    };
  }, []);

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
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const initMediaPipe = async (session) => {
    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

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
      if (sessionRef.current === session) setIsLoading(false);

    } catch (error) {
      console.error('MediaPipe initialization error:', error);
      setLoadError('Could not start the camera or MediaPipe. Check camera permission and refresh.');
      setIsLoading(false);
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

    const now = performance.now();
    const results = handsRef.current.detectForVideo(videoRef.current, now);

    drawSkeleton(results);

    if (results.landmarks && results.landmarks.length > 0) {
      setHandVisible(true);
      // Do not wait for the response, so the skeleton keeps drawing smoothly
      if (now - lastSentRef.current > REQUEST_INTERVAL_MS && !requestInFlightRef.current) {
        lastSentRef.current = now;
        sendToClassifier(results.landmarks[0]);
      }
    } else {
      setHandVisible(false);
      setCurrentLetter('');
      setLivePrediction(null);
      setStabilityProgress(0);
      stabilityBufferRef.current = [];
      lastAddedRef.current = null;
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

  const sendToClassifier = async (landmarks) => {
    requestInFlightRef.current = true;
    try {
      const normalized = normalize(landmarks);
      const flat = flattenLandmarks(normalized);

      // Curl angles are calculated by the AI service from the landmarks
      const response = await axios.post(
        `${API_URL}/ai/detect`,
        { landmarks: flat },
        { headers: { Authorization: `Bearer ${tokenRef.current}` } }
      );
      if (!handsRef.current) return;
      setAiError('');

      const { letter, confidence } = response.data;
      const isConfusing = CONFUSING_PAIRS.includes(letter);
      const threshold = isConfusing ? STRICT_THRESHOLD : NORMAL_THRESHOLD;
      const stabilityCount = isConfusing ? STRICT_STABILITY_COUNT : STABILITY_COUNT;

      setLivePrediction({ letter, confidence, threshold });

      if (confidence < threshold) {
        stabilityBufferRef.current = [];
        setStabilityProgress(0);
        return;
      }

      const buffer = stabilityBufferRef.current;
      if (buffer.length > 0 && buffer[buffer.length - 1] !== letter) {
        buffer.length = 0;
      }
      buffer.push(letter);
      setStabilityProgress(Math.min(buffer.length / stabilityCount, 1));

      if (buffer.length >= stabilityCount) {
        stabilityBufferRef.current = [];
        setCurrentLetter(letter);
        if (letter !== lastAddedRef.current) {
          lastAddedRef.current = letter;
          setSentence(prev => prev + letter);
        }
      }

    } catch (error) {
      if (!handsRef.current) return;
      if (error.response?.status === 401) {
        setAiError('Session expired. Please log in again.');
      } else {
        setAiError(error.response?.data?.message || 'Cannot reach the server. Is it running?');
      }
      console.error('Classifier error:', error);
    } finally {
      requestInFlightRef.current = false;
    }
  };

  const addSpace = () => {
    setSentence(prev => (prev === '' || prev.endsWith(' ') ? prev : prev + ' '));
    // Allow the same letter to start the next word
    lastAddedRef.current = null;
  };

  const backspace = () => {
    setSentence(prev => prev.slice(0, -1));
    lastAddedRef.current = null;
  };

  const clearSentence = () => {
    setSentence('');
    setCurrentLetter('');
    lastAddedRef.current = null;
  };

  const speakSentence = () => {
    if (!sentence.trim()) return;
    const utterance = new SpeechSynthesisUtterance(sentence.trim());
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang === 'en-US');
    if (englishVoice) utterance.voice = englishVoice;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);

    // Log to MongoDB
    axios.post(
      `${API_URL}/detection/log`,
      { sentence: sentence.trim() },
      { headers: { Authorization: `Bearer ${tokenRef.current}` } }
    ).catch(error => console.error('Error logging sentence:', error));

    clearSentence();
  };

  const startHearingRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      setHearingText(transcript);
    };
    recognition.onend = () => setRecognitionActive(false);

    recognition.start();
    setRecognitionActive(true);
  };

  const stopHearingRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setRecognitionActive(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">

      {/* Navbar */}
      <div className="bg-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-blue-400">SignBridge</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition duration-200"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-2 text-center">Detection Mode</h2>
        <p className="text-gray-400 text-center mb-8">
          Sign a letter and hold it steady. Lower your hand to repeat a letter, press Space between words, and Speak when done
        </p>

        {isLoading && (
          <div className="text-center py-8">
            <p className="text-blue-400 text-lg">Loading MediaPipe... Please wait...</p>
          </div>
        )}

        {loadError && (
          <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-400 rounded-xl p-4 mb-4 text-center">
            {loadError}
          </div>
        )}

        {/* Webcam and skeleton - mirrored so it behaves like a mirror (landmarks are unaffected) */}
        <div className="relative bg-gray-800 rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: '16/9' }}>
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
          {currentLetter && (
            <div className="absolute top-4 right-4 bg-blue-600 text-white text-4xl font-bold w-16 h-16 rounded-xl flex items-center justify-center">
              {currentLetter}
            </div>
          )}
        </div>

        {/* Live model readout - shows what the classifier sees right now */}
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-gray-400 text-sm">
              {!handVisible
                ? 'No hand detected — show your hand to the camera'
                : livePrediction
                  ? <>
                      Model sees: <span className="text-white font-bold text-lg">{livePrediction.letter}</span>{' '}
                      <span className={livePrediction.confidence >= livePrediction.threshold ? 'text-green-400' : 'text-yellow-400'}>
                        ({Math.round(livePrediction.confidence * 100)}% confidence, needs {Math.round(livePrediction.threshold * 100)}%)
                      </span>
                    </>
                  : 'Hand detected — waiting for prediction...'}
            </p>
            <span className="text-gray-500 text-xs whitespace-nowrap">Hold steady to confirm</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.round(stabilityProgress * 100)}%` }}
            />
          </div>
          {aiError && (
            <p className="text-red-400 text-sm mt-2">AI service: {aiError}</p>
          )}
        </div>

        {/* Sentence display */}
        <div className="bg-gray-800 rounded-xl p-4 mb-4 min-h-16 flex items-center">
          <p className="text-white text-xl font-medium whitespace-pre-wrap">
            {sentence || <span className="text-gray-500">Your sentence will appear here...</span>}
          </p>
        </div>

        {/* Control buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={addSpace}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
          >
            ␣ Space
          </button>
          <button
            onClick={backspace}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
          >
            ⌫ Backspace
          </button>
          <button
            onClick={clearSentence}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
          >
            ✕ Clear
          </button>
          <button
            onClick={speakSentence}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition duration-200 text-lg"
          >
            🔊 Speak
          </button>
        </div>

        {/* Hearing person section */}
        <div className="bg-gray-800 rounded-2xl p-6">
          <h3 className="text-xl font-semibold mb-2">Hearing Person</h3>
          <p className="text-gray-400 text-sm mb-4">Click the microphone button to speak. The deaf user will see your words as text.</p>

          <div className="bg-gray-700 rounded-xl p-4 min-h-16 mb-4 flex items-center">
            <p className="text-white text-lg">
              {hearingText || <span className="text-gray-500">Spoken words will appear here...</span>}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={startHearingRecognition}
              disabled={recognitionActive}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
            >
              🎤 Start Listening
            </button>
            <button
              onClick={stopHearingRecognition}
              disabled={!recognitionActive}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
            >
              ⏹ Stop Listening
            </button>
            <button
              onClick={() => setHearingText('')}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
            >
              ✕ Clear
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
