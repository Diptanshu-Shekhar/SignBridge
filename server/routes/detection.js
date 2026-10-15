const express = require('express');
const router = express.Router();
const DetectionLog = require('../models/DetectionLog');
const authMiddleware = require('../middleware/auth');

// SAVE SPOKEN SENTENCE
router.post('/log', authMiddleware, async (req, res) => {
  try {
    const { sentence } = req.body;
    if (!sentence || !sentence.trim()) {
      return res.status(400).json({ message: 'Sentence is required' });
    }
    const userId = req.user.userId;

    const log = new DetectionLog({
      userId,
      sentence
    });

    await log.save();

    res.status(201).json({
      message: 'Sentence logged successfully',
      log
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error logging sentence' });
  }
});

// GET USER DETECTION LOGS
router.get('/logs/:userId', authMiddleware, async (req, res) => {
  try {
    // Users can only read their own data
    if (req.params.userId !== req.user.userId) {
      return res.status(403).json({ message: 'You can only view your own data' });
    }

    const logs = await DetectionLog.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(20);

    res.status(200).json({ logs });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching logs' });
  }
});

module.exports = router;