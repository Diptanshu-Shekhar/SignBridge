"""
Regenerate landmarks_reference.json from browser_landmarks.csv without
retraining the classifier. Run from the ai-service folder:

    python model/generate_reference.py

Then run "node seedLandmarks.js" in the server folder to copy it into MongoDB.
"""
import os
import sys

import pandas as pd

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from reference import save_reference

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(MODEL_DIR, 'browser_landmarks.csv')
REFERENCE_PATH = os.path.join(MODEL_DIR, 'landmarks_reference.json')

if __name__ == "__main__":
    data = pd.read_csv(CSV_PATH, low_memory=False)
    data['label'] = data['label'].astype(str)
    data = data[data['label'] != 'label']

    reference_data = save_reference(data, REFERENCE_PATH)

    print(f"Reference landmarks saved to {REFERENCE_PATH}")
    for label, threshold in sorted(reference_data['thresholds'].items()):
        print(f"  {label}: {len(reference_data['landmarks'][label])} values, threshold {threshold:.3f}")
