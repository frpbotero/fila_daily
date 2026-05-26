const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function connect() {
  if (!MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI não configurada — estado não será persistido');
    return;
  }
  await mongoose.connect(MONGODB_URI);
  console.log('✅ MongoDB conectado');
}

module.exports = { connect };
