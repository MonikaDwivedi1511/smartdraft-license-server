npm install mongoose dotenv

// ✅ Full server.js with LemonSqueezy Variant, Expiry (renews_at), and Quota Check
const express = require("express");
const axios = require("axios");
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

const LEMON_API_KEY = process.env.LEMON_API_KEY;

async function validateLicense(licenseKey) {
  try {
    const response = await axios.post(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      { license_key: licenseKey },
      {
        headers: {
          Authorization: `Bearer ${LEMON_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const license = response?.data?.license_key;
    const isValid = response?.data?.valid && license?.status === "active";

    if (!isValid) return { allowed: false, reason: "License invalid or inactive" };

    // 🔁 Fetch subscription details to get expiry (renews_at)
    const subscriptionId = license.subscription_id;
    let expiresAt = null;
    let variant = null;

    if (subscriptionId) {
      const subRes = await axios.get(
        `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${LEMON_API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const attrs = subRes.data?.data?.attributes;
      expiresAt = attrs?.renews_at || null;
      variant = attrs?.variant_name || null;
    }

    return {
      allowed: true,
      limit: 1000,
      expires_at: expiresAt,
      variant,
      order_id: license.order_id || null,
      email: license.user_email || null,
    };
  } catch (err) {
    console.error("❌ validateLicense error:", err.response?.data || err.message);
    return { allowed: false, reason: "License validation error" };
  }
}

async function tryActivateAndValidate(licenseKey) {
  try {
    await axios.post(
      "https://api.lemonsqueezy.com/v1/licenses/activate",
      {
        license_key: licenseKey,
        instance_name: "smartdraft-extension",
      },
      {
        headers: {
          Authorization: `Bearer ${LEMON_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    return await validateLicense(licenseKey); // 🔁 Re-use after activation
  } catch (err) {
    console.error("❌ Activation error:", err.response?.data || err.message);
    return { allowed: false, reason: "Activation failed" };
  }
}

// ✅ /quota-check with variant and expiry
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });
  }

  let result = await validateLicense(licenseKey);
  if (!result.allowed && result.reason === "License invalid or inactive") {
    result = await tryActivateAndValidate(licenseKey);
  }

  return res.json(result);
});

// ✅ /increment (currently dummy)
app.post("/increment", (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false });
  console.log(`📈 Increment received for license: ${licenseKey}`);
  res.json({ success: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
