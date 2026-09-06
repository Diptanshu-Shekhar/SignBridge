from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pickle
import numpy as np
import os

from utils.normalize import normalize, landmarks_to_input
from utils.features import get_full_features, extract_curl_angles

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Load classifier if it exists
classifier = None
classifier_path = os.path.join("model", "classifier.pkl")

if os.path.exists(classifier_path):
    with open(classifier_path, "rb") as f:
        classifier = pickle.load(f)
    print("Classifier loaded successfully")
else:
    print("No classifier found. Train the model first.")

# Request models
class DetectRequest(BaseModel):
    landmarks: List[float]
    curl_angles: List[float] = []

# Test route
@app.get("/")
def root():
    return {"message": "SignBridge AI service is running"}

# Detection endpoint
@app.post("/detect")
def detect(request: DetectRequest):
    try:
        if classifier is None:
            return {"error": "Classifier not trained yet"}

        # Reshape landmarks from flat 63 to 21x3
        landmarks_flat = request.landmarks
        if len(landmarks_flat) != 63:
            return {"error": f"Expected 63 landmarks, got {len(landmarks_flat)}"}

        landmarks_array = np.array(landmarks_flat).reshape(21, 3)

        # Normalize
        normalized = normalize(landmarks_array)

        # Get full features including curl angles
        features = get_full_features(normalized)

        # Predict
        features_array = np.array(features).reshape(1, -1)
        prediction = classifier.predict(features_array)[0]
        probabilities = classifier.predict_proba(features_array)[0]
        confidence = float(max(probabilities))

        return {
            "letter": str(prediction),
            "confidence": confidence
        }

    except Exception as e:
        return {"error": str(e)}