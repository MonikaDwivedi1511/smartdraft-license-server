// ✅ panel.js
async function checkQuotaBeforeGeneration(callback) {
  chrome.storage.sync.get(["plan", "licenseKey", "draftsUsed", "licenseExpiry", "variantName"], async (data) => {
    const {
      plan = "trial",
      licenseKey = "",
      draftsUsed = 0,
      licenseExpiry,
      variantName = "Trial"
    } = data;

    const localUsed = window.getCurrentDraftCount?.() || 0;
    const totalUsed = Math.max(localUsed, draftsUsed);
    const limit = plan === "paid" ? 1000 : 200;

    // ⏰ Local expiry check
    if (plan === "paid" && licenseExpiry) {
      const expiryTime = new Date(licenseExpiry).getTime();
      if (Date.now() > expiryTime) {
        console.warn("⛔ License expired (local)");
        showToast("⛔ Your license has expired.");
        showUpgradeModal();
        return;
      }
    }

    // 🌐 Check server-side license
    if (licenseKey) {
      const activateBtn = document.getElementById("sd-activate-license");
      if (activateBtn) activateBtn.textContent = "🔍 Validating...";

      try {
        const res = await fetch("https://smartdraft-license-server.onrender.com/quota-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseKey })
        });

        const result = await res.json();

        if (!result.allowed) {
          showToast(result.reason === "expired" ? "⛔ License expired. Please renew." : "❌ Invalid license key.");
          showUpgradeModal();
          return;
        }

        // 📝 Update Chrome storage with new expiry/plan if any
        chrome.storage.sync.set({
          plan: "paid",
          licenseExpiry: result.expires_at || null,
          variantName: result.variant || "Monthly Plan"
        });

      } catch (err) {
        console.error("❌ License server error:", err);
        showToast("⚠️ Network error while checking license.");
        return;
      }
    }

    // 🚫 Quota check
    if (totalUsed >= limit) {
      console.warn(`🚫 Draft quota exceeded (${totalUsed}/${limit})`);
      showToast(`🚫 You've used ${totalUsed}/${limit} drafts.`);
      showUpgradeModal();
      return;
    }

    callback();
  });
}
