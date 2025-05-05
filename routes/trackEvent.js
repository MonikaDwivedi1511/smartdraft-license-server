const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const EventLog = require("../models/EventLog");

router.post("/track_event", async (req, res) => {
  try {
    let { event, licenseKey = "anonymous", plan = "trial", draftId = null, ...metadata } = req.body;

    // 🔐 Hash the license key for privacy
    const hashedKey = licenseKey === "anonymous"
      ? "anonymous"
      : crypto.createHash("sha256").update(licenseKey).digest("hex");

    // Save event
    await EventLog.create({
      event,
      licenseKey: hashedKey,
      plan,
      draftId,
      metadata,
      timestamp: new Date()
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error tracking event:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
