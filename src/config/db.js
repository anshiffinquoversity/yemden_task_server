const mongoose = require('mongoose');
const { env } = require('./env');

mongoose.set('strictQuery', true);

const connectDatabase = async () => {
  try {
    await mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 10_000,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = { connectDatabase };
