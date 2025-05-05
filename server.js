npm install mongoose dotenv

// // ✅ Full server.js with LemonSqueezy Variant, Expiry (renews_at), and Quota Check
// const express = require("express");
// const axios = require("axios");
// const app = express();

// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
//   res.header("Access-Control-Allow-Headers", "Content-Type");
//   if (req.method === "OPTIONS") return res.sendStatus(200);
//   next();
// });

// app.use(express.json());

// const LEMON_API_KEY = process.env.LEMON_API_KEY;

// async function validateLicense(licenseKey) {
//   try {
//     const response = await axios.post(
//       "https://api.lemonsqueezy.com/v1/licenses/validate",
//       { license_key: licenseKey },
//       {
//         headers: {
//           Authorization: `Bearer ${LEMON_API_KEY}`,
//           "Content-Type": "application/json",
//           Accept: "application/json",
//         },
//       }
//     );

//     const license = response?.data?.license_key;
//     const isValid = response?.data?.valid && license?.status === "active";

//     if (!isValid) return { allowed: false, reason: "License invalid or inactive" };

//     // 🔁 Fetch subscription details to get expiry (renews_at)
//     const subscriptionId = license.subscription_id;
//     let expiresAt = null;
//     let variant = null;

//     if (subscriptionId) {
//       const subRes = await axios.get(
//         `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`,
//         {
//           headers: {
//             Authorization: `Bearer ${LEMON_API_KEY}`,
//             Accept: "application/json",
//           },
//         }
//       );
//       const attrs = subRes.data?.data?.attributes;
//       expiresAt = attrs?.renews_at || null;
//       variant = attrs?.variant_name || null;
//     }

//     return {
//       allowed: true,
//       limit: 1000,
//       expires_at: expiresAt,
//       variant,
//       order_id: license.order_id || null,
//       email: license.user_email || null,
//     };
//   } catch (err) {
//     console.error("❌ validateLicense error:", err.response?.data || err.message);
//     return { allowed: false, reason: "License validation error" };
//   }
// }

// async function tryActivateAndValidate(licenseKey) {
//   try {
//     await axios.post(
//       "https://api.lemonsqueezy.com/v1/licenses/activate",
//       {
//         license_key: licenseKey,
//         instance_name: "smartdraft-extension",
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${LEMON_API_KEY}`,
//           "Content-Type": "application/json",
//           Accept: "application/json",
//         },
//       }
//     );
//     return await validateLicense(licenseKey); // 🔁 Re-use after activation
//   } catch (err) {
//     console.error("❌ Activation error:", err.response?.data || err.message);
//     return { allowed: false, reason: "Activation failed" };
//   }
// }

// // ✅ /quota-check with variant and expiry
// app.post("/quota-check", async (req, res) => {
//   const { licenseKey } = req.body;
//   if (!licenseKey || licenseKey.length < 10) {
//     return res.status(400).json({ allowed: false, reason: "Invalid license key" });
//   }

//   let result = await validateLicense(licenseKey);
//   if (!result.allowed && result.reason === "License invalid or inactive") {
//     result = await tryActivateAndValidate(licenseKey);
//   }

//   return res.json(result);
// });

// // ✅ /increment (currently dummy)
// app.post("/increment", (req, res) => {
//   const { licenseKey } = req.body;
//   if (!licenseKey) return res.status(400).json({ success: false });
//   console.log(`📈 Increment received for license: ${licenseKey}`);
//   res.json({ success: true });
// });

// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.once("open", () => console.log("✅ MongoDB connected"));
db.on("error", console.error);

// MongoDB Schemas
const DraftUsageSchema = new mongoose.Schema({
  licenseKey: String,
  plan: String, // trial or paid
  variant: String,
  timestamp: { type: Date, default: Date.now },
});

const EventSchema = new mongoose.Schema({
  event: String,
  licenseKey: String,
  details: Object,
  timestamp: { type: Date, default: Date.now },
});

const DraftUsage = mongoose.model("DraftUsage", DraftUsageSchema);
const TrackEvent = mongoose.model("TrackEvent", EventSchema);

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
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ allowed: false, reason: "missing" });

  const usage = await DraftUsage.countDocuments({ licenseKey });
  const license = await getLicenseData(licenseKey);
  if (!license) return res.json({ allowed: false, reason: "invalid" });

  const expired = license.expires_at && new Date(license.expires_at) < new Date();
  if (expired) return res.json({ allowed: false, reason: "expired" });

  res.json({
    allowed: true,
    limit: 1000,
    expires_at: license.expires_at,
    variant: license.variant,
    order_id: license.order_id,
    used: usage,
  });
});

// Increment Draft Usage
app.post("/increment", async (req, res) => {
  const { licenseKey, plan = "trial", variant = "Trial" } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false });

  await DraftUsage.create({ licenseKey, plan, variant });
  res.json({ success: true });
});

// Track Events
// POST /track-event
app.post("/track-event", async (req, res) => {
  const { licenseKey, event, metadata = {}, plan = "unknown" } = req.body;

  try {
    await AnalyticsEvent.create({
      licenseKey,
      event,
      metadata,
      plan,
      timestamp: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to store event:", err);
    res.status(500).json({ success: false });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
