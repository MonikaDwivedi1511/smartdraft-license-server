const mongoose = require("mongoose");

const LicenseActivationSchema = new mongoose.Schema({
  licenseKey: { type: String, required: true, unique: true },
  variant: String,
  orderId: String,
  expiresAt: Date,
  activatedAt: { type: Date, default: Date.now },
  clientId: { type: String, required: false}, // ✅ Add this line
  lastClientIdSwitchAt: { type: Date, default: null },
  switchCount: { type: Number, default: 0 },
});

module.exports = mongoose.model("LicenseActivation", LicenseActivationSchema);
