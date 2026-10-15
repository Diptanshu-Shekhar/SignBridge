import json
import numpy as np

# Learning mode compares only the 63 normalized landmark coordinates
# (21 points x XYZ) in the browser, so the reference landmarks and their
# thresholds must be built from those 63 values. The 5 curl angles are
# in degrees and would dominate the distance if they were included.
NUM_LANDMARK_FEATURES = 63

# Threshold = mean distance + THRESHOLD_STD x standard deviation.
# 2 standard deviations leaves room for hands that differ slightly
# from the person who collected the training data.
THRESHOLD_STD = 2.0

# Signs collected very steadily get a tiny threshold that other users can
# never meet, and noisy signs (like T) get a huge one that accepts almost
# anything. Keep every threshold inside this range.
MIN_THRESHOLD = 0.3
MAX_THRESHOLD = 1.0


def clean_average(frames_array):
    """Average of all frames after removing the 10% furthest from the mean"""
    mean = frames_array.mean(axis=0)
    distances = np.linalg.norm(frames_array - mean, axis=1)
    percentile_90 = np.percentile(distances, 90)
    clean_frames = frames_array[distances <= percentile_90]
    return clean_frames.mean(axis=0)


def calculate_threshold(frames_array, reference):
    """Mean plus THRESHOLD_STD standard deviations of frame distances from the reference"""
    distances = np.linalg.norm(frames_array - reference, axis=1)
    threshold = np.mean(distances) + THRESHOLD_STD * np.std(distances)
    return float(np.clip(threshold, MIN_THRESHOLD, MAX_THRESHOLD))


def build_reference(data):
    """
    data is the training DataFrame with 68 feature columns and a label column.
    Returns reference landmarks (63 values) and a threshold for each sign.
    """
    reference_landmarks = {}
    thresholds = {}

    for label in data['label'].unique():
        label_data = data[data['label'] == label].drop('label', axis=1)
        frames_array = label_data.values.astype(float)[:, :NUM_LANDMARK_FEATURES]

        reference = clean_average(frames_array)
        reference_landmarks[label] = reference.tolist()
        thresholds[label] = calculate_threshold(frames_array, reference)

    return {
        'landmarks': reference_landmarks,
        'thresholds': thresholds
    }


def save_reference(data, path):
    reference_data = build_reference(data)
    with open(path, 'w') as f:
        json.dump(reference_data, f)
    return reference_data
