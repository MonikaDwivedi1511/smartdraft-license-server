const mongoose = require("mongoose");

const EventLogSchema = new mongoose.Schema({
  event: String,
  licenseKey: String,
  plan: String,
  draftId: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("EventLog", EventLogSchema);
