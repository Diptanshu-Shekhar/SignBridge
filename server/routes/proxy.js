const express = require('express');
const router = express.Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

// FORWARD LANDMARKS TO FASTAPI FOR DETECTION
router.post('/detect', authMiddleware, async (req, res) => {
  try {
    const { landmarks, curlAngles } = req.body;

    if (!Array.isArray(landmarks) || landmarks.length !== 63) {
      return res.status(400).json({ message: 'landmarks must be an array of 63 numbers' });
    }

    const response = await axios.post(`${process.env.FASTAPI_URL}/detect`, {
      landmarks,
      curl_angles: curlAngles || []
    }, { timeout: 10000 });

    res.status(200).json(response.data);

  } catch (error) {
    if (error.response) {
      // AI service answered with an error - pass its message on
      const detail = error.response.data?.detail;
      return res.status(502).json({ message: detail || 'AI service returned an error' });
    }
    console.error('AI service unreachable:', error.message);
    res.status(503).json({ message: 'AI service is not running. Start it on port 8000.' });
  }
});

module.exports = router;