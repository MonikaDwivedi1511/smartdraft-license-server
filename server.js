// server.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const LEMON_API = "https://api.lemonsqueezy.com/v1";
const LEMON_API_KEY = process.env.LEMON_API_KEY;
const HEADERS = {
  "Accept": "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
  "Authorization": `Bearer ${LEMON_API_KEY}`
};

// Helper: Fetch license details
async function fetchLicenseDetails(licenseKey) {
  try {
    const res = await axios.get(`${LEMON_API}/license-keys?filter[key]=${licenseKey}`, { headers: HEADERS });
    const license = res.data.data[0];
    if (!license) return null;

    const licenseId = license.id;
    const licenseAttributes = license.attributes;

    // Fetch subscription item details
    const subscriptionItemId = license.relationships["subscription-item"]?.data?.id;
    let variantName = null;
    let expiresAt = licenseAttributes.expires_at;

    if (subscriptionItemId) {
      const subscriptionItemRes = await axios.get(`${LEMON_API}/subscription-items/${subscriptionItemId}`, { headers: HEADERS });
      const priceId = subscriptionItemRes.data.data.relationships.price.data.id;

      // Fetch price details to get variant name
      const priceRes = await axios.get(`${LEMON_API}/prices/${priceId}`, { headers: HEADERS });
      variantName = priceRes.data.data.attributes.name;
    }

    return {
      allowed: licenseAttributes.status === "active",
      variant: variantName || "Monthly",
      expires_at: expiresAt || "2025-10-31T04:31:04.343Z",
      subscription_item_id: subscriptionItemId
    };
  } catch (err) {
    console.error("License lookup failed:", err.message);
    return null;
  }
}

// Endpoint: Validate license and return quota info
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ allowed: false, reason: "missing_key" });

  const license = await fetchLicenseDetails(licenseKey);
  if (!license) return res.status(404).json({ allowed: false, reason: "not_found" });

  if (!license.allowed) {
    return res.status(403).json({ allowed: false, reason: "expired" });
  }

  return res.json({
    allowed: true,
    limit: 1000,
    expires_at: license.expires_at,
    variant: license.variant
  });
});

// Endpoint: Increment usage
app.post("/increment", async (req, res) => {
  const { licenseKey, quantity = 1 } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false, reason: "missing_key" });

  const license = await fetchLicenseDetails(licenseKey);
  if (!license || !license.allowed) {
    return res.status(403).json({ success: false, reason: "invalid_or_expired" });
  }

  try {
    await axios.post(`${LEMON_API}/usage-records`, {
      data: {
        type: "usage-records",
        attributes: {
          quantity,
          action: "increment"
        },
        relationships: {
          "subscription-item": {
            data: {
              type: "subscription-items",
              id: license.subscription_item_id
            }
          }
        }
      }
    }, { headers: HEADERS });

    return res.json({ success: true });
  } catch (err) {
    console.error("Usage record failed:", err.message);
    return res.status(500).json({ success: false, reason: "usage_record_failed" });
  }
});

// Endpoint: Activate license (optional)
app.post("/activate", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false, reason: "missing_key" });

  const license = await fetchLicenseDetails(licenseKey);
  if (!license || !license.allowed) {
    return res.status(403).json({ success: false, reason: "invalid_or_expired" });
  }

  return res.json({
    success: true,
    plan: "paid",
    licenseKey,
    licenseExpiry: license.expires_at,
    variantName: license.variant
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
