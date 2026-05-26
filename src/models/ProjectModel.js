const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  webhookUrl: { type: String, required: true },
  cronSchedule: { type: String, default: '0 9 * * 1-5' },
  createdAt: { type: String },
});

module.exports = mongoose.model('Project', projectSchema);
