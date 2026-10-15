// Backend URL. Set REACT_APP_API_URL in client/.env for production (e.g. the Render URL)
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Pinned MediaPipe version - must match the version used for data collection
export const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
export const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
