import numpy as np

def normalize(landmarks):
    """
    Two step normalization:
    Step 1 - subtract wrist point from all points
    Step 2 - divide by palm size (distance from wrist to point 9)
    This must produce identical output to the JavaScript version
    """
    landmarks = np.array(landmarks)
    
    # Step 1 - subtract wrist point
    wrist = landmarks[0]
    relative = landmarks - wrist
    
    # Step 2 - calculate palm size using point 9
    palm_size = np.linalg.norm(relative[9])
    
    # Step 3 - divide by palm size
    if palm_size == 0:
        return relative
    
    normalized = relative / palm_size
    return normalized

def flatten_landmarks(landmarks):
    """Convert 21x3 array to flat array of 63 numbers"""
    return np.array(landmarks).flatten().tolist()

def landmarks_to_input(landmarks):
    """
    Full pipeline - normalize and flatten landmarks
    ready for classifier input
    """
    normalized = normalize(landmarks)
    return flatten_landmarks(normalized)