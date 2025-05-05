const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  event: String,
  timestamp: Date,
  licenseKey: String,
  plan: String,
  email: String,
  extension_version: String,
  browser: String,
  metadata: Object,
});

module.exports = mongoose.model("Event", EventSchema);
