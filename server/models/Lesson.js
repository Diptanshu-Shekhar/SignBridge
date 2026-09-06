const mongoose = require('mongoose');

const signSchema = new mongoose.Schema({
  word: String,
  referenceImageURL: String,
  landmarkData: [Number],
  threshold: Number
});

const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['alphabets', 'numbers', 'basic_words'],
    required: true
  },
  signs: [signSchema]
});

module.exports = mongoose.model('Lesson', lessonSchema);