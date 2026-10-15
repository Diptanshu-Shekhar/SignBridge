import numpy as np

FINGER_POINTS = {
    "thumb":  [1, 2, 3, 4],
    "index":  [5, 6, 7, 8],
    "middle": [9, 10, 11, 12],
    "ring":   [13, 14, 15, 16],
    "pinky":  [17, 18, 19, 20]
}

def calculate_finger_curl(landmarks, finger_points):
    """
    Calculate curl angle for a finger using three joints
    Returns angle in degrees
    """
    try:
        p1 = np.array(landmarks[finger_points[0]])
        p2 = np.array(landmarks[finger_points[1]])
        p3 = np.array(landmarks[finger_points[2]])
        
        v1 = p1 - p2
        v2 = p3 - p2
        
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        cosine = np.dot(v1, v2) / (norm1 * norm2)
        cosine = np.clip(cosine, -1.0, 1.0)
        angle = np.degrees(np.arccos(cosine))
        return float(angle)
    except:
        return 0.0

def extract_curl_angles(landmarks):
    """
    Extract curl angles for all 5 fingers
    Returns list of 5 angles
    """
    angles = []
    for finger_name, points in FINGER_POINTS.items():
        angle = calculate_finger_curl(landmarks, points)
        angles.append(angle)
    return angles

def get_full_features(normalized_landmarks):
    """
    Combine normalized landmarks with curl angles
    Returns full feature vector for classifier
    63 landmark values + 5 curl angles = 68 features total
    """
    flat = np.array(normalized_landmarks).flatten().tolist()
    curl_angles = extract_curl_angles(normalized_landmarks)
    return flat + curl_angles

# ---------------------------------------------------------------------------
# Extended hand-shape features (version 2 classifier)
# These help separate signs that differ mainly by thumb position or finger
# spacing, like A/S, O/C, T/N and U/V. They are all calculated from the 63
# normalized landmark values, so no new data collection is needed for them.
# ---------------------------------------------------------------------------

FINGERTIPS = [4, 8, 12, 16, 20]

# Thumb tip to the knuckles and middle joints of the other fingers
THUMB_TARGETS = [5, 6, 9, 10, 13, 14, 17]

# Joint angles: two per finger (including the thumb tip joint) plus knuckle bends
JOINT_CHAINS = [
    (1, 2, 3), (2, 3, 4),
    (5, 6, 7), (6, 7, 8),
    (9, 10, 11), (10, 11, 12),
    (13, 14, 15), (14, 15, 16),
    (17, 18, 19), (18, 19, 20),
    (0, 5, 6), (0, 9, 10), (0, 13, 14), (0, 17, 18)
]

# Same three joints as extract_curl_angles, so the first 68 features are unchanged
CURL_CHAINS = [tuple(points[:3]) for points in FINGER_POINTS.values()]


def _angles(points, chains):
    """Angle in degrees at the middle joint of each chain, for a batch of hands"""
    angles = []
    for a, b, c in chains:
        v1 = points[:, a] - points[:, b]
        v2 = points[:, c] - points[:, b]
        norm = np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1)
        cosine = np.where(norm == 0, 1.0, (v1 * v2).sum(axis=1) / np.where(norm == 0, 1.0, norm))
        angle = np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0)))
        angles.append(np.where(norm == 0, 0.0, angle))
    return np.stack(angles, axis=1)


def get_extended_features_batch(normalized_batch):
    """
    normalized_batch: array of shape (N, 21, 3) or (N, 63) of normalized landmarks.
    Returns array of shape (N, 104):
      63 landmarks + 5 curl angles (same as before)
      + 10 fingertip-to-fingertip distances
      + 7 thumb-tip-to-joint distances
      + 14 joint angles
      + 5 fingertip-to-wrist distances
    """
    points = np.asarray(normalized_batch, dtype=float).reshape(-1, 21, 3)
    flat = points.reshape(-1, 63)
    curls = _angles(points, CURL_CHAINS)

    tip_pairs = [(a, b) for i, a in enumerate(FINGERTIPS) for b in FINGERTIPS[i + 1:]]
    tip_distances = np.stack([np.linalg.norm(points[:, a] - points[:, b], axis=1) for a, b in tip_pairs], axis=1)
    thumb_distances = np.stack([np.linalg.norm(points[:, 4] - points[:, j], axis=1) for j in THUMB_TARGETS], axis=1)
    joint_angles = _angles(points, JOINT_CHAINS)
    tip_extension = np.stack([np.linalg.norm(points[:, t], axis=1) for t in FINGERTIPS], axis=1)

    return np.hstack([flat, curls, tip_distances, thumb_distances, joint_angles, tip_extension])


def get_extended_features(normalized_landmarks):
    """Extended features for a single hand (21x3 normalized landmarks)"""
    return get_extended_features_batch([normalized_landmarks])[0].tolist()


EXTENDED_FEATURE_COUNT = 104
