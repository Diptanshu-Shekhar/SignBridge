const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
// In production set CLIENT_URL (comma separated) to the Vercel URL(s)
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(o => o.trim())
  : '*';
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '5mb' }));

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'SignBridge server is running' });
});

// Routes will be added here later
const authRoutes = require('./routes/auth');
const lessonRoutes = require('./routes/lessons');
const progressRoutes = require('./routes/progress');
const detectionRoutes = require('./routes/detection');
const proxyRoutes = require('./routes/proxy');

app.use('/auth', authRoutes);
app.use('/lessons', lessonRoutes);
app.use('/progress', progressRoutes);
app.use('/detection', detectionRoutes);
app.use('/ai', proxyRoutes);
const dataCollectionRoutes = require('./routes/datacollection');
app.use('/datacollection', dataCollectionRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.log('MongoDB connection error:', err));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});