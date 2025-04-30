const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const LEMON_API_KEY = process.env.LEMON_API_KEY;

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`));
