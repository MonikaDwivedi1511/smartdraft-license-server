const express = require("express");
const axios = require("axios");

const app = express();

// ✅ CORS headers (including preflight)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");  // Restrict in production
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

const LEMON_API_KEY = process.env.LEMON_API_KEY;

// 🔁 Try to activate license if inactive
async function tryActivateAndValidate(licenseKey) {
  try {
    console.log("⚙️ Attempting activation...");

    const activation = await axios.post(
      "https://api.lemonsqueezy.com/v1/licenses/activate",
      {
        license_key: licenseKey,
        instance_name: "smartdraft-extension"
      },
      {
        headers: {
          Authorization: `Bearer ${LEMON_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    console.log("✅ Activation success. Re-validating...");

    return await validateLicense(licenseKey); // reuse core validator
  } catch (err) {
    console.error("🚫 Activation failed:", err.response?.data || err.message);
    return { allowed: false, reason: "Activation failed" };
  }
}

// ✅ Core license validator
async function validateLicense(licenseKey) {
  try {
    const response = await axios.post(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      { license_key: licenseKey },
      {
        headers: {
          Authorization: `Bearer ${LEMON_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    const data = response.data;
    const license = data?.license_key;

    const isValid = data?.valid === true &&
                    license?.status === "active" &&
                    license?.key === licenseKey;

    if (!isValid) {
      return { allowed: false, reason: "License invalid or inactive" };
    }

    const expiresAt = new Date(license.expires_at).getTime();
    const now = Date.now();

    if (now > expiresAt) {
      console.warn("⛔ License expired:", license.expires_at);
      return { allowed: false, reason: "expired", expires_at: license.expires_at };
    }

    console.log("✅ License valid");
    return {
      allowed: true,
      limit: 1000,
      expires_at: license.expires_at
    };

  } catch (err) {
    console.error("❌ Validation error:", err.response?.data || err.message);
    return { allowed: false, reason: "Validation error" };
  }
}

// ✅ Quota check endpoint
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });
  }

  console.log("🔍 Validating license key:", licenseKey);
  let result = await validateLicense(licenseKey);

  if (!result.allowed && result.reason === "License invalid or inactive") {
    console.log("🔁 Trying activation flow...");
    result = await tryActivateAndValidate(licenseKey);
  }

  return res.json(result);
});

// 📈 Increment endpoint (dummy for now)
app.post("/increment", (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false, error: "Missing licenseKey" });

  console.log(`📈 Increment received for license: ${licenseKey}`);
  return res.json({ success: true });
});

// 🔊 Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
