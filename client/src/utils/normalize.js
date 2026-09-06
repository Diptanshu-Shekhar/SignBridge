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

// Check sign against reference landmark
export function checkSign(userLandmarks, referenceLandmarks, threshold) {
  const userNorm = normalize(userLandmarks);
  const userFlat = flattenLandmarks(userNorm);
  const refFlat = flattenLandmarks(referenceLandmarks);
  const distance = euclideanDistance(userFlat, refFlat);

  if (distance < threshold) {
    return { result: 'correct' };
  } else {
    return {
      result: 'wrong',
      feedback: getDetailedFeedback(userNorm, referenceLandmarks)
    };
  }
}

// Get detailed directional feedback for wrong sign
export function getDetailedFeedback(userNorm, refNorm) {
  const FINGER_POINTS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20]
  };

  let worstFinger = '';
  let worstDistance = 0;

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

  // Determine direction of correction for worst finger
  const tipIndex = FINGER_POINTS[worstFinger][3];
  const userTip = userNorm[tipIndex];
  const refTip = refNorm[tipIndex];

  const yDiff = refTip.y - userTip.y;
  const zDiff = refTip.z - userTip.z;

  let direction = '';
  if (Math.abs(zDiff) > Math.abs(yDiff)) {
    direction = zDiff > 0.1 ? 'should be more curled' : 'should be more extended';
  } else {
    direction = yDiff > 0.1 ? 'should be lower' : 'should be higher';
  }

  return `Your ${worstFinger} finger ${direction}`;
}   