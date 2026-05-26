const mongoose = require('mongoose');

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️  MONGODB_URI não configurada — estado não será persistido');
    return;
  }
  await mongoose.connect(uri, {
    tls: true,
    serverSelectionTimeoutMS: 10000,
  });
  console.log('✅ MongoDB conectado');
}

module.exports = { connect };
