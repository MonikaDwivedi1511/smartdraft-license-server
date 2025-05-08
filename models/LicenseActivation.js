const mongoose = require("mongoose");

const LicenseActivationSchema = new mongoose.Schema({
  licenseKey: { type: String, required: true, unique: true },
  variant: String,
  orderId: String,
  expiresAt: Date,
  activatedAt: { type: Date, default: Date.now },
  clientId: { type: String } // ✅ Add this line
});

module.exports = mongoose.model("LicenseActivation", LicenseActivationSchema);
