const express = require('express');
const router = express.Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

// FORWARD LANDMARKS TO FASTAPI FOR DETECTION
router.post('/detect', authMiddleware, async (req, res) => {
  try {
    const { landmarks, curlAngles } = req.body;

    const response = await axios.post(`${process.env.FASTAPI_URL}/detect`, {
      landmarks,
      curl_angles: curlAngles
    });

    res.status(200).json(response.data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error communicating with AI service' });
  }
});

module.exports = router;