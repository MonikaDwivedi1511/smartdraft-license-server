// models/DraftUsage.js
const mongoose = require("mongoose");

const DraftUsageSchema = new mongoose.Schema({
  licenseKey: String,
  plan: String,
  variant: String,
  usedCount: Number,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("DraftUsage", DraftUsageSchema);
