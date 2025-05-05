// routes/trackEvent.js
const express = require("express");
const router = express.Router();
const EventLog = require("../models/EventLog");

router.post("/track_event", async (req, res) => {
  try {
    const { event, licenseKey = "anonymous", plan = "trial", draftId = null } = req.body;

    await EventLog.create({
      event,
      licenseKey,
      plan,
      draftId,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error tracking event:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
