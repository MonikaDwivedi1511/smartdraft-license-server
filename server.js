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

// ✅ Try validate license (shared logic)
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

    const license = response?.data?.license_key;
    const isValid = response?.data?.valid === true && license?.status === "active";

    if (!isValid) {
      return { allowed: false, reason: "License invalid or inactive" };
    }

    return {
      allowed: true,
      limit: 1000,
      expires_at: license?.expires_at || null,
      order_id: license?.order_id || null,
      email: license?.user_email || null,
    };

  } catch (err) {
    console.error("❌ validateLicense error:", err.response?.data || err.message);
    return { allowed: false, reason: "License validation error" };
  }
}

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

    const license = recheck?.data?.license_key;
    const isValid = recheck?.data?.valid === true && license?.status === "active";

    if (isValid) {
      return {
        valid: true,
        license: {
          key: license.key,
          status: license.status,
          expires_at: license.expires_at || null,
          order_id: license.order_id || null,
          customer_email: license.user_email || null,
        }
      };
    }

    return { valid: false };
  } catch (err) {
    console.error("❌ Activation + recheck failed:", err.response?.data || err.message);
    return { valid: false };
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

    let result = await validateLicense(licenseKey);

    if (!result.allowed && result.reason === "License invalid or inactive") {
      console.log("🔁 License not valid. Trying activation flow...");
      const activation = await tryActivateAndValidate(licenseKey);

      if (activation.valid) {
        return res.json({
          allowed: true,
          limit: 1000,
          expires_at: activation.license.expires_at,
          order_id: activation.license.order_id,
          email: activation.license.customer_email || ""
        });
      } else {
        return res.json({ allowed: false, reason: "License invalid or inactive" });
      }
    }

    return res.json(result);

  } catch (err) {
    console.error("❌ Validation/activation error:", err.response?.data || err.message);
    return res.status(500).json({
      allowed: false,
      reason: "Server error during license check",
    });
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
