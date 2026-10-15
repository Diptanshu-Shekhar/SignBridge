// Copies reference landmarks and thresholds from the AI service into the
// MongoDB Lessons collection so learning mode can compare against them.
//
// Steps after (re)training:
//   1. cd ai-service  ->  python model/generate_reference.py   (or python model/train.py)
//   2. cd server      ->  node seedLandmarks.js
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const Lesson = require('./models/Lesson');

const REFERENCE_PATH = path.join(__dirname, '..', 'ai-service', 'model', 'landmarks_reference.json');
const LANDMARK_VALUES = 63; // 21 points x XYZ - what learning mode compares
// Reference pictures served by the React app from client/public/signs (e.g. /signs/A.jpeg)
const SIGN_IMAGES_DIR = path.join(__dirname, '..', 'client', 'public', 'signs');

async function seedLandmarks() {
  if (!fs.existsSync(REFERENCE_PATH)) {
    console.log(`Reference file not found at ${REFERENCE_PATH}`);
    console.log('Run python model/generate_reference.py in ai-service first');
    process.exit(1);
  }

  const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
  const { landmarks, thresholds } = reference;

  // Make sure the file is in the 63 value format learning mode expects
  for (const [sign, values] of Object.entries(landmarks)) {
    if (values.length !== LANDMARK_VALUES) {
      console.log(`Sign ${sign} has ${values.length} values, expected ${LANDMARK_VALUES}.`);
      console.log('Regenerate the file with python model/generate_reference.py');
      process.exit(1);
    }
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    const lessons = await Lesson.find({});
    let updated = 0;
    const missing = [];

    for (const lesson of lessons) {
      // Older seeds left J out of the Alphabets lesson - add it after I
      if (lesson.category === 'alphabets' && !lesson.signs.some(s => s.word === 'J')) {
        const iIndex = lesson.signs.findIndex(s => s.word === 'I');
        lesson.signs.splice(iIndex + 1, 0, {
          word: 'J',
          referenceImageURL: '/signs/J.jpeg',
          landmarkData: [],
          threshold: 0.15
        });
        console.log('Added missing sign J to Alphabets');
      }

      for (const sign of lesson.signs) {
        const imageFile = `${sign.word}.jpeg`;
        if (fs.existsSync(path.join(SIGN_IMAGES_DIR, imageFile))) {
          sign.referenceImageURL = `/signs/${imageFile}`;
        }

        if (landmarks[sign.word]) {
          sign.landmarkData = landmarks[sign.word];
          sign.threshold = thresholds[sign.word];
          updated++;
        } else {
          missing.push(sign.word);
        }
      }
      await lesson.save();
      console.log(`${lesson.title}: updated`);
    }

    console.log(`\nSigns updated with reference landmarks: ${updated}`);
    if (missing.length > 0) {
      console.log(`Signs with no reference data yet (collect and train them first): ${missing.join(', ')}`);
    }

    const lessonWords = new Set(lessons.flatMap(l => l.signs.map(s => s.word)));
    const notInLessons = Object.keys(landmarks).filter(w => !lessonWords.has(w));
    if (notInLessons.length > 0) {
      console.log(`Trained signs missing from every lesson (add them to seed.js): ${notInLessons.join(', ')}`);
    }
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Done!');
  }
}

seedLandmarks();
