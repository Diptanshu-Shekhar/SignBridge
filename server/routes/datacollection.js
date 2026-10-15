const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/auth');

const CSV_PATH = path.join(__dirname, '..', 'browser_landmarks.csv');

// Save a batch of frames
router.post('/savebatch', authMiddleware, async (req, res) => {
  try {
    const { features, label } = req.body;

    if (!Array.isArray(features) || !label) {
      return res.status(400).json({ message: 'Missing features or label' });
    }
    if (!features.every(f => Array.isArray(f) && f.length === 68 && f.every(Number.isFinite))) {
      return res.status(400).json({ message: 'Each frame must have 68 numeric features' });
    }
    if (!/^[A-Za-z0-9_]+$/.test(label)) {
      return res.status(400).json({ message: 'Label may only contain letters, numbers and _' });
    }

    // If file does not exist create it with header
    if (!fs.existsSync(CSV_PATH)) {
      const header = [...Array(68).keys()].map(i => `f${i}`).join(',') + ',label\n';
      fs.writeFileSync(CSV_PATH, header);
    }

    // Append each frame as a row
    const rows = features.map(f => [...f, label].join(',')).join('\n') + '\n';
    fs.appendFileSync(CSV_PATH, rows);

    res.status(200).json({ message: 'Batch saved successfully' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error saving batch' });
  }
});

// Get collection status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    if (!fs.existsSync(CSV_PATH)) {
      return res.status(200).json({ exists: false, rows: 0, labels: {} });
    }

    const content = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = content.trim().split('\n');
    const dataLines = lines.slice(1);

    const labelCount = {};
    dataLines.forEach(line => {
      const parts = line.split(',');
      const label = parts[parts.length - 1];
      if (label && label.trim()) {
        labelCount[label.trim()] = (labelCount[label.trim()] || 0) + 1;
      }
    });

    res.status(200).json({
      exists: true,
      rows: dataLines.length,
      labels: labelCount
    });

  } catch (error) {
    res.status(500).json({ message: 'Error reading status' });
  }
});

module.exports = router;