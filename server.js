const express = require("express");
const axios = require("axios");

const app = express();

// ✅ CORS headers (including preflight)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");  // Change to "https://mail.google.com" in production
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
    await axios.post(
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
    const recheck = await axios.post(
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

    return recheck.data?.data?.valid === true;
  } catch (err) {
    console.error("🚫 Activation error:", err.response?.data || err.message);
    return false;
  }
}

// ✅ Quota check endpoint
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });
  }

  try {
    console.log("🔍 Validating license key:", licenseKey);
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

    const isValid = response.data?.data?.valid === true;

    if (isValid) {
      console.log("✅ License valid");
      return res.json({ allowed: true, limit: 1000 });
    }

    console.log("🔁 License not active. Trying activation...");
    const activated = await tryActivateAndValidate(licenseKey);

    if (activated) {
      console.log("✅ License activated successfully");
      return res.json({ allowed: true, limit: 1000 });
    }

    console.warn("❌ License activation failed or still invalid");
    return res.json({ allowed: false, reason: "License invalid or inactive" });

  } catch (err) {
    console.error("❌ Validation error:", err.response?.data || err.message);
    return res.status(500).json({ allowed: false, reason: "Validation server error" });
  }
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
