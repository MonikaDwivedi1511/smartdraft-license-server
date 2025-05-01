const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors({
  origin: "*",  // Change to "https://mail.google.com" in production
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const LEMON_API_KEY = process.env.LEMON_API_KEY;

// ✅ License quota check with auto-activation
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });
  }

  try {
    // Step 1: Validate license
    const validateRes = await axios.post(
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

    const { valid, activation_limit, activations } = validateRes.data?.data || {};

    if (!valid) {
      return res.json({ allowed: false, reason: "License not valid" });
    }

    const isActivated = (activations || []).length > 0;

    // Step 2: Activate if not already
    if (!isActivated && activation_limit > 0) {
      await axios.post(
        "https://api.lemonsqueezy.com/v1/licenses/activate",
        {
          license_key: licenseKey,
          instance_name: "smartdraft-extension",
          instance_id: `instance-${Date.now()}`
        },
        {
          headers: {
            Authorization: `Bearer ${LEMON_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          }
        }
      );

      console.log(`✅ Activated license ${licenseKey}`);
    }

    // Step 3: Allow usage
    return res.json({ allowed: true, limit: 1000 });

  } catch (err) {
    console.error("❌ License check/activation failed:", err.response?.data || err.message);
    return res.status(500).json({ allowed: false, reason: "Validation server error" });
  }
});

// 📈 Draft usage increment (dummy tracking)
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
