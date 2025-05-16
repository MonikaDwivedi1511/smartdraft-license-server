// Unified and improved SmartDraft backend server.js with correct activation + validation

const express = require("express");
const cors = require("cors");
const crypto = require("crypto"); // For signature verification
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
//const QuotaLog = require("./models/QuotaLog");
const DraftUsage = require("./models/DraftUsage");
const Event = require("./models/Event");
const LicenseActivation = require("./models/LicenseActivation");
require("dotenv").config();

const app = express();
app.use(cors({
  origin: "*", // Or specify exact origins like "https://mail.google.com"
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.options("*", cors()); // Handle preflight


// Capture raw body for webhook verification
const rawBodySaver = (req, res, buf) => {
  if (req.url === "/lemon-webhook") {
    req.rawBody = buf.toString("utf8");
  }
};

app.use(bodyParser.json({ verify: rawBodySaver }));

//app.use(bodyParser.json());

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
//const BASE_URL = "https://api.lemonsqueezy.com/v1";

async function activateLicenseKey(licenseKey, instanceName = "smartdraft") {
  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${LEMON_API_KEY}`
      },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: instanceName
      })
    });

    const body = await res.json();

    if (!res.ok || body.activated !== true) {
      console.error("❌ Activation failed — HTTP", res.status);
      console.error("🧾 Response:", JSON.stringify(body, null, 2));
      return false;
    }

    console.log(`🚀 License activated: ${licenseKey}`);
    return true;
  } catch (err) {
    console.error("❌ License activation API error:", err.stack || err);
    return false;
  }
}

async function getLicenseDataFromLemon(licenseKey) {
  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${LEMON_API_KEY}`
      },
      body: JSON.stringify({ license_key: licenseKey })
    });

    const body = await res.json();

    if (body.valid !== true) return null;

    return {
      licenseKey: licenseKey,
      orderId: body.meta?.order_id,
      variant: body.meta?.variant_name,
      expiresAt: body.license_key?.expires_at
    };
  } catch (err) {
    console.error("❌ Lemon validation error:", err.message);
    return null;
  }
}

async function getVariantNameByOrderItemId(orderItemId) {
  try {
    const res = await fetch(`https://api.lemonsqueezy.com/v1/order-items/${orderItemId}`, {
      headers: {
        Authorization: `Bearer ${LEMON_API_KEY}`,
        Accept: "application/vnd.api+json"
      }
    });

    const data = await res.json();
    return data?.data?.attributes?.variant_name || "Unknown";
  } catch (err) {
    console.error("❌ Error fetching variant name from Lemon:", err);
    return "Unknown";
  }
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
    const payload = req.rawBody;
    const secret = process.env.LEMON_WEBHOOK_SECRET;
    const receivedSig = req.headers["x-signature"];
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (receivedSig !== expectedSig) {
      return res.status(403).send("Invalid signature");
    }

    const event = JSON.parse(payload);
    const meta = event.meta || {}; // ✅ add this
    const eventName = meta?.event_name;
    console.log("Event:", event);
    // const clientId = meta?.custom_data?.client_id ||
    //   event.data?.attributes?.user_email ||
    //   event.data?.attributes?.user_name ||
    //   "unknown_client";
    const clientId = event.meta?.custom_data?.client_id || "unknown_client";

    
    console.log("📥 Incoming Lemon event:", eventName);

    switch (eventName) {
      case "license_key_created": { 
          const licenseKey = event.data?.attributes?.key;
          const orderId = event.data?.attributes?.order_id;
          const orderItemId = event.data?.attributes?.order_item_id;
          const customData = event.data?.attributes?.custom_data || {};
          const lemonCreatedAt = event.data?.attributes?.created_at || new Date().toISOString();

          //const clientId = customData.client_id || "unknown_client";
        
          const variant = await getVariantNameByOrderItemId(orderItemId);
          const planDetails = getPlanDetailsByVariant(variant);
          const expiresAt = planDetails.expiresAt?.toISOString();

          if (!licenseKey || !variant || !orderId) {
            console.warn("⚠️ Missing licenseKey / variant / orderId in payload");
            return res.status(400).send("Incomplete license event");
          }

        // ❌ Deactivate all other licenses for the same clientId
          await LicenseActivation.updateMany(
            { clientId, status: "active", orderId: { $ne: orderId } },
            { $set: { status: "expired" } }
          );
          

          await LicenseActivation.findOneAndUpdate(
            { licenseKey },
            {
              licenseKey,
              orderId,
              variant,
              expiresAt,
              clientId: clientId,
              status: "pending",
              activatedAt: new Date(),
              lemonCreatedAt: new Date(lemonCreatedAt),
              createdAt: new Date(lemonCreatedAt)
            },
            { upsert: true }
          );
        
          console.log(`✅ License ${licenseKey} created + pending enrichment`);
          break;
        }


      case "subscription_created": {
        const {
          order_id,
          variant_name,
          user_name,
          user_email,
          renews_at
        } = event.data?.attributes || {};
      
        if (!order_id || !variant_name) {
          console.warn("⚠️ Missing order_id or variant_name in subscription event");
          return res.status(400).send("Incomplete subscription data");
        }
      
        // ⏳ Wait 3 seconds to let license_key_created run first
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await LicenseActivation.updateMany(
          { clientId: clientId, status: "active", orderId: { $ne: order_id } },
          { $set: { status: "expired" } }
        );
        
        
        const update = {
          variant: variant_name,
          userName: user_name,
          userEmail: user_email,
          expiresAt: new Date(renews_at),
          status: "active",
          clientId: clientId
        };

        const result = await LicenseActivation.findOneAndUpdate(
          { orderId: order_id },
          update
        );
      
        if (result && result.licenseKey) {
          const activated = await activateLicenseKey(result.licenseKey);
          if (activated) {
            console.log(`🚀 License ${result.licenseKey} successfully activated via Lemon`);
          } else {
            console.warn(`⚠️ Failed to activate license ${result.licenseKey} on Lemon`);
          }
        } else {
          console.warn("⚠️ Still no license matched after delay for order:", order_id);
        }
      
        break;
      }

      default:
        console.log("ℹ️ No handler for event:", eventName);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook error:", err.stack || err);
    return res.status(500).send("Webhook handler error");
  }
});

