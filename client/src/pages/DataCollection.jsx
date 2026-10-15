import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { normalize, flattenLandmarks } from '../utils/normalize';
import { API_URL, MEDIAPIPE_WASM_URL, HAND_MODEL_URL } from '../config';


const SIGNS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z'
];

const FRAMES_PER_SIGN = 1000;

export default function DataCollection() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const frameBufferRef = useRef([]);
  const animFrameRef = useRef(null);

  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [state, setState] = useState('waiting'); // waiting, recording, result, done
  const [progress, setProgress] = useState(0);
  const [isConsistent, setIsConsistent] = useState(true);
  const [collectedSigns, setCollectedSigns] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchStatus();
    initMediaPipe();
    return () => cleanup();
  }, []);
  useEffect(() => {
    if (!isLoading && handsRef.current && videoRef.current) {
        startCamera();
    }
}, [isLoading]);

  const cleanup = () => {
    if (handsRef.current) handsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/datacollection/status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.labels) {
        setCollectedSigns(res.data.labels);
        // Start on the first sign not yet collected with enough frames
        const firstNotDone = SIGNS.findIndex(s => !res.data.labels[s] || res.data.labels[s] < FRAMES_PER_SIGN);
        if (firstNotDone !== -1) setCurrentSignIndex(firstNotDone);
      }
    } catch (e) {
      console.error('Status fetch error:', e);
    }
  };

  const initMediaPipe = async () => {
    try {
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
  MEDIAPIPE_WASM_URL
);
      handsRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_URL,
          delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
      });
     
      setIsLoading(false);
    } catch (error) {
      console.error('MediaPipe error:', error);
      setIsLoading(false);
    }
  };


 const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true
    });

    streamRef.current = stream;

    if (!videoRef.current) {
        console.error('Video element is not ready');
        stream.getTracks().forEach(track => track.stop());
        return;
    }

    videoRef.current.srcObject = stream;

    await videoRef.current.play();

    animFrameRef.current = requestAnimationFrame(processFrame);
};

  const processFrame = useCallback(() => {
    if (!handsRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = Date.now();
    const results = handsRef.current.detectForVideo(videoRef.current, now);
    drawSkeleton(results);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];

      // Only collect frames when in recording state
      if (frameBufferRef.current !== null) {
        const normalized = normalize(landmarks);
        const flat = flattenLandmarks(normalized);
        const curls = calculateCurlAngles(normalized);
        const features = [...flat, ...curls];

        if (features.length === 68) {
          frameBufferRef.current.push(features);
          const currentProgress = frameBufferRef.current.length;
          setProgress(currentProgress);

          if (currentProgress >= FRAMES_PER_SIGN) {
            const frames = [...frameBufferRef.current];
            frameBufferRef.current = null; // stop collecting
            checkConsistencyAndFinish(frames);
          }
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, []);

  const calculateCurlAngles = (landmarks) => {
    const FINGER_POINTS = [
      [1, 2, 3], [5, 6, 7], [9, 10, 11], [13, 14, 15], [17, 18, 19]
    ];
    return FINGER_POINTS.map(([a, b, c]) => {
      const p1 = landmarks[a];
      const p2 = landmarks[b];
      const p3 = landmarks[c];
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
      const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
      if (mag1 === 0 || mag2 === 0) return 0;
      return Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2)))) * (180 / Math.PI);
    });
  };

  const checkConsistencyAndFinish = (frames) => {
    const mean = frames[0].map((_, i) => frames.reduce((s, f) => s + f[i], 0) / frames.length);
    const distances = frames.map(f => Math.sqrt(f.reduce((s, v, i) => s + (v - mean[i]) ** 2, 0)));
    const std = Math.sqrt(distances.reduce((s, d) => s + d ** 2, 0) / distances.length);
    setIsConsistent(std < 0.5);
    frameBufferRef.current = frames;
    setState('result');
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
        [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
      ];
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      connections.forEach(([s, e]) => {
        ctx.beginPath();
        ctx.moveTo(landmarks[s].x * canvas.width, landmarks[s].y * canvas.height);
        ctx.lineTo(landmarks[e].x * canvas.width, landmarks[e].y * canvas.height);
        ctx.stroke();
      });
      ctx.fillStyle = '#60A5FA';
      landmarks.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  const selectSign = (index) => {
    if (state === 'recording' || isSaving) return;
    setCurrentSignIndex(index);
    frameBufferRef.current = [];
    setProgress(0);
    setState('waiting');
  };

  const startRecording = () => {
    const existing = collectedSigns[SIGNS[currentSignIndex]] || 0;
    if (existing > 0) {
      const ok = window.confirm(
        `${SIGNS[currentSignIndex]} already has ${existing} frames. New frames will be ADDED to them, not replace them.\n\n` +
        `To replace them, cancel and run "node deletesign.js ${SIGNS[currentSignIndex]}" in the server folder first.\n\nAdd more frames anyway?`
      );
      if (!ok) return;
    }
    frameBufferRef.current = [];
    setProgress(0);
    setState('recording');
  };

  const handleSave = async () => {
    setIsSaving(true);
    const frames = frameBufferRef.current;
    const sign = SIGNS[currentSignIndex];

    try {
      // Save in batches of 100 to avoid request size issues
      for (let i = 0; i < frames.length; i += 100) {
        const batch = frames.slice(i, i + 100);
        await axios.post(`${API_URL}/datacollection/savebatch`,
          { features: batch, label: sign },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      const updated = { ...collectedSigns, [sign]: (collectedSigns[sign] || 0) + frames.length };
      setCollectedSigns(updated);

      // Move to the next sign that still needs frames, if any
      const remaining = SIGNS.map((s, i) => i).filter(i => (updated[SIGNS[i]] || 0) < FRAMES_PER_SIGN);
      const next = remaining.find(i => i > currentSignIndex) ?? remaining[0];
      if (next === undefined) {
        setState('done');
      } else {
        setCurrentSignIndex(next);
        frameBufferRef.current = [];
        setProgress(0);
        setState('waiting');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Error saving data. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetake = () => {
    frameBufferRef.current = [];
    setProgress(0);
    setState('waiting');
  };

  const currentSign = SIGNS[currentSignIndex];
  const progressPercent = Math.round((progress / FRAMES_PER_SIGN) * 100);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-xl">Loading MediaPipe... Please wait...</p>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center bg-gray-800 rounded-2xl p-10">
          <p className="text-6xl mb-4">🎉</p>
          <h2 className="text-3xl font-bold mb-2">All signs collected!</h2>
          <p className="text-gray-400 mb-6">Copy server/browser_landmarks.csv to ai-service/model/ and run python model/train.py</p>
          <div className="flex gap-4 justify-center">
            <button onClick={() => setState('waiting')}
              className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-xl font-semibold">
              Pick a letter
            </button>
            <button onClick={() => navigate('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-blue-400">SignBridge — Data Collection</h1>
        <button onClick={() => navigate('/dashboard')}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">
          Exit
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Progress overview */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <p className="text-gray-400 text-sm mb-2">
            Overall Progress — {SIGNS.filter(s => collectedSigns[s] >= FRAMES_PER_SIGN).length} of {SIGNS.length} signs collected.
            Click a letter to collect it.
          </p>
          <div className="flex flex-wrap gap-2">
            {SIGNS.map((s, i) => (
              <button
                key={s}
                onClick={() => selectSign(i)}
                disabled={state === 'recording' || isSaving}
                title={`${collectedSigns[s] || 0} frames`}
                className={`px-2 py-1 rounded text-sm font-bold disabled:cursor-not-allowed ${
                  i === currentSignIndex ? 'bg-blue-600 text-white ring-2 ring-blue-300' :
                  collectedSigns[s] >= FRAMES_PER_SIGN ? 'bg-green-600 text-white' :
                  'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {s}
                <span className="block text-[10px] font-normal opacity-80">{collectedSigns[s] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Current sign */}
        <h2 className="text-4xl font-bold text-center mb-2">
          Sign: <span className="text-blue-400">{currentSign}</span>
        </h2>
        <p className="text-center text-gray-400 mb-6">
          Check <a href="https://www.lifeprint.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">lifeprint.com</a> for correct hand position
        </p>

        {/* Webcam */}
        <div className="relative bg-gray-800 rounded-2xl overflow-hidden mb-6" style={{ aspectRatio: '16/9' }}>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />

          {state === 'recording' && (
            <div className="absolute top-4 left-4 right-4">
              <div className="bg-black bg-opacity-60 rounded-xl p-3">
                <p className="text-white text-center mb-2">{progress} / {FRAMES_PER_SIGN} frames ({progressPercent}%)</p>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full transition-all"
                    style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        {state === 'waiting' && (
          <div className="text-center">
            <p className="text-gray-400 mb-2">Position your hand making sign <strong className="text-white">{currentSign}</strong> and press Start</p>
            <p className="text-gray-500 text-sm mb-4">
              While recording, keep the hand shape exact but slowly move: closer and farther, left and right, small wrist tilts.
              This teaches the model the sign from many angles.
            </p>
            <button onClick={startRecording}
              className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-xl font-semibold text-lg">
              ▶ Start Recording
            </button>
          </div>
        )}

        {state === 'recording' && (
          <div className="text-center">
            <p className="text-red-400 text-lg font-semibold animate-pulse">🔴 Recording... Keep the shape, move slowly!</p>
          </div>
        )}

        {state === 'result' && (
          <div className="text-center">
            <div className={`rounded-xl p-4 mb-6 ${isConsistent ? 'bg-green-500 bg-opacity-20 border border-green-500' : 'bg-yellow-500 bg-opacity-20 border border-yellow-500'}`}>
              <p className={`text-lg font-semibold ${isConsistent ? 'text-green-400' : 'text-yellow-400'}`}>
                {isConsistent ? '✅ Consistency: Good' : '⚠️ Consistency: Low — hand moved a bit'}
              </p>
              <p className="text-gray-400 text-sm mt-1">You can still save and move on — small movement is okay</p>
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={handleRetake}
                className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-xl font-semibold">
                🔄 Retake
              </button>
              <button onClick={handleSave} disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold">
                {isSaving ? 'Saving...' : '✅ Save & Next'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}