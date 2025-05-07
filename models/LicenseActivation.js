// models/LicenseActivation.js
const mongoose = require("mongoose");

const LicenseActivationSchema = new mongoose.Schema({
  licenseKey: { type: String, required: true, unique: true },
  variant: String,
  orderId: String,
  expiresAt: Date,
  activatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("LicenseActivation", LicenseActivationSchema);
