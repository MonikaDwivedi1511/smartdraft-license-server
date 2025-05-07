const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const QuotaLog = require("./models/QuotaLog");
const DraftUsage = require("./models/DraftUsage");
const Event = require("./models/Event");


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


// LemonSqueezy License API setup
const LEMON_API_KEY = process.env.LEMON_API_KEY;
const BASE_URL = "https://api.lemonsqueezy.com/v1";

async function getLicenseData(key) {
  const res = await fetch(`${BASE_URL}/license-keys/activate`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LEMON_API_KEY}`,
    },
    body: JSON.stringify({ license_key: key, activation_name: "smartdraft" }),
  });

  const data = await res.json();
  if (!data?.data) return null;

  const attrs = data.data.attributes;
  return {
    order_id: attrs.order_id,
    expires_at: attrs.expires_at,
    variant: attrs.variant_name,
  };
}

// Activation
app.post("/activate", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false, error: "Missing key" });

  try {
    const license = await getLicenseData(licenseKey);
    if (!license) return res.json({ success: false });

    res.json({ success: true, ...license });
  } catch (e) {
    console.error("/activate error:", e);
    res.status(500).json({ success: false });
  }
});

// Quota Check
const LicenseActivation = require("./models/LicenseActivation");

// 🧠 Map variant → limit and expiry
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
      return { limit: 200, expiresAt: null }; // Free / Trial fallback
  }
}

app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ allowed: false, reason: "missing" });

  try {
    let license = await getLicenseData(licenseKey);

    // 🔄 Attempt activation if not already activated or no expiry
    if (!license || !license.expires_at) {
      console.log("🔄 Attempting activation...");
      const activateRes = await fetch(`${BASE_URL}/license-keys/activate`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${LEMON_API_KEY}`,
        },
        body: JSON.stringify({ license_key: licenseKey, activation_name: "smartdraft" }),
      });

      const activateData = await activateRes.json();
      if (!activateData?.data) {
        return res.json({ allowed: false, reason: "invalid" });
      }

      const attrs = activateData.data.attributes;
      const planDetails = getPlanDetailsByVariant(attrs.variant_name);

      license = {
        order_id: attrs.order_id,
        expires_at: attrs.expires_at || planDetails.expiresAt.toISOString(),
        variant: attrs.variant_name,
        limit: planDetails.limit
      };

      // 🧾 Store activation metadata in MongoDB
      await LicenseActivation.findOneAndUpdate(
        { licenseKey },
        {
          licenseKey,
          variant: license.variant,
          orderId: license.order_id,
          expiresAt: new Date(license.expires_at),
          activatedAt: new Date()
        },
        { upsert: true }
      );
    }

    // ⛔ Check expiry
    const isExpired = license.expires_at && new Date(license.expires_at) < new Date();
    if (isExpired) {
      return res.json({ allowed: false, reason: "expired" });
    }

    // 📊 Get usage
    const usage = await DraftUsage.countDocuments({ licenseKey });

    // ✅ Return final result
    return res.json({
      allowed: true,
      used: usage,
      limit: license.limit,
      expires_at: license.expires_at,
      variant: license.variant,
      order_id: license.order_id,
    });
  } catch (err) {
    console.error("❌ /quota-check error:", err);
    return res.status(500).json({ allowed: false, reason: "server_error" });
  }
});


// Increment Draft Usage
// app.post("/increment", async (req, res) => {
//   const { licenseKey, plan = "trial", variant = "Trial" } = req.body;
//   if (!licenseKey) return res.status(400).json({ success: false });

//   await DraftUsage.create({ licenseKey, plan, variant });
//   res.json({ success: true });

//   await QuotaLog.create({
//   licenseKey,
//   plan: licenseInfo.plan || "trial",
//   usedCount: newUsageCount
// });

//});

// Track Events
// POST /track-event
//const Event = require("./models/Event");

app.post("/track-event", async (req, res) => {
  try {
    const { event, timestamp, ...rest } = req.body;

    await Event.create({
      event,
      timestamp: new Date(timestamp),
      ...rest
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Event logging failed:", err.message);
    res.status(500).json({ success: false });
  }
});

app.post("/sync-drafts", async (req, res) => {
  const { licenseKey, plan = "trial", variant = "Trial", used } = req.body;
  if (!licenseKey || used == null) return res.status(400).json({ success: false });

  try {
    await DraftUsage.create({ licenseKey, plan, variant, usedCount: used });
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Sync failed:", err);
    return res.status(500).json({ success: false });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
