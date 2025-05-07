// Unified and improved SmartDraft backend server.js with correct activation + validation

const express = require("express");
const cors = require("cors");
const crypto = require("crypto"); // For signature verification
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const QuotaLog = require("./models/QuotaLog");
const DraftUsage = require("./models/DraftUsage");
const Event = require("./models/Event");
const LicenseActivation = require("./models/LicenseActivation");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const trackEventRoute = require("./routes/trackEvent");
app.use("/", trackEventRoute);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.once("open", () => console.log("✅ MongoDB connected"));
db.on("error", console.error);

// LemonSqueezy License API
const LEMON_API_KEY = process.env.LEMON_API_KEY;
const BASE_URL = "https://api.lemonsqueezy.com/v1";

async function tryActivateLicense(licenseKey) {
  try {
    const res = await fetch(`${BASE_URL}/license-keys/activate`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${LEMON_API_KEY}`,
      },
      body: JSON.stringify({ license_key: licenseKey, activation_name: "smartdraft" }),
    });

    const data = await res.json();
    if (data?.data?.attributes) {
      const attrs = data.data.attributes;
      return {
        order_id: attrs.order_id,
        expires_at: attrs.expires_at,
        variant: attrs.variant_name,
      };
    }
  } catch (err) {
    console.error("❌ Activation failed:", err.message);
  }
  return null;
}

function getPlanDetailsByVariant(variant) {
  const now = new Date();
  switch (variant) {
    case "SmartDraft Premium (Monthly)":
      return { limit: 1000, expiresAt: new Date(now.setDate(now.getDate() + 30)) };
    case "SmartDraft Premium (Half Yearly)":
      return { limit: 6000, expiresAt: new Date(now.setDate(now.getDate() + 180)) };
    case "SmartDraft Premium (Yearly)":
      return { limit: 12000, expiresAt: new Date(now.setDate(now.getDate() + 365)) };
    default:
      return { limit: 200, expiresAt: null }; // Trial or free
  }
}

// Endpoint: Activate License
app.post("/activate", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false, error: "Missing key" });

  const license = await tryActivateLicense(licenseKey);
  if (!license) return res.json({ success: false });

  res.json({ success: true, ...license });
});

// Endpoint: Check Quota
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ allowed: false, reason: "missing_key" });
  }

  try {
    const license = await LicenseActivation.findOne({ licenseKey });

    if (!license || license.status !== "active") {
      return res.json({ allowed: false, reason: "invalid" });
    }

    // ⏳ Expiry check
    const isExpired = license.expiresAt && new Date(license.expiresAt) < new Date();
    if (isExpired) {
      return res.json({ allowed: false, reason: "expired" });
    }

    // 📊 Usage tracking
    const usage = await DraftUsage.aggregate([
      { $match: { licenseKey } },
      { $group: { _id: null, total: { $sum: "$usedCount" } } }
    ]);

    const used = usage[0]?.total || 0;
    const planDetails = getPlanDetailsByVariant(license.variant);
    const limit = planDetails.limit;

    return res.json({
      allowed: true,
      used,
      limit,
      expires_at: license.expiresAt,
      variant: license.variant,
      order_id: license.orderId
    });
  } catch (err) {
    console.error("❌ /quota-check error:", err);
    return res.status(500).json({ allowed: false, reason: "server_error" });
  }
});

// Endpoint: Sync Draft Count
app.post("/sync-drafts", async (req, res) => {
  const { licenseKey, plan = "trial", variant = "Trial", used } = req.body;

  if (!licenseKey || used == null) {
    return res.status(400).json({ success: false, error: "Missing licenseKey or used count" });
  }

  try {
    await DraftUsage.create({
      licenseKey,
      plan,
      variant,
      usedCount: used,
      timestamp: new Date()
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ /sync-drafts error:", err);
    return res.status(500).json({ success: false });
  }
});


// Endpoint: Track Event
app.post("/track-event", async (req, res) => {
  try {
    const {
      event,              // e.g. 'draft_generated', 'upgrade_clicked'
      licenseKey,         // Optional: helpful for tracking user
      details = {},       // Optional: extra data like plan, input length
      timestamp = Date.now()
    } = req.body;

    if (!event) {
      return res.status(400).json({ success: false, error: "Missing event name" });
    }

    await Event.create({
      event,
      licenseKey,
      details,
      timestamp: new Date(timestamp)
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Event tracking error:", err);
    res.status(500).json({ success: false });
  }
});


//Auto activation on license key purchase
app.post("/lemon-webhook", async (req, res) => {
  try {
    const secret = process.env.LEMON_WEBHOOK_SECRET;
    const receivedSig = req.headers["x-signature"];

    const payload = JSON.stringify(req.body);
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (receivedSig !== expectedSig) {
      console.warn("🚫 Invalid webhook signature");
      return res.status(403).send("Invalid signature");
    }

    const event = req.body;

    if (event.meta?.event_name === "license_key_created") {
      const licenseKey = event.data.attributes.key;
      const variant = event.data.attributes.license_item.name;
      const orderId = event.data.relationships.order.data.id;

      const planDetails = getPlanDetailsByVariant(variant);
      const expiresAt = planDetails.expiresAt.toISOString();

      await LicenseActivation.findOneAndUpdate(
        { licenseKey },
        {
          licenseKey,
          variant,
          orderId,
          expiresAt,
          activatedAt: new Date(),
          status: "active",
        },
        { upsert: true }
      );

      console.log(`✅ Auto-activated license ${licenseKey} via webhook`);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.status(500).send("Webhook handler error");
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
