const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors({
  origin: "*", // Replace with "https://mail.google.com" in production
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const LEMON_API_KEY = process.env.LEMON_API_KEY;

// 🔐 Quota check + Auto-activate if valid
app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Invalid license key" });
  }

  try {
    // Step 1: Validate the license
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

    const licenseData = validateRes.data?.data;

    if (!licenseData?.valid) {
      return res.json({ allowed: false, reason: "License not valid" });
    }

    // If not activated, attempt activation
    const isActivated = licenseData.activation && licenseData.activation.id;
    const activationLimit = licenseData.meta?.activation_limit || 1;

    if (!isActivated && activationLimit > 0) {
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
        console.log(`🎫 License activated: ${licenseKey}`);
      } catch (activationErr) {
        console.error("⚠️ Activation failed:", activationErr.response?.data || activationErr.message);
        return res.json({ allowed: false, reason: "Activation failed" });
      }
    }

    // ✅ Success
    return res.json({ allowed: true, limit: 1000 });

  } catch (err) {
    console.error("❌ License check/activation failed:", err.response?.data || err.message);
    return res.status(500).json({ allowed: false, reason: "Validation server error" });
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
