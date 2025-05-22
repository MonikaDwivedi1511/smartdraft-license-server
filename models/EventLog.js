const mongoose = require("mongoose");

const EventLogSchema = new mongoose.Schema({
  event: { type: String, required: true },
  licenseKey: { type: String, required: true },
  plan: { type: String, default: "trial" },
  draftId: { type: String, default: null },
  metadata: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("EventLog", EventLogSchema);
