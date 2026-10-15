import pandas as pd
import numpy as np
import pickle
import os
import json
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from utils.features import get_extended_features_batch
from model.reference import save_reference

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'browser_landmarks.csv')
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'classifier.pkl')
REFERENCE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landmarks_reference.json')
N_TREES = 200

def train():
    print("Loading dataset...")

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: browser_landmarks.csv not found at {CSV_PATH}")
        print("Collect data at localhost:3000/datacollection and copy server/browser_landmarks.csv here")
        return

    data = pd.read_csv(CSV_PATH, low_memory=False)
    data['label'] = data['label'].astype(str)
    data = data[data['label'] != 'label']

    print(f"Dataset loaded: {len(data)} rows, {len(data.columns)} columns")
    print(f"Signs found: {data['label'].unique()}")
    print(f"Samples per sign:\n{data['label'].value_counts()}")

    # Warn about signs with too few frames (for example a deleted sign not yet recollected)
    counts = data['label'].value_counts()
    low = counts[counts < 500]
    if len(low) > 0:
        print(f"\nWARNING: these signs have fewer than 500 frames: {dict(low)}")

    # Extended features (104) calculated from the 63 landmark values.
    # main.py calculates exactly the same features during detection.
    X = get_extended_features_batch(data.drop('label', axis=1).values.astype(float)[:, :63])
    y = data['label'].values

    # Honest evaluation: for each sign, train on the first 80% of its frames and
    # test on the last 20%. A random split would put almost identical neighbouring
    # video frames in both sets and report an unrealistically high accuracy.
    train_idx, test_idx = [], []
    for label in pd.unique(y):
        idx = np.where(y == label)[0]
        cut = int(len(idx) * 0.8)
        train_idx.extend(idx[:cut])
        test_idx.extend(idx[cut:])

    print(f"\nTraining samples: {len(train_idx)}")
    print(f"Testing samples: {len(test_idx)}")

    print("\nTraining Random Forest classifier for evaluation...")
    eval_model = RandomForestClassifier(n_estimators=N_TREES, random_state=42, n_jobs=-1)
    eval_model.fit(X[train_idx], y[train_idx])

    y_test = y[test_idx]
    y_pred = eval_model.predict(X[test_idx])
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nTest Accuracy (held-out end of each recording): {accuracy * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    if accuracy < 0.90:
        print("WARNING: Accuracy below 90%. Consider recollecting the weakest signs above.")
    else:
        print("Accuracy above 90% - Good to proceed!")

    # Final model is trained on all frames
    print("\nTraining final classifier on all data...")
    model = RandomForestClassifier(n_estimators=N_TREES, random_state=42, n_jobs=-1)
    model.fit(X, y)

    # Save classifier
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model, f)
    print(f"\nClassifier saved to {MODEL_PATH}")

    # Generate reference landmarks for learning mode (63 landmark values per sign)
    print("\nGenerating reference landmarks...")
    save_reference(data, REFERENCE_PATH)

    print(f"Reference landmarks saved to {REFERENCE_PATH}")
    print("\nTraining complete!")
    print(f"Signs trained: {list(data['label'].unique())}")

if __name__ == "__main__":
    train()
