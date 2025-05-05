const mongoose = require("mongoose");

const QuotaLogSchema = new mongoose.Schema({
  licenseKey: String,
  plan: String,
  usedCount: Number,
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("QuotaLog", QuotaLogSchema);
