// models/DraftUsage.js
const mongoose = require("mongoose");

const DraftUsageSchema = new mongoose.Schema({
  licenseKey: String,
  clientId: String,                // ✅ NEW: Track usage per client
  plan: String,
  variant: String,
  usedCount: Number,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("DraftUsage", DraftUsageSchema);

