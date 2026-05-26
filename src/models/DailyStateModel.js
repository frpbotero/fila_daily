const mongoose = require('mongoose');

const historyEntrySchema = new mongoose.Schema({
  date: String,
  presenter: String,
  action: String,
  justification: String,
}, { _id: false });

const skipSchema = new mongoose.Schema({
  name: String,
  justification: String,
  time: String,
}, { _id: false });

const dailyStateSchema = new mongoose.Schema({
  _id: { type: String },
  participants: [String],
  currentOrder: [String],
  currentIndex: { type: Number, default: 0 },
  dailyActive: { type: Boolean, default: false },
  skips: [skipSchema],
  history: [historyEntrySchema],
});

module.exports = mongoose.model('DailyState', dailyStateSchema);
