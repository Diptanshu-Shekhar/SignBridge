import pandas as pd
import numpy as np
import pickle
import os
import json
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from utils.normalize import normalize
from utils.features import get_full_features

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landmarks.csv')
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classifier.pkl')
REFERENCE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landmarks_reference.json')

def clean_average(frames_array):
    mean = frames_array.mean(axis=0)
    distances = [np.linalg.norm(f - mean) for f in frames_array]
    percentile_90 = np.percentile(distances, 90)
    clean_frames = [f for f, d in zip(frames_array, distances) if d <= percentile_90]
    return np.array(clean_frames).mean(axis=0)

def calculate_threshold(label_data):
    mean = label_data.mean().values
    distances = []
    for _, row in label_data.iterrows():
        d = np.linalg.norm(row.values - mean)
        distances.append(d)
    return float(np.mean(distances) + np.std(distances))

def train():
    print("Loading dataset...")

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: landmarks.csv not found at {CSV_PATH}")
        print("Please run data_collection.py first")
        return

    data = pd.read_csv(CSV_PATH)
    print(f"Dataset loaded: {len(data)} rows, {len(data.columns)} columns")
    print(f"Signs found: {data['label'].unique()}")
    print(f"Samples per sign:\n{data['label'].value_counts()}")

    # Split features and labels
    X = data.drop('label', axis=1)
    y = data['label']

    # Train test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nTraining samples: {len(X_train)}")
    print(f"Testing samples: {len(X_test)}")

    # Train Random Forest
    print("\nTraining Random Forest classifier...")
    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nTest Accuracy: {accuracy * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    if accuracy < 0.90:
        print("WARNING: Accuracy below 90%. Consider collecting more data.")
    else:
        print("Accuracy above 90% - Good to proceed!")

    # Save classifier
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model, f)
    print(f"\nClassifier saved to {MODEL_PATH}")

    # Generate reference landmarks for learning mode
    print("\nGenerating reference landmarks...")
    reference_landmarks = {}
    thresholds = {}

    for label in data['label'].unique():
        label_data = data[data['label'] == label].drop('label', axis=1)
        frames_array = label_data.values

        # Clean average
        ref = clean_average(frames_array)
        reference_landmarks[label] = ref.tolist()

        # Per sign threshold
        threshold = calculate_threshold(label_data)
        thresholds[label] = threshold

    # Save reference landmarks and thresholds
    reference_data = {
        'landmarks': reference_landmarks,
        'thresholds': thresholds
    }

    with open(REFERENCE_PATH, 'w') as f:
        json.dump(reference_data, f)

    print(f"Reference landmarks saved to {REFERENCE_PATH}")
    print("\nTraining complete!")
    print(f"Signs trained: {list(data['label'].unique())}")

if __name__ == "__main__":
    train()