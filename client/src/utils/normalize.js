// This function is the JavaScript version of the Python normalization
// Both must produce identical output - this is critical

export function normalize(landmarks) {
  // Step 1 - subtract wrist point from all points
  const wrist = landmarks[0];
  const relative = landmarks.map(p => ({
    x: p.x - wrist.x,
    y: p.y - wrist.y,
    z: p.z - wrist.z
  }));

  // Step 2 - calculate palm size using point 9
  const point9 = relative[9];
  const palmSize = Math.sqrt(
    point9.x ** 2 +
    point9.y ** 2 +
    point9.z ** 2
  );

  // Step 3 - divide all points by palm size
  if (palmSize === 0) return relative;
  const normalized = relative.map(p => ({
    x: p.x / palmSize,
    y: p.y / palmSize,
    z: p.z / palmSize
  }));

  return normalized;
}

// Convert normalized landmarks to flat array of 63 numbers
export function flattenLandmarks(landmarks) {
  const flat = [];
  landmarks.forEach(p => {
    flat.push(p.x, p.y, p.z);
  });
  return flat;
}

// Calculate euclidean distance between two flat arrays
export function euclideanDistance(arr1, arr2) {
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += (arr1[i] - arr2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// How close the user has to be (as a multiple of the threshold) to get
// "almost there" instead of finger-specific feedback
export const ALMOST_THERE_FACTOR = 1.3;

// Check sign against reference landmark
// Returns { result: 'correct' | 'almost' | 'wrong', distance, feedback }
export function checkSign(userLandmarks, referenceLandmarks, threshold) {
  const userNorm = normalize(userLandmarks);
  const userFlat = flattenLandmarks(userNorm);
  const refFlat = flattenLandmarks(referenceLandmarks);
  const distance = euclideanDistance(userFlat, refFlat);

  if (distance < threshold) {
    return { result: 'correct', distance };
  }
  if (distance < threshold * ALMOST_THERE_FACTOR) {
    return { result: 'almost', distance, feedback: 'Almost there! Adjust slightly and hold steady' };
  }
  return {
    result: 'wrong',
    distance,
    feedback: getDetailedFeedback(userNorm, referenceLandmarks)
  };
}

const FINGER_POINTS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20]
};

// Angle in degrees at point b (180 = straight, smaller = more bent)
function jointAngle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
  if (mag === 0) return 180;
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI);
}

// Total bend of a finger: sum of how far each of its joints (knuckle,
// middle joint, top joint) is from straight. Point 0 is the wrist.
function fingerBend(points, [p1, p2, p3, p4]) {
  return (180 - jointAngle(points[0], points[p1], points[p2])) +
         (180 - jointAngle(points[p1], points[p2], points[p3])) +
         (180 - jointAngle(points[p2], points[p3], points[p4]));
}

// Differences smaller than these count as "close enough"
const BEND_TOLERANCE_DEGREES = 20;
const POSITION_TOLERANCE = 0.15;

// Get detailed directional feedback for wrong sign
export function getDetailedFeedback(userNorm, refNorm) {
  // Find the finger furthest from the reference
  let worstFinger = '';
  let worstDistance = -1;

  for (const [fingerName, points] of Object.entries(FINGER_POINTS)) {
    let fingerDistance = 0;
    points.forEach(idx => {
      const u = userNorm[idx];
      const r = refNorm[idx];
      fingerDistance += (u.x - r.x) ** 2 + (u.y - r.y) ** 2 + (u.z - r.z) ** 2;
    });
    fingerDistance = Math.sqrt(fingerDistance);

    if (fingerDistance > worstDistance) {
      worstDistance = fingerDistance;
      worstFinger = fingerName;
    }
  }

  const points = FINGER_POINTS[worstFinger];
  const fingerLabel = worstFinger === 'thumb' ? 'thumb' : `${worstFinger} finger`;

  // 1. Is the finger bent too much or too little?
  const bendDiff = fingerBend(refNorm, points) - fingerBend(userNorm, points);
  if (bendDiff > BEND_TOLERANCE_DEGREES) {
    return `Your ${fingerLabel} should be more curled`;
  }
  if (bendDiff < -BEND_TOLERANCE_DEGREES) {
    return `Your ${fingerLabel} should be straighter`;
  }

  // 2. Bend is fine - is the fingertip in the wrong place?
  // Image y grows downwards, so a larger reference y means "lower"
  const tip = points[3];
  const yDiff = refNorm[tip].y - userNorm[tip].y;
  if (yDiff > POSITION_TOLERANCE) {
    return `Your ${fingerLabel} should be lower`;
  }
  if (yDiff < -POSITION_TOLERANCE) {
    return `Your ${fingerLabel} should be higher`;
  }

  return `Your ${fingerLabel} is nearly there — check its position against the picture`;
}
