const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors({
  origin: "*", // Or set this to 'https://mail.google.com' in production
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());


const LEMON_API_KEY = process.env.LEMON_API_KEY;

// 🔑 License Verification (original)
app.post("/verify-license", async (req, res) => {
  const { licenseKey } = req.body;

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

    const isValid = response.data?.data?.valid;
    res.json({ valid: isValid });
  } catch (err) {
    console.error("License check failed", err.response?.data);
    res.status(500).json({ valid: false });
  }
});


app.post("/quota-check", async (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey || licenseKey.length < 10) {
    return res.status(400).json({ allowed: false, reason: "Missing or short key" });
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
    return res.json({ allowed: isValid });
  } catch (err) {
    console.error("🔒 Quota check failed:", err.response?.data || err.message);
    return res.status(500).json({ allowed: false, reason: "Validation server error" });
  }
});


// // ✅ Alias to match frontend call → returns `allowed` instead of `valid`
// app.post("/quota-check", async (req, res) => {
//   const { licenseKey } = req.body;

//   try {
//     const response = await axios.post(
//       "https://api.lemonsqueezy.com/v1/licenses/validate",
//       { license_key: licenseKey },
//       {
//         headers: {
//           Authorization: `Bearer ${LEMON_API_KEY}`,
//           "Content-Type": "application/json",
//           Accept: "application/json"
//         }
//       }
//     );

//     const isValid = response.data?.data?.valid;
//     res.json({ valid: isValid }); // frontend expects `allowed`
//   } catch (err) {
//     console.error("Quota check failed", err.response?.data);
//     res.status(500).json({ allowed: false });
//   }
// });

// // 📈 Draft usage increment (dummy success)
// app.post("/increment", (req, res) => {
//   const { licenseKey } = req.body;

//   if (licenseKey) {
//     console.log(`📥 Increment request for license: ${licenseKey}`);
//     return res.json({ success: true });
//   } else {
//     return res.status(400).json({ success: false, error: "Missing licenseKey" });
//   }
// });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
