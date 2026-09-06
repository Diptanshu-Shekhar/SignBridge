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