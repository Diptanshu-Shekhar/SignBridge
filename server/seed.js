const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Lesson = require('./models/Lesson');

const lessons = [
  {
    title: 'Alphabets',
    category: 'alphabets',
    signs: [
      { word: 'A', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/a/a.gif', landmarkData: [], threshold: 0.15 },
      { word: 'B', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/b/b.gif', landmarkData: [], threshold: 0.15 },
      { word: 'C', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/c/c.gif', landmarkData: [], threshold: 0.15 },
      { word: 'D', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/d/d.gif', landmarkData: [], threshold: 0.15 },
      { word: 'E', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/e/e.gif', landmarkData: [], threshold: 0.15 },
      { word: 'F', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/f/f.gif', landmarkData: [], threshold: 0.15 },
      { word: 'G', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/g/g.gif', landmarkData: [], threshold: 0.15 },
      { word: 'H', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/h/h.gif', landmarkData: [], threshold: 0.15 },
      { word: 'I', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/i/i.gif', landmarkData: [], threshold: 0.15 },
      { word: 'K', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/k/k.gif', landmarkData: [], threshold: 0.15 },
      { word: 'L', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/l/l.gif', landmarkData: [], threshold: 0.15 },
      { word: 'M', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/m/m.gif', landmarkData: [], threshold: 0.15 },
      { word: 'N', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/n/n.gif', landmarkData: [], threshold: 0.15 },
      { word: 'O', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/o/o.gif', landmarkData: [], threshold: 0.15 },
      { word: 'P', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/p/p.gif', landmarkData: [], threshold: 0.15 },
      { word: 'Q', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/q/q.gif', landmarkData: [], threshold: 0.15 },
      { word: 'R', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/r/r.gif', landmarkData: [], threshold: 0.15 },
      { word: 'S', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/s/s.gif', landmarkData: [], threshold: 0.15 },
      { word: 'T', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/t/t.gif', landmarkData: [], threshold: 0.15 },
      { word: 'U', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/u/u.gif', landmarkData: [], threshold: 0.15 },
      { word: 'V', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/v/v.gif', landmarkData: [], threshold: 0.15 },
      { word: 'W', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/w/w.gif', landmarkData: [], threshold: 0.15 },
      { word: 'X', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/x/x.gif', landmarkData: [], threshold: 0.15 },
      { word: 'Y', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/y/y.gif', landmarkData: [], threshold: 0.15 },
      { word: 'Z', referenceImageURL: 'https://www.lifeprint.com/asl101/gifs/z/z.gif', landmarkData: [], threshold: 0.15 },
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
    console.log('Total lessons created: 3');
    console.log('Alphabets: 25 signs');
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