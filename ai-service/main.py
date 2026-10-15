from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pickle
import numpy as np
import pandas as pd
import os

from utils.normalize import normalize
from utils.features import get_full_features, get_extended_features

app = FastAPI()

# CORS configuration - only the Node server calls this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Load classifier if it exists (path works from any working directory)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
classifier = None
classifier_path = os.path.join(BASE_DIR, "model", "classifier.pkl")

if os.path.exists(classifier_path):
    with open(classifier_path, "rb") as f:
        classifier = pickle.load(f)
    print("Classifier loaded successfully")
else:
    print("No classifier found. Train the model first.")

# Column names the classifier was trained with (only older models have them)
feature_names = getattr(classifier, "feature_names_in_", None)

# Older classifiers use 68 features, newer ones the 104 extended features
feature_count = getattr(classifier, "n_features_in_", 68) if classifier is not None else 68
if classifier is not None:
    print(f"Classifier uses {feature_count} features")

# Request models
class DetectRequest(BaseModel):
    landmarks: List[float]
    curl_angles: List[float] = []

# Test route
@app.get("/")
def root():
    return {
        "message": "SignBridge AI service is running",
        "classifier_loaded": classifier is not None,
        "feature_count": feature_count,
        "signs": [str(c) for c in classifier.classes_] if classifier is not None else []
    }

# Detection endpoint
@app.post("/detect")
def detect(request: DetectRequest):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Classifier not trained yet")

    # Reshape landmarks from flat 63 to 21x3
    landmarks_flat = request.landmarks
    if len(landmarks_flat) != 63:
        raise HTTPException(status_code=400, detail=f"Expected 63 landmarks, got {len(landmarks_flat)}")

    landmarks_array = np.array(landmarks_flat).reshape(21, 3)

    # Normalize (the browser already normalizes - doing it again changes nothing)
    normalized = normalize(landmarks_array)

    # Features calculated here from the landmarks - must match train.py
    if feature_count == 68:
        features = get_full_features(normalized)
    else:
        features = get_extended_features(normalized)
    if feature_names is not None:
        features_input = pd.DataFrame([features], columns=feature_names)
    else:
        features_input = np.array(features).reshape(1, -1)

    probabilities = classifier.predict_proba(features_input)[0]
    best = int(np.argmax(probabilities))

    return {
        "letter": str(classifier.classes_[best]),
        "confidence": float(probabilities[best])
    }
