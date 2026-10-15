const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Lesson = require('./models/Lesson');

const lessons = [
  {
    title: 'Alphabets',
    category: 'alphabets',
    signs: [
      { word: 'A', referenceImageURL: '/signs/A.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'B', referenceImageURL: '/signs/B.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'C', referenceImageURL: '/signs/C.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'D', referenceImageURL: '/signs/D.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'E', referenceImageURL: '/signs/E.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'F', referenceImageURL: '/signs/F.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'G', referenceImageURL: '/signs/G.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'H', referenceImageURL: '/signs/H.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'I', referenceImageURL: '/signs/I.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'J', referenceImageURL: '/signs/J.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'K', referenceImageURL: '/signs/K.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'L', referenceImageURL: '/signs/L.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'M', referenceImageURL: '/signs/M.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'N', referenceImageURL: '/signs/N.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'O', referenceImageURL: '/signs/O.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'P', referenceImageURL: '/signs/P.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'Q', referenceImageURL: '/signs/Q.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'R', referenceImageURL: '/signs/R.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'S', referenceImageURL: '/signs/S.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'T', referenceImageURL: '/signs/T.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'U', referenceImageURL: '/signs/U.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'V', referenceImageURL: '/signs/V.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'W', referenceImageURL: '/signs/W.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'X', referenceImageURL: '/signs/X.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'Y', referenceImageURL: '/signs/Y.jpeg', landmarkData: [], threshold: 0.15 },
      { word: 'Z', referenceImageURL: '/signs/Z.jpeg', landmarkData: [], threshold: 0.15 },
    ]
  },
  {
    title: 'Numbers',
    category: 'numbers',
    signs: [
      { word: '0', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/0/0.gif', landmarkData: [], threshold: 0.15 },
      { word: '1', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/1/1.gif', landmarkData: [], threshold: 0.15 },
      { word: '2', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/2/2.gif', landmarkData: [], threshold: 0.15 },
      { word: '3', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/3/3.gif', landmarkData: [], threshold: 0.15 },
      { word: '4', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/4/4.gif', landmarkData: [], threshold: 0.15 },
      { word: '5', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/5/5.gif', landmarkData: [], threshold: 0.15 },
      { word: '6', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/6/6.gif', landmarkData: [], threshold: 0.15 },
      { word: '7', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/7/7.gif', landmarkData: [], threshold: 0.15 },
      { word: '8', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/8/8.gif', landmarkData: [], threshold: 0.15 },
      { word: '9', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/9/9.gif', landmarkData: [], threshold: 0.15 },
    ]
  },
  {
    title: 'Basic Words',
    category: 'basic_words',
    signs: [
      { word: 'YES', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/y/yes.gif', landmarkData: [], threshold: 0.15 },
      { word: 'NO', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/n/no.gif', landmarkData: [], threshold: 0.15 },
      { word: 'HELP', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/h/help.gif', landmarkData: [], threshold: 0.15 },
      { word: 'PLEASE', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/p/please.gif', landmarkData: [], threshold: 0.15 },
      { word: 'SORRY', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/s/sorry.gif', landmarkData: [], threshold: 0.15 },
      { word: 'GOOD', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/g/good.gif', landmarkData: [], threshold: 0.15 },
      { word: 'BAD', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/b/bad.gif', landmarkData: [], threshold: 0.15 },
      { word: 'EAT', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/e/eat.gif', landmarkData: [], threshold: 0.15 },
      { word: 'WATER', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/w/water.gif', landmarkData: [], threshold: 0.15 },
      { word: 'SLEEP', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/s/sleep.gif', landmarkData: [], threshold: 0.15 },
    ]
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // Clear existing lessons
    await Lesson.deleteMany({});
    console.log('Cleared existing lessons');

    // Insert new lessons
    await Lesson.insertMany(lessons);
    console.log('Lessons seeded successfully');
    console.log('Now run node seedLandmarks.js to add reference landmarks');
    console.log('Total lessons created: 3');
    console.log('Alphabets: 26 signs');
    console.log('Numbers: 10 signs');
    console.log('Basic Words: 10 signs');

    mongoose.connection.close();
    console.log('Done!');

  } catch (error) {
    console.error('Seeding error:', error);
    mongoose.connection.close();
  }
}

seed();