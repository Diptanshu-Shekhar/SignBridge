import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { normalize, flattenLandmarks } from '../utils/normalize';

export default function DetectMode() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const lastSentRef = useRef(0);
  const stabilityBufferRef = useRef([]);
  const wordTimerRef = useRef(null);
  const signCompletedRef = useRef(false);

  const [sentence, setSentence] = useState('');
  const [currentLetter, setCurrentLetter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [hearingText, setHearingText] = useState('');
  const [recognitionActive, setRecognitionActive] = useState(false);
  const recognitionRef = useRef(null);

  const CONFUSING_PAIRS = ['A', 'S', 'U', 'V', 'M', 'N'];
  const NORMAL_THRESHOLD = 0.75;
  const STRICT_THRESHOLD = 0.90;
  const STABILITY_COUNT = 10;
  const STRICT_STABILITY_COUNT = 15;

  useEffect(() => {
    initMediaPipe();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (handsRef.current) {
      handsRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (wordTimerRef.current) {
      clearTimeout(wordTimerRef.current);
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
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
      setIsLoading(false);

    } catch (error) {
      console.error('MediaPipe initialization error:', error);
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    requestAnimationFrame(processFrame);
  };

  const processFrame = useCallback(async () => {
    if (!handsRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      requestAnimationFrame(processFrame);
      return;
    }

    const now = Date.now();
    const results = handsRef.current.detectForVideo(videoRef.current, now);

    drawSkeleton(results);

    if (results.landmarks && results.landmarks.length > 0) {
      if (now - lastSentRef.current > 250) {
        lastSentRef.current = now;
        await sendToClassifier(results.landmarks[0]);
      }
    } else {
      setCurrentLetter('');
      stabilityBufferRef.current = [];
    }

    requestAnimationFrame(processFrame);
  }, []);

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
    try {
      const normalized = normalize(landmarks);
      const flat = flattenLandmarks(normalized);

      const response = await axios.post(
        'http://localhost:5000/ai/detect',
        { landmarks: flat, curlAngles: [] },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { letter, confidence } = response.data;
      const threshold = CONFUSING_PAIRS.includes(letter) ? STRICT_THRESHOLD : NORMAL_THRESHOLD;
      const stabilityCount = CONFUSING_PAIRS.includes(letter) ? STRICT_STABILITY_COUNT : STABILITY_COUNT;

      if (confidence >= threshold) {
        stabilityBufferRef.current.push(letter);
        if (stabilityBufferRef.current.length > stabilityCount) {
          stabilityBufferRef.current.shift();
        }

        const allSame = stabilityBufferRef.current.length === stabilityCount &&
          stabilityBufferRef.current.every(l => l === letter);

        if (allSame && !signCompletedRef.current) {
          signCompletedRef.current = true;
          setCurrentLetter(letter);
          setSentence(prev => prev + letter);
          stabilityBufferRef.current = [];

          if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
          wordTimerRef.current = setTimeout(() => {
            setSentence(prev => prev + ' ');
            signCompletedRef.current = false;
          }, 1500);
        }
      } else {
        stabilityBufferRef.current = [];
      }

    } catch (error) {
      console.error('Classifier error:', error);
    }
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
      'http://localhost:5000/detection/log',
      { sentence: sentence.trim() },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setSentence('');
    setCurrentLetter('');
    signCompletedRef.current = false;
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
        <p className="text-gray-400 text-center mb-8">Sign into the webcam and press Speak when done</p>

        {isLoading && (
          <div className="text-center py-8">
            <p className="text-blue-400 text-lg">Loading MediaPipe... Please wait...</p>
          </div>
        )}

        {/* Webcam and skeleton */}
        <div className="relative bg-gray-800 rounded-2xl overflow-hidden mb-6" style={{ aspectRatio: '16/9' }}>
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
          {currentLetter && (
            <div className="absolute top-4 right-4 bg-blue-600 text-white text-4xl font-bold w-16 h-16 rounded-xl flex items-center justify-center">
              {currentLetter}
            </div>
          )}
        </div>

        {/* Sentence display */}
        <div className="bg-gray-800 rounded-xl p-4 mb-4 min-h-16 flex items-center">
          <p className="text-white text-xl font-medium">
            {sentence || <span className="text-gray-500">Your sentence will appear here...</span>}
          </p>
        </div>

        {/* Control buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setSentence(prev => prev.slice(0, -1))}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition duration-200"
          >
            ⌫ Backspace
          </button>
          <button
            onClick={() => { setSentence(''); setCurrentLetter(''); }}
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