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

// ✅ Quota check for license validation
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
    } else {
      return res.json({ allowed: false });
    }
  } catch (err) {
    console.error("🔒 License validation failed:", err.response?.data || err.message);
    return res.status(500).json({ allowed: false, reason: "Validation server error" });
  }
});

// 📈 Increment endpoint
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
