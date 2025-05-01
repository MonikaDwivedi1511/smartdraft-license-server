const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors({
  origin: "*", // Use specific origin in production
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const LEMON_API_KEY = process.env.LEMON_API_KEY;

// 🔄 Try activating + validating
async function tryActivateAndValidate(licenseKey) {
  try {
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

    const validateAgain = await axios.post(
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

    return validateAgain.data?.data?.valid === true;

  } catch (err) {
    console.error("🚫 Activation + recheck failed:", err.response?.data || err.message);
    return false;
  }
}

// ✅ Main quota check route
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });
  }

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

    const isValid = response.data?.data?.valid === true;

    if (isValid) {
      return res.json({ allowed: true, limit: 1000 });
    }

    console.log("🔁 Trying activation for inactive key...");

    // Try activating and rechecking
    const validAfterActivate = await tryActivateAndValidate(licenseKey);

    if (validAfterActivate) {
      return res.json({ allowed: true, limit: 1000 });
    }

    return res.json({ allowed: false, reason: "License not valid" });

  } catch (err) {
    console.error("❌ Validation failed:", err.response?.data || err.message);
    return res.status(500).json({ allowed: false, reason: "Server error" });
  }
});

// 📈 Increment endpoint (dummy)
app.post("/increment", (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) {
    return res.status(400).json({ success: false, error: "Missing licenseKey" });
  }

  console.log(`📈 Increment received for license: ${licenseKey}`);
  return res.json({ success: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
