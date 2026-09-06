const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');
const authMiddleware = require('../middleware/auth');

// GET ALL LESSON CATEGORIES
router.get('/', authMiddleware, async (req, res) => {
  try {
    const lessons = await Lesson.find({}, 'title category signs');

    res.status(200).json({ lessons });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching lessons' });
  }
});

// GET SPECIFIC LESSON WITH LANDMARKS AND THRESHOLDS
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.status(200).json({ lesson });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching lesson' });
  }
});

module.exports = router;