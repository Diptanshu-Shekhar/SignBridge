import cv2
import numpy as np
import csv
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.normalize import normalize
from utils.features import get_full_features

SIGNS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'YES', 'NO', 'HELP', 'PLEASE', 'SORRY',
    'GOOD', 'BAD', 'EAT', 'WATER', 'SLEEP'
]

FRAMES_PER_SIGN = 1000
OUTPUT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'landmarks.csv')

def check_consistency(frames, threshold=0.05):
    frames_array = np.array(frames)
    std = frames_array.std(axis=0).mean()
    if std > threshold:
        return False, std
    return True, std

def save_to_csv(frames_collected, sign):
    mode = 'a' if os.path.exists(OUTPUT_CSV) else 'w'
    with open(OUTPUT_CSV, mode, newline='') as f:
        writer = csv.writer(f)
        if mode == 'w':
            header = [f'f{i}' for i in range(68)] + ['label']
            writer.writerow(header)
        for frame_features in frames_collected:
            writer.writerow(frame_features + [sign])
    print(f"Saved {len(frames_collected)} frames for sign {sign}")

def collect_data():
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hand_landmarker.task')
    if not os.path.exists(model_path):
        print("Downloading hand landmarker model...")
        import urllib.request
        url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        urllib.request.urlretrieve(url, model_path)
        print("Model downloaded successfully")

    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        num_hands=1
    )
    detector = vision.HandLandmarker.create_from_options(options)

    # Check already collected signs
    collected_signs = set()
    if os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, 'r') as f:
            reader = csv.reader(f)
            next(reader)
            for row in reader:
                if row:
                    collected_signs.add(row[-1])
        print(f"Already collected: {collected_signs}")
    else:
        print("Starting fresh data collection")

    cap = cv2.VideoCapture(0)

    for sign in SIGNS:
        if sign in collected_signs:
            print(f"Skipping {sign} - already collected")
            continue

        while True:
            frames_collected = []
            state = 'waiting'  # states: waiting, recording, result

            print(f"\n--- Sign: {sign} ---")
            print("Press SPACE to start | Q to quit")

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame = cv2.flip(frame, 1)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                display_frame = frame.copy()
                h, w, _ = display_frame.shape

                # Run detection
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                result = detector.detect(mp_image)

                # Draw landmarks if detected
                if result.hand_landmarks:
                    hand_landmarks = result.hand_landmarks[0]
                    points_2d = []
                    for lm in hand_landmarks:
                        cx, cy = int(lm.x * w), int(lm.y * h)
                        cv2.circle(display_frame, (cx, cy), 4, (0, 255, 0), -1)
                        points_2d.append((cx, cy))

                    connections = [
                        (0,1),(1,2),(2,3),(3,4),
                        (0,5),(5,6),(6,7),(7,8),
                        (0,9),(9,10),(10,11),(11,12),
                        (0,13),(13,14),(14,15),(15,16),
                        (0,17),(17,18),(18,19),(19,20),
                        (5,9),(9,13),(13,17)
                    ]
                    for start, end in connections:
                        cv2.line(display_frame, points_2d[start], points_2d[end], (0, 150, 255), 2)

                # Show different UI based on state
                if state == 'waiting':
                    cv2.putText(display_frame, f"Sign: {sign}", (10, 40),
                               cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 2)
                    cv2.putText(display_frame, "Check lifeprint.com first", (10, 75),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                    cv2.putText(display_frame, "SPACE = Start  Q = Quit", (10, 110),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                    if result.hand_landmarks:
                        cv2.putText(display_frame, "Hand detected - Ready!", (10, 145),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    else:
                        cv2.putText(display_frame, "Show your hand to camera", (10, 145),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                elif state == 'recording':
                    progress = len(frames_collected)
                    progress_percent = int((progress / FRAMES_PER_SIGN) * 100)

                    cv2.putText(display_frame, f"RECORDING: {sign}", (10, 40),
                               cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 2)
                    cv2.putText(display_frame, f"{progress}/{FRAMES_PER_SIGN} ({progress_percent}%)", (10, 80),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

                    # Progress bar
                    bar_width = 400
                    filled = int((progress / FRAMES_PER_SIGN) * bar_width)
                    cv2.rectangle(display_frame, (10, 95), (10 + bar_width, 115), (50, 50, 50), -1)
                    cv2.rectangle(display_frame, (10, 95), (10 + filled, 115), (0, 255, 0), -1)

                    cv2.putText(display_frame, "Hold sign steady!", (10, 140),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

                    if result.hand_landmarks:
                        hand_landmarks = result.hand_landmarks[0]
                        points = [[lm.x, lm.y, lm.z] for lm in hand_landmarks]
                        normalized = normalize(np.array(points))
                        features = get_full_features(normalized)
                        frames_collected.append(features)
                    
                    # Check if recording complete
                    if len(frames_collected) >= FRAMES_PER_SIGN:
                        state = 'result'

                elif state == 'result':
                    is_consistent, std_value = check_consistency(frames_collected)

                    if is_consistent:
                        cv2.putText(display_frame, "DONE! Consistency: GOOD", (10, 40),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
                    else:
                        cv2.putText(display_frame, "DONE! Consistency: LOW", (10, 40),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 165, 0), 2)
                        cv2.putText(display_frame, "Hand moved too much", (10, 75),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 165, 0), 2)

                    cv2.putText(display_frame, "SPACE = Save & Next", (10, 115),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                    cv2.putText(display_frame, "R = Retake", (10, 150),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 150, 255), 2)
                    cv2.putText(display_frame, "Q = Save & Quit", (10, 185),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

                cv2.imshow('SignBridge Data Collection', display_frame)
                key = cv2.waitKey(1) & 0xFF

                if state == 'waiting':
                    if key == ord(' '):
                        state = 'recording'
                        print("Recording started...")
                    elif key == ord('q'):
                        cap.release()
                        cv2.destroyAllWindows()
                        print("Quit. Progress saved.")
                        return

                elif state == 'result':
                    if key == ord(' '):
                        save_to_csv(frames_collected, sign)
                        collected_signs.add(sign)
                        print(f"Saved {sign}. Moving to next sign.")
                        break
                    elif key == ord('r'):
                        print(f"Retaking {sign}...")
                        frames_collected = []
                        state = 'waiting'
                    elif key == ord('q'):
                        save_to_csv(frames_collected, sign)
                        cap.release()
                        cv2.destroyAllWindows()
                        print("Saved and quit. Progress saved.")
                        return

            if sign in collected_signs:
                break

    cap.release()
    cv2.destroyAllWindows()
    print("\nAll signs collected!")
    print(f"Data saved to {OUTPUT_CSV}")

if __name__ == "__main__":
    collect_data()