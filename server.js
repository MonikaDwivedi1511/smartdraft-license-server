// server.js (SmartDraft License Server with Variants + Quota)

const express = require("express");
const axios = require("axios");
const app = express();
require("dotenv\config");

app.use(express.json());

// CORS for extension
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const LEMON_API_KEY = process.env.LEMON_API_KEY;
const LEMON_HEADERS = {
  Authorization: `Bearer ${LEMON_API_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json"
};

// ✅ License Validation
async function validateLicense(licenseKey) {
  try {
    const res = await axios.post(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      { license_key: licenseKey },
      { headers: LEMON_HEADERS }
    );

    const license = res?.data?.license_key;
    const isValid = res?.data?.valid === true && license?.status === "active";

    if (!isValid) return { allowed: false, reason: "License invalid or inactive" };

    return {
      allowed: true,
      limit: 1000,
      expires_at: license.expires_at || null,
      variant: license.variant_name || "Premium",
      email: license.user_email || null
    };
  } catch (err) {
    console.error("❌ validateLicense error:", err.response?.data || err.message);
    return { allowed: false, reason: "License validation error" };
  }
}

// 🔁 Try to Activate + Re-validate
async function tryActivateAndValidate(licenseKey) {
  try {
    await axios.post(
      "https://api.lemonsqueezy.com/v1/licenses/activate",
      { license_key: licenseKey, instance_name: "smartdraft-extension" },
      { headers: LEMON_HEADERS }
    );
    return await validateLicense(licenseKey);
  } catch (err) {
    console.error("❌ Activation error:", err.response?.data || err.message);
    return { allowed: false, reason: "Activation failed" };
  }
}

// ✅ Quota Check
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey || licenseKey.length < 10)
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });

  try {
    let result = await validateLicense(licenseKey);

    if (!result.allowed && result.reason === "License invalid or inactive") {
      console.log("🔁 Attempting activation...");
      result = await tryActivateAndValidate(licenseKey);
    }

    return res.json(result);
  } catch (err) {
    console.error("❌ Server error during quota check:", err);
    return res.status(500).json({ allowed: false, reason: "Server error" });
  }
});

// 📈 Increment Usage (for sync only)
app.post("/increment", (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ success: false, error: "Missing licenseKey" });

  console.log(`📈 Increment for: ${licenseKey}`);
  // You can integrate Lemon usage-records here in future.

  return res.json({ success: true });
});

// 🚀 Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
