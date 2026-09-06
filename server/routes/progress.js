const express = require('express');
const router = express.Router();
const Progress = require('../models/Progress');
const authMiddleware = require('../middleware/auth');

// SAVE PROGRESS
router.post('/save', authMiddleware, async (req, res) => {
  try {
    const { lessonId, signsCorrect, totalSigns } = req.body;
    const userId = req.user.userId;

    // Check if progress already exists for this lesson
    const existingProgress = await Progress.findOne({ userId, lessonId });

    if (existingProgress) {
      // Update existing progress
      existingProgress.signsCorrect = signsCorrect;
      existingProgress.totalSigns = totalSigns;
      existingProgress.completedAt = Date.now();
      await existingProgress.save();

      return res.status(200).json({
        message: 'Progress updated successfully',
        progress: existingProgress
      });
    }

    // Create new progress
    const progress = new Progress({
      userId,
      lessonId,
      signsCorrect,
      totalSigns
    });

    await progress.save();

    res.status(201).json({
      message: 'Progress saved successfully',
      progress
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error saving progress' });
  }
});

// GET USER PROGRESS
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const progress = await Progress.find({ userId: req.params.userId })
      .populate('lessonId', 'title category');

    res.status(200).json({ progress });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching progress' });
  }
});

module.exports = router;