app.post("/validate-license", async (req, res) => {
  const { licenseKey, clientId } = req.body;
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!clientId) return res.status(400).json({ allowed: false, reason: "missing_clientId" });

  try {
    let license;
    console.log("License:", licenseKey, " clientId:", clientId);
    if (licenseKey) {
      license = await LicenseActivation.findOne({ licenseKey });

      // Try syncing from Lemon if not found
      if (!license) {
        const lemonData = await getLicenseDataFromLemon(licenseKey);
        if (!lemonData) return res.json({ allowed: false, reason: "invalid" });

        license = await LicenseActivation.findOneAndUpdate(
          { licenseKey },
          {
            licenseKey: lemonData.licenseKey,
            variant: lemonData.variant,
            orderId: lemonData.orderId,
            expiresAt: lemonData.expiresAt,
            clientId,
            status: "active",
            activatedAt: new Date()
          },
          { upsert: true, new: true }
        );
      }

      // Device switch check
      if (license.clientId && license.clientId !== clientId) {
        const now = new Date();
        const hours = (now - new Date(license.lastClientIdSwitchAt || 0)) / (1000 * 60 * 60);
        if (hours < 24) {
          return res.status(403).json({
            allowed: false,
            reason: "device_switch_cooldown",
            message: `Try again in ${Math.ceil(24 - hours)}h.`
          });
        }
        license.clientId = clientId;
        license.lastClientIdSwitchAt = now;
        license.switchCount = (license.switchCount || 0) + 1;
        await license.save();
      }

    } else {
      // No licenseKey → Polling mode
      //const licenses = await LicenseActivation.find({ clientId, status: "active" }).sort({ createdAt: -1 });
      const licenses = await LicenseActivation.find({
        clientId,
        status: "active",
        lemonCreatedAt: { $exists: true }
      })
      .sort({ lemonCreatedAt: -1 });
      // for (const l of licenses) {
      //   if (!l.expiresAt || new Date(l.expiresAt) > new Date()) {
      //     const usage = await DraftUsage.aggregate([
      //       { $match: { licenseKey: l.licenseKey } },
      //       { $group: { _id: null, total: { $sum: "$usedCount" } } }
      //     ]);
      //     const used = usage[0]?.total || 0;
      //     const plan = getPlanDetailsByVariant(l.variant);
      //     if (used < plan.limit) {
      //       license = l;
      //       break;
      //     }
      //   }
      // }
      for (const l of licenses) {
        // Ensure it’s not already used significantly (e.g., >10% used)
        const usage = await DraftUsage.aggregate([
          { $match: { licenseKey: l.licenseKey } },
          { $group: { _id: null, total: { $sum: "$usedCount" } } }
        ]);
        const used = usage[0]?.total || 0;
        const plan = getPlanDetailsByVariant(l.variant);
        const limit = plan.limit;
      
        if (used === 0) {
          license = l;
          break;
        }
      }
      if (!license) {
        return res.json({ allowed: false, reason: "no_valid_license" });
      }
    }

    // Final validation
    if (license.status !== "active") return res.json({ allowed: false, reason: "inactive_license" });
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) return res.json({ allowed: false, reason: "expired" });

    const usage = await DraftUsage.aggregate([
      { $match: { licenseKey: license.licenseKey } },
      { $group: { _id: null, total: { $sum: "$usedCount" } } }
    ]);
    const used = usage[0]?.total || 0;
    const planDetails = getPlanDetailsByVariant(license.variant);
    const limit = planDetails.limit;

    if (used >= limit) return res.json({ allowed: false, reason: "quota_exceeded", used, limit });

    return res.json({
      allowed: true,
      licenseKey: license.licenseKey,
      used,
      limit,
      expires_at: license.expiresAt,
      variant: license.variant
    });

  } catch (err) {
    console.error("❌ /validate-license error:", err);
    return res.status(500).json({ allowed: false, reason: "server_error" });
  }
});

app.get("/ping", (req, res) => {
  res.send("pong");
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
