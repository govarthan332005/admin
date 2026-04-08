// ============================================================
//  SLICE INVEST — Enhanced App v4.0
//  Updated: Dynamic Plans from Admin, Withdraw Slip Upload,
//           Proof Section, Referral Bug Fix, Auto Dispersal
// ============================================================

// ─── SPLASH SCREEN (FIX: Race condition with auto-login) ────
// Uses a global flag to prevent splash from overriding auto-login dashboard
window.__sliceAutoLoginSucceeded = false;

(function handleSplash() {
  setTimeout(() => {
    const splash = document.getElementById("splashScreen");
    if (!splash) return;
    splash.style.opacity = "0";
    splash.style.transition = "opacity 0.6s ease";
    setTimeout(() => {
      splash.classList.add("hidden");
      // ═══ FIX: Only show loginPage if auto-login didn't already show dashboard ═══
      const dashboard = document.getElementById("userDashboard");
      if (!dashboard || dashboard.classList.contains("hidden")) {
        document.getElementById("loginPage").classList.remove("hidden");
      }
    }, 600);
  }, 2200);
})();

// ─── TAB SWITCHING (Login) ──────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".login-form").forEach(f => f.classList.remove("active"));
    btn.classList.add("active");
    const formId = btn.dataset.tab + "LoginForm";
    const form = document.getElementById(formId);
    if (form) form.classList.add("active");
  });
});

window.switchToSignup = (e) => {
  if (e) e.preventDefault();
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".login-form").forEach(f => f.classList.remove("active"));
  const signupTab = document.querySelector('.tab-btn[data-tab="signup"]');
  const signupForm = document.getElementById("signupLoginForm");
  if (signupTab) signupTab.classList.add("active");
  if (signupForm) signupForm.classList.add("active");
};

window.switchToLogin = (e) => {
  if (e) e.preventDefault();
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".login-form").forEach(f => f.classList.remove("active"));
  const userTab = document.querySelector('.tab-btn[data-tab="user"]');
  const userForm = document.getElementById("userLoginForm");
  if (userTab) userTab.classList.add("active");
  if (userForm) userForm.classList.add("active");
};

// ─── MODAL CLOSE ON OVERLAY CLICK ──────────────────────────
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// ─── TOGGLE PASSWORD ────────────────────────────────────────
window.togglePass = (id, btn) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === "password") {
    el.type = "text";
    btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    el.type = "password";
    btn.innerHTML = '<i class="fas fa-eye"></i>';
  }
};

// ─── MODAL helpers ──────────────────────────────────────────
window.openModal  = id => { const m = document.getElementById(id); if(m) m.classList.remove("hidden"); };
window.closeModal = id => { const m = document.getElementById(id); if(m) m.classList.add("hidden"); };

// ─── WITHDRAW BANK SELECT TOGGLE ────────────────────────────
document.getElementById("withdrawBankSelect")?.addEventListener("change", function() {
  const newFields = document.getElementById("newAccountFields");
  if (this.value === "new" || this.value === "") {
    newFields?.classList.toggle("hidden", this.value !== "new");
  } else {
    newFields?.classList.add("hidden");
  }
});

// ─── BANK TYPE SWITCH ───────────────────────────────────────
window.switchBankType = (type, btn) => {
  document.querySelectorAll(".bt-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("bankFields")?.classList.toggle("hidden", type !== "bank");
  document.getElementById("upiFields")?.classList.toggle("hidden", type !== "upi");
};

// ─── SCREENSHOT UPLOAD HANDLING ─────────────────────────────
let uploadedScreenshot = null;

window.handleScreenshotUpload = (event) => {
  event.stopPropagation();
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    if (window._showToast) window._showToast("Please upload an image file.", "error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (window._showToast) window._showToast("File too large. Max 5MB.", "error");
    return;
  }

  uploadedScreenshot = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const placeholder = document.getElementById("screenshotPlaceholder");
    const preview = document.getElementById("screenshotPreview");
    const previewImg = document.getElementById("screenshotPreviewImg");

    if (placeholder) placeholder.classList.add("hidden");
    if (preview) preview.classList.remove("hidden");
    if (previewImg) previewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.removeScreenshot = (event) => {
  event.stopPropagation();
  uploadedScreenshot = null;

  const placeholder = document.getElementById("screenshotPlaceholder");
  const preview = document.getElementById("screenshotPreview");
  const previewImg = document.getElementById("screenshotPreviewImg");
  const input = document.getElementById("screenshotInput");

  if (placeholder) placeholder.classList.remove("hidden");
  if (preview) preview.classList.add("hidden");
  if (previewImg) previewImg.src = "";
  if (input) input.value = "";
};

window.copyDepositUpi = () => {
  const upiId = document.getElementById("depositUpiId")?.textContent;
  if (!upiId) return;
  navigator.clipboard.writeText(upiId).then(() => {
    if (window._showToast) window._showToast("UPI ID copied! 📋", "success");
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = upiId;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    if (window._showToast) window._showToast("UPI ID copied! 📋", "success");
  });
};

// ═══════════════════════════════════════════════════════════════
//  MAIN APP — Initialized after backend is ready
// ═══════════════════════════════════════════════════════════════

(async () => {
  let backend;
  try {
    backend = await (window.SliceInvestBackendReady || Promise.reject(new Error("Backend missing.")));
  } catch (e) {
    console.error("Backend failed:", e);
    showToast("Failed to connect. Please reload.", "error");
    return;
  }

  const {
    db, auth, backendMode,
    collection, doc,
    getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit, onSnapshot,
    serverTimestamp, Timestamp,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
  } = backend;

  // ─── DEFAULT INVESTMENT PLANS (Fallback if admin hasn't configured) ───
  const DEFAULT_PLANS = [
    {
      id: "basic", name: "Basic Plan", amount: 500, dailyReturnFixed: 90, duration: 15,
      icon: "fas fa-rocket", badge: "basic", badgeClass: "badge-basic", maxPurchases: 2,
      features: ["₹500 Investment","₹90 Daily Returns","Daily Withdraw Available","Term: 15 Days","Max 2 Purchases"]
    },
    {
      id: "standard", name: "Standard Plan", amount: 1000, dailyReturnFixed: 200, duration: 15,
      icon: "fas fa-gem", badge: "standard", badgeClass: "badge-standard", maxPurchases: 2,
      features: ["₹1,000 Investment","₹200 Daily Returns","Daily Withdraw Available","Term: 15 Days","Max 2 Purchases"]
    },
    {
      id: "premium", name: "Premium Plan", amount: 2500, dailyReturnFixed: 550, duration: 15,
      icon: "fas fa-crown", badge: "premium", badgeClass: "badge-premium", maxPurchases: 2,
      features: ["₹2,500 Investment","₹550 Daily Returns","Daily Withdraw Available","Term: 15 Days","Max 2 Purchases"]
    }
  ];

  // ═══ DYNAMIC PLANS — loaded from Firestore, fallback to defaults ═══
  let PLANS = [...DEFAULT_PLANS];
  let MAX_PURCHASES_PER_PLAN = 2;

  // ─── STATE ────────────────────────────────────────────────────
  let currentUser      = null;
  let currentUserData  = null;
  let selectedPlan     = null;
  let bankAccounts     = [];
  let allTransactions  = [];
  let portfolioChart   = null;
  let isInvestProcessing = false;
  let isWithdrawProcessing = false;
  let isDepositProcessing = false;
  const MAX_REWARD_STREAK = 7;
  const DEFAULT_PLATFORM_CONFIG = {
    minDeposit: 100,
    minWithdraw: 100,
    referralBonus: 50,
    baseReward: 10,
    streakBonus: 2,
    maxReward: 50,
    slipUploadBonus: 10
  };
  let runtimePlatformConfig = { ...DEFAULT_PLATFORM_CONFIG };
  let runtimeUpiConfig = { upiId: "sliceinvest@ybl", displayName: "SliceInvest Official" };
  let runtimeDepositConfig = { enableUpi: true, enableQr: false, enableBank: false, qrCodeImage: '', bankAccountName: '', bankAccountNumber: '', bankIfsc: '', bankName: '' };
  let runtimeLinksConfig = { telegramLink: '', customerCareLink: '' };
  let runtimeWithdrawConfig = { apiWithdrawEnabled: true, upiWithdrawEnabled: true, bankWithdrawEnabled: true };
  let runtimeConfigLoaded = false;

  // ─── UTILITY FUNCTIONS ────────────────────────────────────────
  function showToast(msg, type = "info") {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = "toast"; }, 3500);
  }
  window._showToast = showToast;

  function fmt(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDate(ts) {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
  }

  function fmtDateTime(ts) {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  function sortDocsByCreatedAt(docs, limitCount = null) {
    const sorted = [...docs].sort((a, b) => {
      const aData = a.data();
      const bData = b.data();
      const aTime = aData?.createdAt?.toDate ? aData.createdAt.toDate().getTime() : new Date(aData?.createdAt || 0).getTime();
      const bTime = bData?.createdAt?.toDate ? bData.createdAt.toDate().getTime() : new Date(bData?.createdAt || 0).getTime();
      return bTime - aTime;
    });
    return typeof limitCount === "number" ? sorted.slice(0, limitCount) : sorted;
  }

  function generateReferralCode(name) {
    const prefix = (name || "USER").replace(/\s+/g, "").toUpperCase().slice(0, 4);
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return prefix + suffix;
  }

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function maskName(name) {
    if (!name || name.length <= 2) return name || "User";
    return name[0] + "*".repeat(Math.min(name.length - 2, 4)) + name.slice(-1);
  }

  // ═══ LOAD DYNAMIC PLANS FROM FIRESTORE ═══
  async function loadDynamicPlans() {
    try {
      const plansSnap = await getDoc(doc(db, "config", "plans"));
      if (plansSnap.exists()) {
        const data = plansSnap.data();
        if (data.plans && Array.isArray(data.plans) && data.plans.length > 0) {
          PLANS = data.plans;
          if (data.maxPurchasesPerPlan) MAX_PURCHASES_PER_PLAN = data.maxPurchasesPerPlan;
          console.log("Loaded", PLANS.length, "plans from admin config");
        }
      }
    } catch(err) {
      console.warn("Failed to load dynamic plans, using defaults:", err);
    }
  }

  function applyRuntimeConfigToUI() {
    const upiEl = document.getElementById("depositUpiId");
    if (upiEl) upiEl.textContent = runtimeUpiConfig.upiId || DEFAULT_PLATFORM_CONFIG.upiId || "sliceinvest@ybl";

    const depositAmountInput = document.getElementById("depositAmount");
    if (depositAmountInput) depositAmountInput.min = String(runtimePlatformConfig.minDeposit || DEFAULT_PLATFORM_CONFIG.minDeposit);

    const withdrawAmountInput = document.getElementById("withdrawAmount");
    if (withdrawAmountInput) withdrawAmountInput.min = String(runtimePlatformConfig.minWithdraw || DEFAULT_PLATFORM_CONFIG.minWithdraw);

    applyDepositMethodsUI();

    const telegramItem = document.getElementById('settingsTelegramItem');
    const ccItem = document.getElementById('settingsCustomerCareItem');
    if (telegramItem) telegramItem.style.display = runtimeLinksConfig.telegramLink ? 'flex' : 'none';
    if (ccItem) ccItem.style.display = runtimeLinksConfig.customerCareLink ? 'flex' : 'none';

    // ═══ FIX: Update referral bonus amount dynamically ═══
    const referralBonus = runtimePlatformConfig.referralBonus || DEFAULT_PLATFORM_CONFIG.referralBonus;
    document.querySelectorAll('.referral-bonus-amount').forEach(el => {
      el.textContent = '₹' + referralBonus;
    });

    // Update plan count badge
    const planBadge = document.getElementById("planCountBadge");
    if (planBadge) planBadge.textContent = PLANS.length + " Plans";
  }

  function applyDepositMethodsUI() {
    const cfg = runtimeDepositConfig;
    const tabsContainer = document.getElementById('depositMethodTabs');
    const upiSection = document.getElementById('depositUpiSection');
    const qrSection = document.getElementById('depositQrSection');
    const bankSection = document.getElementById('depositBankSection');

    const methods = [];
    if (cfg.enableUpi) methods.push('upi');
    if (cfg.enableQr && cfg.qrCodeImage) methods.push('qr');
    if (cfg.enableBank && cfg.bankAccountNumber) methods.push('bank');

    if (methods.length <= 1) {
      if (tabsContainer) tabsContainer.innerHTML = '';
    } else {
      if (tabsContainer) {
        let tabsHtml = '';
        if (cfg.enableUpi) tabsHtml += '<button class="deposit-method-tab active" onclick="switchDepositMethod(\'upi\', this)"><i class="fas fa-mobile-screen"></i>UPI</button>';
        if (cfg.enableQr && cfg.qrCodeImage) tabsHtml += '<button class="deposit-method-tab' + (!cfg.enableUpi ? ' active' : '') + '" onclick="switchDepositMethod(\'qr\', this)"><i class="fas fa-qrcode"></i>QR Code</button>';
        if (cfg.enableBank && cfg.bankAccountNumber) tabsHtml += '<button class="deposit-method-tab' + (!cfg.enableUpi && !(cfg.enableQr && cfg.qrCodeImage) ? ' active' : '') + '" onclick="switchDepositMethod(\'bank\', this)"><i class="fas fa-building-columns"></i>Bank</button>';
        tabsContainer.innerHTML = tabsHtml;
      }
    }

    if (upiSection) upiSection.classList.toggle('hidden', !cfg.enableUpi);
    if (qrSection) qrSection.classList.add('hidden');
    if (bankSection) bankSection.classList.add('hidden');

    if (!cfg.enableUpi && methods.length > 0) {
      if (methods[0] === 'qr' && qrSection) qrSection.classList.remove('hidden');
      if (methods[0] === 'bank' && bankSection) bankSection.classList.remove('hidden');
    }

    if (cfg.qrCodeImage) {
      const qrImg = document.getElementById('depositQrImage');
      if (qrImg) qrImg.src = cfg.qrCodeImage;
    }

    if (cfg.bankAccountNumber) {
      const bankContainer = document.getElementById('depositBankDetails');
      if (bankContainer) {
        bankContainer.innerHTML = `
          <div class="deposit-bank-row">
            <span class="dbr-label">Bank Name</span>
            <span class="dbr-value">${cfg.bankName || '—'}</span>
            <button class="deposit-bank-copy" onclick="copyToClipboard('${(cfg.bankName || '').replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
          </div>
          <div class="deposit-bank-row">
            <span class="dbr-label">Account Name</span>
            <span class="dbr-value">${cfg.bankAccountName || '—'}</span>
            <button class="deposit-bank-copy" onclick="copyToClipboard('${(cfg.bankAccountName || '').replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
          </div>
          <div class="deposit-bank-row">
            <span class="dbr-label">Account No.</span>
            <span class="dbr-value">${cfg.bankAccountNumber || '—'}</span>
            <button class="deposit-bank-copy" onclick="copyToClipboard('${(cfg.bankAccountNumber || '').replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
          </div>
          <div class="deposit-bank-row">
            <span class="dbr-label">IFSC Code</span>
            <span class="dbr-value">${cfg.bankIfsc || '—'}</span>
            <button class="deposit-bank-copy" onclick="copyToClipboard('${(cfg.bankIfsc || '').replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
          </div>
        `;
      }
    }
  }

  window.switchDepositMethod = (method, btn) => {
    document.querySelectorAll('.deposit-method-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const upiSection = document.getElementById('depositUpiSection');
    const qrSection = document.getElementById('depositQrSection');
    const bankSection = document.getElementById('depositBankSection');
    if (upiSection) upiSection.classList.toggle('hidden', method !== 'upi');
    if (qrSection) qrSection.classList.toggle('hidden', method !== 'qr');
    if (bankSection) bankSection.classList.toggle('hidden', method !== 'bank');
  };

  async function loadRuntimeConfig(force = false) {
    if (runtimeConfigLoaded && !force) {
      applyRuntimeConfigToUI();
      return { platform: runtimePlatformConfig, upi: runtimeUpiConfig };
    }

    try {
      const [platformSnap, upiSnap, depositSnap, linksSnap, withdrawSnap] = await Promise.all([
        getDoc(doc(db, "config", "platform")),
        getDoc(doc(db, "config", "upi")),
        getDoc(doc(db, "config", "deposit")),
        getDoc(doc(db, "config", "links")),
        getDoc(doc(db, "config", "withdraw"))
      ]);

      runtimePlatformConfig = {
        ...DEFAULT_PLATFORM_CONFIG,
        ...(platformSnap.exists() ? platformSnap.data() : {})
      };

      runtimeUpiConfig = {
        upiId: "sliceinvest@ybl",
        displayName: "SliceInvest Official",
        ...(upiSnap.exists() ? upiSnap.data() : {})
      };

      if (depositSnap.exists()) {
        runtimeDepositConfig = { ...runtimeDepositConfig, ...depositSnap.data() };
      }
      if (linksSnap.exists()) {
        runtimeLinksConfig = { ...runtimeLinksConfig, ...linksSnap.data() };
      }
      if (withdrawSnap.exists()) {
        runtimeWithdrawConfig = { ...runtimeWithdrawConfig, ...withdrawSnap.data() };
      }
    } catch (err) {
      console.warn("Runtime config load failed:", err);
      runtimePlatformConfig = { ...DEFAULT_PLATFORM_CONFIG };
      runtimeUpiConfig = { upiId: "sliceinvest@ybl", displayName: "SliceInvest Official" };
    }

    runtimeConfigLoaded = true;
    applyRuntimeConfigToUI();
    return { platform: runtimePlatformConfig, upi: runtimeUpiConfig };
  }

  async function ensureRuntimeConfigLoaded() {
    return loadRuntimeConfig(false);
  }

  // ─── PAGE MANAGEMENT ──────────────────────────────────────────
  function showPage(pageId) {
    ["loginPage", "userDashboard"].forEach(id => {
      document.getElementById(id)?.classList.add("hidden");
    });
    document.getElementById(pageId)?.classList.remove("hidden");
  }

  // ═══════════════════════════════════════════════════════════════
  //  SESSION PERSISTENCE — Auto-login on reload
  // ═══════════════════════════════════════════════════════════════
  const SESSION_KEY = "sliceinvest_user_session";

  function saveUserSession(userId) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, timestamp: Date.now() }));
    } catch(e) { console.warn("Save session failed:", e); }
  }

  function clearUserSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
  }

  function getSavedSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Session valid for 30 days
      if (Date.now() - session.timestamp > 30 * 24 * 60 * 60 * 1000) {
        clearUserSession();
        return null;
      }
      return session;
    } catch(e) { return null; }
  }

  // Try auto-login from saved session
  async function tryAutoLogin() {
    const session = getSavedSession();
    if (!session || !session.userId) return false;

    try {
      const userSnap = await getDoc(doc(db, "users", session.userId));
      if (!userSnap.exists()) {
        clearUserSession();
        return false;
      }
      const userData = userSnap.data();
      if (userData.disabled) {
        clearUserSession();
        return false;
      }

      currentUser     = userSnap.id;
      currentUserData = { id: userSnap.id, ...userData };

      // Refresh session timestamp
      saveUserSession(currentUser);

      if (userData.darkMode) {
        document.body.classList.add("dark-mode");
        const toggle = document.getElementById("darkModeToggle");
        if (toggle) toggle.checked = true;
      }

      console.log("[SliceInvest] Auto-login successful for:", userData.name);
      window.__sliceAutoLoginSucceeded = true;

      // ═══ FIX: Also hide splash immediately if still visible ═══
      const splashEl = document.getElementById("splashScreen");
      if (splashEl && !splashEl.classList.contains("hidden")) {
        splashEl.style.opacity = "0";
        splashEl.style.transition = "opacity 0.4s ease";
        setTimeout(() => splashEl.classList.add("hidden"), 400);
      }

      showPage("userDashboard");
      initUserDashboard();
      showToast("Welcome back, " + userData.name + "! 👋", "success");
      return true;
    } catch(err) {
      console.warn("Auto-login failed:", err);
      clearUserSession();
      return false;
    }
  }

  // ═══ Run auto-login check ═══
  tryAutoLogin();

  if (backendMode === "local") {
    const demoInterval = setInterval(() => {
      const loginPage = document.getElementById("loginPage");
      if (loginPage && !loginPage.classList.contains("hidden")) {
        showToast("Demo mode • User: +919876543210 / 123456", "warning");
        clearInterval(demoInterval);
      }
    }, 500);
    setTimeout(() => clearInterval(demoInterval), 10000);
  }

  // ─── USER SIGNUP ──────────────────────────────────────────────
  window.userSignup = async () => {
    const name       = document.getElementById("signupName").value.trim();
    const phoneRaw   = document.getElementById("signupPhone").value.trim();
    const pass       = document.getElementById("signupPassword").value.trim();
    const confirmPass = document.getElementById("signupConfirmPassword").value.trim();
    const referral   = document.getElementById("signupReferral")?.value.trim() || "";

    if (!name)                          return showToast("Please enter your full name.", "error");
    if (name.length < 2)                return showToast("Name must be at least 2 characters.", "error");
    if (!phoneRaw)                      return showToast("Please enter your phone number.", "error");

    // ═══ FIX: Auto-add +91 prefix ═══
    let cleanPhone = phoneRaw.replace(/\s/g, "").replace(/^\+91/, "");
    if (!/^[0-9]{10}$/.test(cleanPhone)) return showToast("Please enter a valid 10-digit phone number.", "error");
    cleanPhone = "+91" + cleanPhone;

    if (!pass)                          return showToast("Please enter a password.", "error");
    if (pass.length < 6)                return showToast("Password must be at least 6 characters.", "error");
    if (pass !== confirmPass)           return showToast("Passwords do not match.", "error");

    showToast("Creating your account…", "info");
    try {
      await ensureRuntimeConfigLoaded();
      const usersRef = collection(db, "users");
      const q        = query(usersRef, where("phone", "==", cleanPhone));
      const snap     = await getDocs(q);
      if (!snap.empty) return showToast("Account already exists. Please login.", "error");

      const refCode = generateReferralCode(name);

      const newUserRef = await addDoc(collection(db, "users"), {
        name, phone: cleanPhone, password: pass,
        balance: 0, withdrawableBalance: 0, totalInvested: 0, totalReturns: 0, activePlans: 0,
        withdrawPassword: null, disabled: false,
        referralCode: refCode, referredBy: referral || null,
        referralBonusPaid: false,
        dailyRewardStreak: 0, lastRewardDate: null, rewardHistory: [],
        darkMode: false, notificationsEnabled: true,
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, "notifications"), {
        userId: newUserRef.id,
        message: "Welcome to SliceInvest! 🎉 Start by making a deposit to begin investing.",
        type: "success", read: false, createdAt: serverTimestamp()
      });

      ["signupName", "signupPhone", "signupPassword", "signupConfirmPassword", "signupReferral"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      showToast("Account created! 🎉 Logging you in…", "success");

      currentUser = newUserRef.id;
      currentUserData = {
        id: newUserRef.id, name, phone: cleanPhone,
        balance: 0, withdrawableBalance: 0, totalInvested: 0, totalReturns: 0, activePlans: 0,
        withdrawPassword: null, referralCode: refCode,
        referralBonusPaid: false,
        dailyRewardStreak: 0, lastRewardDate: null, rewardHistory: []
      };

      // ═══ FIX: Save session for auto-login ═══
      saveUserSession(currentUser);

      setTimeout(() => { showPage("userDashboard"); initUserDashboard(); }, 800);
    } catch (err) {
      console.error("Signup error:", err);
      showToast("Registration failed: " + err.message, "error");
    }
  };

  // ─── USER LOGIN ───────────────────────────────────────────────
  window.userLogin = async () => {
    const phoneRaw = document.getElementById("userPhone").value.trim();
    const pass  = document.getElementById("userPassword").value.trim();
    if (!phoneRaw || !pass) return showToast("Please fill all fields.", "error");

    // ═══ FIX: Auto-add +91 prefix ═══
    let phone = phoneRaw.replace(/\s/g, "").replace(/^\+91/, "");
    if (!/^[0-9]{10}$/.test(phone)) return showToast("Please enter a valid 10-digit phone number.", "error");
    phone = "+91" + phone;

    showToast("Logging in…", "info");
    try {
      const usersRef = collection(db, "users");
      const q        = query(usersRef, where("phone", "==", phone));
      const snap     = await getDocs(q);
      if (snap.empty) return showToast("No account found.", "error");

      const userDoc  = snap.docs[0];
      const userData = userDoc.data();

      if (userData.password !== pass) return showToast("Incorrect password.", "error");
      if (userData.disabled) return showToast("Account disabled.", "error");

      currentUser     = userDoc.id;
      currentUserData = { id: userDoc.id, ...userData };

      // ═══ FIX: Save session for auto-login ═══
      saveUserSession(currentUser);

      if (userData.darkMode) {
        document.body.classList.add("dark-mode");
        const toggle = document.getElementById("darkModeToggle");
        if (toggle) toggle.checked = true;
      }

      showToast("Welcome back, " + userData.name + "! 👋", "success");
      showPage("userDashboard");
      initUserDashboard();
    } catch(err) {
      console.error(err);
      showToast("Login failed: " + err.message, "error");
    }
  };

  // ─── LOGOUT ───────────────────────────────────────────────────
  window.logout = () => {
    currentUser     = null;
    currentUserData = null;
    bankAccounts    = [];
    allTransactions = [];
    uploadedScreenshot = null;

    // ═══ FIX: Clear saved session ═══
    clearUserSession();

    ["userPhone","userPassword","signupName","signupPhone","signupPassword","signupConfirmPassword","signupReferral"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.querySelectorAll(".bottom-nav .nav-item").forEach(b => b.classList.remove("active"));
    const homeBtn = document.querySelector('.bottom-nav .nav-item[data-page="home"]');
    if (homeBtn) homeBtn.classList.add("active");
    document.body.classList.remove("dark-mode");
    showPage("loginPage");
    showToast("Logged out successfully.", "info");
  };

  // ═══════════════════════════════════════════════════════════════
  //  USER DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  async function initUserDashboard() {
    await loadDynamicPlans();
    loadRuntimeConfig();
    renderPlans();
    loadUserData();
    loadMyInvestments();
    loadTransactions();
    loadNotifications();
    loadBankAccounts();
    loadDailyRewardStatus();
    renderDailyCalendar();
    loadMyUploadedSlips();
    processAutoDailyReturns();
    switchUserTab("home", document.querySelector('.nav-item[data-page="home"]'));
  }

  async function loadUserData() {
    try {
      const snap = await getDoc(doc(db, "users", currentUser));
      if (!snap.exists()) return;
      currentUserData = { id: snap.id, ...snap.data() };

      const name = currentUserData.name || "Investor";
      document.getElementById("userNameDisplay").textContent = name;
      document.getElementById("walletBalance").textContent   = fmt(currentUserData.balance || 0);
      document.getElementById("walletBalance2").textContent  = fmt(currentUserData.balance || 0);
      document.getElementById("totalInvested").textContent   = fmt(currentUserData.totalInvested || 0);
      document.getElementById("totalReturns").textContent    = fmt(currentUserData.totalReturns || 0);
      document.getElementById("activePlans").textContent     = currentUserData.activePlans || 0;

      const withdrawableEl = document.getElementById("withdrawableBalance");
      if (withdrawableEl) withdrawableEl.textContent = fmt(currentUserData.withdrawableBalance || 0);

      const refCodeEl = document.getElementById("referralCode");
      if (refCodeEl) {
        refCodeEl.textContent = currentUserData.referralCode || generateReferralCode(name);
        if (!currentUserData.referralCode) {
          await updateDoc(doc(db, "users", currentUser), { referralCode: refCodeEl.textContent });
        }
      }

      document.getElementById("settingsUserName").textContent  = name;
      document.getElementById("settingsUserPhone").textContent = currentUserData.phone || "";

      let completion = 20;
      if (currentUserData.name) completion += 20;
      if (currentUserData.email) completion += 15;
      if (currentUserData.withdrawPassword) completion += 20;
      if (bankAccounts.length > 0) completion += 15;
      if (currentUserData.totalInvested > 0) completion += 10;
      completion = Math.min(100, completion);
      const pcFill = document.getElementById("pcFill");
      const pcText = document.querySelector(".pc-text");
      if (pcFill) pcFill.style.width = completion + "%";
      if (pcText) pcText.textContent = completion + "% Complete";

      const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
      ["headerAvatar", "settingsAvatar"].forEach(elId => {
        const el = document.getElementById(elId);
        if (el) el.textContent = initials;
      });

      renderPortfolioChart();
    } catch(err) { console.error("loadUserData:", err); }
  }

  // ─── Render Plans (DYNAMIC from admin) ────────────────────────
  function renderPlans() {
    const grid = document.getElementById("plansGrid");
    if (!grid) return;
    const planBadge = document.getElementById("planCountBadge");
    if (planBadge) planBadge.textContent = PLANS.length + " Plans";

    grid.innerHTML = PLANS.map(p => `
      <div class="plan-card ${p.badge}">
        <span class="plan-badge ${p.badgeClass}">${p.badge}</span>
        <div class="plan-icon"><i class="${p.icon}"></i></div>
        <div class="plan-name">${p.name}</div>
        <div class="plan-amount">${fmt(p.amount).replace(".00","")}</div>
        <div class="plan-features">
          ${(p.features || []).map(f => `<div class="plan-feature"><i class="fas fa-check-circle"></i>${f}</div>`).join("")}
        </div>
        <button class="plan-invest-btn" onclick="openInvestModal('${p.id}')">
          <i class="fas fa-seedling"></i> Invest Now
        </button>
      </div>
    `).join("");
  }

  // ─── Invest ───────────────────────────────────────────────────
  window.openInvestModal = (planId) => {
    selectedPlan = PLANS.find(p => p.id === planId);
    if (!selectedPlan) return;
    const maxP = selectedPlan.maxPurchases || MAX_PURCHASES_PER_PLAN;
    document.getElementById("selectedPlanPreview").innerHTML = `
      <div class="spp-name">${selectedPlan.name}</div>
      <div class="spp-amount">${fmt(selectedPlan.amount)}</div>
      <div class="spp-detail"><i class="fas fa-coins"></i> ₹${selectedPlan.dailyReturnFixed} Daily Returns</div>
      <div class="spp-detail"><i class="fas fa-arrow-right-arrow-left"></i> Daily Withdraw Available</div>
      <div class="spp-detail"><i class="fas fa-calendar-days"></i> Term: ${selectedPlan.duration} Days</div>
      <div class="spp-detail"><i class="fas fa-repeat"></i> Max ${maxP} Purchases</div>
    `;
    openModal("investModal");
  };

  window.confirmInvest = async () => {
    if (!selectedPlan) return;

    if (isInvestProcessing) {
      return showToast("Processing your investment, please wait...", "warning");
    }
    isInvestProcessing = true;

    try {
      const maxP = selectedPlan.maxPurchases || MAX_PURCHASES_PER_PLAN;
      const investSnap = await getDocs(
        query(collection(db, "investments"),
          where("userId", "==", currentUser),
          where("planId", "==", selectedPlan.id),
          where("status", "==", "active")
        )
      );
      if (investSnap.size >= maxP) {
        isInvestProcessing = false;
        return showToast(`You can only have ${maxP} active purchases of ${selectedPlan.name}. Wait for current plans to complete.`, "error");
      }

      const freshSnap = await getDoc(doc(db, "users", currentUser));
      if (!freshSnap.exists()) {
        isInvestProcessing = false;
        return showToast("User not found. Please re-login.", "error");
      }
      const freshData = freshSnap.data();
      const balance = freshData.balance || 0;

      if (balance < selectedPlan.amount) {
        isInvestProcessing = false;
        return showToast("Insufficient balance. Deposit first.", "error");
      }

      const newBalance    = balance - selectedPlan.amount;
      const totalInvested = (freshData.totalInvested || 0) + selectedPlan.amount;
      const activePlans   = (freshData.activePlans   || 0) + 1;

      const now = new Date();
      const endDate = new Date(now.getTime() + selectedPlan.duration * 24 * 60 * 60 * 1000);

      await updateDoc(doc(db, "users", currentUser), { balance: newBalance, totalInvested, activePlans });

      await addDoc(collection(db, "investments"), {
        userId: currentUser, planId: selectedPlan.id, planName: selectedPlan.name,
        amount: selectedPlan.amount, dailyReturnFixed: selectedPlan.dailyReturnFixed,
        duration: selectedPlan.duration,
        startDate: serverTimestamp(),
        endDate: Timestamp.fromDate(endDate),
        daysCompleted: 0,
        lastDisbursedDate: null,
        status: "active", createdAt: serverTimestamp()
      });

      await addDoc(collection(db, "transactions"), {
        userId: currentUser, type: "invest", amount: selectedPlan.amount,
        plan: selectedPlan.name, status: "approved", createdAt: serverTimestamp()
      });

      currentUserData.balance       = newBalance;
      currentUserData.totalInvested = totalInvested;
      currentUserData.activePlans   = activePlans;

      closeModal("investModal");
      loadUserData();
      loadMyInvestments();
      loadTransactions();
      showToast(`Invested ${fmt(selectedPlan.amount)} in ${selectedPlan.name}! 🎉 Returns start daily.`, "success");
    } catch(err) {
      console.error(err);
      showToast("Investment failed: " + err.message, "error");
    } finally {
      isInvestProcessing = false;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  AUTO DAILY RETURNS DISPERSAL
  // ═══════════════════════════════════════════════════════════════

  async function processAutoDailyReturns() {
    if (!currentUser) return;

    // ═══ FIX: Daily returns settle at 12:02 AM only ═══
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Don't process before 12:02 AM (00:02)
    if (currentHour === 0 && currentMinute < 2) return;

    const today = getTodayString();

    // Today's settlement cutoff: 12:02 AM today
    // Plans purchased AFTER this cutoff won't receive returns until tomorrow
    const todayCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 2, 0);

    try {
      const investSnap = await getDocs(
        query(collection(db, "investments"),
          where("userId", "==", currentUser),
          where("status", "==", "active")
        )
      );

      if (investSnap.empty) return;

      let totalDailyCredit = 0;
      let plansCompleted = 0;

      for (const invDoc of investSnap.docs) {
        const inv = invDoc.data();
        const lastDisbursed = inv.lastDisbursedDate || null;

        if (lastDisbursed === today) continue;

        // ═══ FIX: Skip plans purchased after today's 12:02 AM cutoff ═══
        // These plans will get their first return at tomorrow's 12:02 AM
        const investCreatedAt = inv.createdAt || inv.startDate;
        if (investCreatedAt) {
          const createdDate = investCreatedAt.toDate ? investCreatedAt.toDate() : new Date(investCreatedAt);
          if (createdDate >= todayCutoff) continue;
        }

        const daysCompleted = inv.daysCompleted || 0;
        const duration = inv.duration || 15;

        if (daysCompleted >= duration) {
          await updateDoc(doc(db, "investments", invDoc.id), { status: "completed" });
          plansCompleted++;
          continue;
        }

        const dailyReturn = inv.dailyReturnFixed || 0;
        totalDailyCredit += dailyReturn;

        await updateDoc(doc(db, "investments", invDoc.id), {
          daysCompleted: daysCompleted + 1,
          lastDisbursedDate: today
        });

        if (daysCompleted + 1 >= duration) {
          await updateDoc(doc(db, "investments", invDoc.id), { status: "completed" });
          plansCompleted++;
        }
      }

      if (totalDailyCredit > 0) {
        const freshSnap = await getDoc(doc(db, "users", currentUser));
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          const newBalance = (freshData.balance || 0) + totalDailyCredit;
          const newWithdrawable = (freshData.withdrawableBalance || 0) + totalDailyCredit;
          const newTotalReturns = (freshData.totalReturns || 0) + totalDailyCredit;
          const newActivePlans = Math.max(0, (freshData.activePlans || 0) - plansCompleted);

          await updateDoc(doc(db, "users", currentUser), {
            balance: newBalance,
            withdrawableBalance: newWithdrawable,
            totalReturns: newTotalReturns,
            activePlans: newActivePlans
          });

          await addDoc(collection(db, "transactions"), {
            userId: currentUser, type: "daily_return", amount: totalDailyCredit,
            plan: "Daily Investment Returns",
            status: "approved", createdAt: serverTimestamp()
          });

          await addDoc(collection(db, "notifications"), {
            userId: currentUser,
            message: `💰 Daily returns of ${fmt(totalDailyCredit)} credited to your wallet from active plans!`,
            type: "success", read: false, createdAt: serverTimestamp()
          });

          loadUserData();
          loadTransactions();
          showToast(`💰 Daily returns ${fmt(totalDailyCredit)} credited!`, "success");
        }
      }

      if (plansCompleted > 0 && totalDailyCredit === 0) {
        const freshSnap = await getDoc(doc(db, "users", currentUser));
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          await updateDoc(doc(db, "users", currentUser), {
            activePlans: Math.max(0, (freshData.activePlans || 0) - plansCompleted)
          });
          loadUserData();
        }
      }

    } catch(err) {
      console.error("Auto daily returns error:", err);
    }
  }

  // ─── Deposit ──────────────────────────────────────────────────
  window.setDepositAmount = (val) => { document.getElementById("depositAmount").value = val; };

  window.submitDeposit = async () => {
    if (isDepositProcessing) {
      return showToast("Processing your deposit, please wait...", "warning");
    }

    await ensureRuntimeConfigLoaded();
    const amount = parseFloat(document.getElementById("depositAmount").value);
    const utr    = document.getElementById("depositUTR").value.trim();
    const minDeposit = Number(runtimePlatformConfig.minDeposit || DEFAULT_PLATFORM_CONFIG.minDeposit);

    if (!amount || amount < minDeposit) return showToast(`Minimum deposit is ${fmt(minDeposit)}.`, "error");
    if (!uploadedScreenshot) return showToast("Please upload payment screenshot.", "error");
    if (!utr) return showToast("Please enter UTR / Transaction ID.", "error");
    if (utr.length < 6) return showToast("Please enter a valid UTR number.", "error");

    // ═══ FIX: Set processing flag & show button loading state ═══
    isDepositProcessing = true;
    const depositBtn = document.getElementById("depositSubmitBtn");
    if (depositBtn) {
      depositBtn.disabled = true;
      depositBtn.classList.add("btn-loading");
      depositBtn.innerHTML = '<div class="btn-spinner"></div> Submitting...';
    }

    try {
      const screenshotData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(uploadedScreenshot);
      });

      await addDoc(collection(db, "requests"), {
        userId: currentUser, userName: currentUserData.name, userPhone: currentUserData.phone,
        type: "deposit", amount, method: "upi",
        reference: utr,
        screenshot: screenshotData,
        screenshotName: uploadedScreenshot.name,
        hasScreenshot: true,
        status: "pending", createdAt: serverTimestamp()
      });
      await addDoc(collection(db, "transactions"), {
        userId: currentUser, type: "deposit", amount, method: "upi",
        reference: utr, hasScreenshot: true,
        status: "pending", createdAt: serverTimestamp()
      });

      // ═══ Show success animation on button before closing ═══
      if (depositBtn) {
        depositBtn.classList.remove("btn-loading");
        depositBtn.classList.add("btn-success-anim");
        depositBtn.innerHTML = '<i class="fas fa-check-circle"></i> Submitted!';
      }

      await new Promise(r => setTimeout(r, 800));

      closeModal("depositModal");
      document.getElementById("depositAmount").value = "";
      document.getElementById("depositUTR").value = "";
      uploadedScreenshot = null;
      const placeholder = document.getElementById("screenshotPlaceholder");
      const preview = document.getElementById("screenshotPreview");
      const previewImg = document.getElementById("screenshotPreviewImg");
      const input = document.getElementById("screenshotInput");
      if (placeholder) placeholder.classList.remove("hidden");
      if (preview) preview.classList.add("hidden");
      if (previewImg) previewImg.src = "";
      if (input) input.value = "";

      loadTransactions();
      showToast("Deposit request submitted! 📤 Will be verified shortly.", "success");
    } catch(err) {
      console.error(err);
      showToast("Failed: " + err.message, "error");
    } finally {
      isDepositProcessing = false;
      // ═══ Reset button state ═══
      if (depositBtn) {
        depositBtn.disabled = false;
        depositBtn.classList.remove("btn-loading", "btn-success-anim");
        depositBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Deposit';
      }
    }
  };

  // ─── Withdraw ─────────────────────────────────────────────────
  window.setWithdrawAmount = (val) => { document.getElementById("withdrawAmount").value = val; };

  window.submitWithdrawal = async () => {
    await ensureRuntimeConfigLoaded();

    if (!runtimeWithdrawConfig.apiWithdrawEnabled) {
      return showToast("Withdrawals are currently disabled by admin. Please try again later.", "error");
    }

    const amount  = parseFloat(document.getElementById("withdrawAmount").value);
    const bankSel = document.getElementById("withdrawBankSelect").value;
    const newAcc  = document.getElementById("withdrawAccount")?.value.trim() || "";
    const wPass   = document.getElementById("withdrawPassword").value.trim();
    const minWithdraw = Number(runtimePlatformConfig.minWithdraw || DEFAULT_PLATFORM_CONFIG.minWithdraw);

    if (!amount || amount < minWithdraw) return showToast(`Minimum withdrawal is ${fmt(minWithdraw)}.`, "error");
    if (!wPass) return showToast("Withdraw password required.", "error");

    const storedWP = currentUserData?.withdrawPassword;
    if (!storedWP) return showToast("Set a withdraw password first in Settings.", "warning");
    if (storedWP !== wPass) return showToast("Incorrect withdraw password.", "error");

    if (isWithdrawProcessing) {
      return showToast("Processing your withdrawal, please wait...", "warning");
    }
    isWithdrawProcessing = true;

    try {
      const freshSnap = await getDoc(doc(db, "users", currentUser));
      if (!freshSnap.exists()) {
        isWithdrawProcessing = false;
        return showToast("User not found. Please re-login.", "error");
      }
      const freshData = freshSnap.data();
      const balance = freshData.balance || 0;
      const withdrawableBalance = freshData.withdrawableBalance || 0;

      if (withdrawableBalance < amount) {
        isWithdrawProcessing = false;
        return showToast(`Insufficient withdrawable funds. Available: ${fmt(withdrawableBalance)}`, "error");
      }

      if (balance < amount) {
        isWithdrawProcessing = false;
        return showToast("Insufficient balance.", "error");
      }

      let account = "";
      let bankDetails = null;
      let withdrawMethod = "unknown";

      if (bankSel && bankSel !== "new" && bankSel !== "") {
        const bank = bankAccounts.find(b => b.id === bankSel);
        if (bank) {
          if (bank.type === "upi") {
            if (!runtimeWithdrawConfig.upiWithdrawEnabled) {
              isWithdrawProcessing = false;
              return showToast("UPI withdrawals are currently disabled by admin.", "error");
            }
            account = `UPI: ${bank.upiId}`;
            bankDetails = { type: "upi", upiId: bank.upiId, displayName: bank.displayName || "" };
            withdrawMethod = "upi";
          } else {
            if (!runtimeWithdrawConfig.bankWithdrawEnabled) {
              isWithdrawProcessing = false;
              return showToast("Bank withdrawals are currently disabled by admin.", "error");
            }
            account = `${bank.bankName} | ${bank.accountNumber} | ${bank.ifsc || ""} | ${bank.holderName}`;
            bankDetails = {
              type: "bank", bankName: bank.bankName || "", accountNumber: bank.accountNumber || "",
              ifsc: bank.ifsc || "", holderName: bank.holderName || ""
            };
            withdrawMethod = "bank";
          }
        }
      } else if (bankSel === "new") {
        account = newAcc;
        withdrawMethod = "manual";
      }

      if (!account) {
        isWithdrawProcessing = false;
        return showToast("Please select or enter account details.", "error");
      }

      const newBalance = balance - amount;
      const newWithdrawable = withdrawableBalance - amount;
      await updateDoc(doc(db, "users", currentUser), { balance: newBalance, withdrawableBalance: newWithdrawable });
      currentUserData.balance = newBalance;
      currentUserData.withdrawableBalance = newWithdrawable;

      const withdrawRequest = {
        userId: currentUser, userName: currentUserData.name, userPhone: currentUserData.phone,
        type: "withdraw", amount, account, withdrawMethod,
        status: "pending", balanceDeducted: true, createdAt: serverTimestamp()
      };
      if (bankDetails) withdrawRequest.bankDetails = bankDetails;
      await addDoc(collection(db, "requests"), withdrawRequest);
      await addDoc(collection(db, "transactions"), {
        userId: currentUser, type: "withdraw", amount, account,
        status: "pending", createdAt: serverTimestamp()
      });

      closeModal("withdrawModal");
      document.getElementById("withdrawAmount").value   = "";
      if (document.getElementById("withdrawAccount")) document.getElementById("withdrawAccount").value  = "";
      document.getElementById("withdrawPassword").value = "";
      loadUserData();
      loadTransactions();
      showToast("Withdrawal request submitted! Amount held from balance. 📨", "success");
    } catch(err) {
      console.error(err);
      showToast("Failed: " + err.message, "error");
    } finally {
      isWithdrawProcessing = false;
    }
  };

  // ─── Withdraw Password ────────────────────────────────────────
  window.setWithdrawPassword = async () => {
    const curr    = document.getElementById("currentWithdrawPass").value.trim();
    const newPass = document.getElementById("newWithdrawPass").value.trim();
    const confirmVal = document.getElementById("confirmWithdrawPass").value.trim();

    if (!newPass)               return showToast("New password cannot be empty.", "error");
    if (newPass !== confirmVal) return showToast("Passwords do not match.", "error");
    if (newPass.length < 4)     return showToast("Minimum 4 characters.", "error");

    if (currentUserData?.withdrawPassword && curr !== currentUserData.withdrawPassword) {
      return showToast("Current password is incorrect.", "error");
    }

    try {
      await updateDoc(doc(db, "users", currentUser), { withdrawPassword: newPass });
      currentUserData.withdrawPassword = newPass;
      ["currentWithdrawPass","newWithdrawPass","confirmWithdrawPass"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
      });
      closeModal("withdrawPassModal");
      showToast("Withdraw password saved! 🔐", "success");
      loadUserData();
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };

  // ─── Change Login Password ────────────────────────────────────
  window.changeLoginPassword = async () => {
    const curr    = document.getElementById("currLoginPass").value.trim();
    const newPass = document.getElementById("newLoginPass").value.trim();
    const confirm = document.getElementById("confirmLoginPass").value.trim();

    if (!curr) return showToast("Enter current password.", "error");
    if (curr !== currentUserData?.password) return showToast("Current password incorrect.", "error");
    if (!newPass || newPass.length < 6) return showToast("New password min 6 chars.", "error");
    if (newPass !== confirm) return showToast("Passwords don't match.", "error");

    try {
      await updateDoc(doc(db, "users", currentUser), { password: newPass });
      currentUserData.password = newPass;
      ["currLoginPass","newLoginPass","confirmLoginPass"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
      });
      closeModal("changePasswordModal");
      showToast("Password updated! ✅", "success");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };

  // ─── Edit Profile ─────────────────────────────────────────────
  window.saveProfile = async () => {
    const name  = document.getElementById("editName").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    if (!name || name.length < 2) return showToast("Name too short.", "error");
    try {
      await updateDoc(doc(db, "users", currentUser), { name, email });
      currentUserData.name = name;
      currentUserData.email = email;
      closeModal("editProfileModal");
      loadUserData();
      showToast("Profile updated! ✅", "success");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };

  // ─── BANK ACCOUNTS ───────────────────────────────────────────
  async function loadBankAccounts() {
    try {
      const q    = query(collection(db, "bankAccounts"), where("userId","==",currentUser));
      const snap = await getDocs(q);
      bankAccounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderBankAccounts();
      updateBankSelect();
      const countEl = document.getElementById("bankAccountCount");
      if (countEl) countEl.textContent = bankAccounts.length;
    } catch(err) { console.error("loadBankAccounts:", err); bankAccounts = []; }
  }

  function renderBankAccounts() {
    const container = document.getElementById("bankAccountsList");
    if (!container) return;
    if (!bankAccounts.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-credit-card"></i><p>No saved accounts</p></div>`;
      return;
    }
    container.innerHTML = bankAccounts.map(b => {
      const isUPI = b.type === "upi";
      const icon  = isUPI ? "fa-mobile-screen" : "fa-building-columns";
      const title = isUPI ? b.upiId : `${b.bankName || "Bank"} ****${(b.accountNumber || "").slice(-4)}`;
      const sub   = isUPI ? (b.displayName || "UPI") : (b.holderName || "—");
      return `
        <div class="bank-account-item">
          <div class="ba-icon"><i class="fas ${icon}"></i></div>
          <div class="ba-info">
            <div class="ba-name">${title}</div>
            <div class="ba-detail">${sub}</div>
          </div>
          <button class="ba-delete" onclick="deleteBankAccount('${b.id}')"><i class="fas fa-trash"></i></button>
        </div>
      `;
    }).join("");
  }

  function updateBankSelect() {
    const sel = document.getElementById("withdrawBankSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select saved account —</option>';
    bankAccounts.forEach(b => {
      const isUPI = b.type === "upi";
      const label = isUPI ? `UPI: ${b.upiId}` : `${b.bankName} ****${(b.accountNumber || "").slice(-4)}`;
      sel.innerHTML += `<option value="${b.id}">${label}</option>`;
    });
    sel.innerHTML += '<option value="new">+ Enter new account</option>';
  }

  window.saveBankAccount = async () => {
    const activeBankTab = document.querySelector(".bt-tab.active");
    const isUPI = activeBankTab?.textContent?.includes("UPI");
    try {
      if (isUPI) {
        const upiId = document.getElementById("upiId").value.trim();
        const name  = document.getElementById("upiDisplayName").value.trim();
        if (!upiId) return showToast("Enter UPI ID.", "error");
        await addDoc(collection(db, "bankAccounts"), {
          userId: currentUser, type: "upi", upiId, displayName: name, createdAt: serverTimestamp()
        });
      } else {
        const holder  = document.getElementById("bankHolderName").value.trim();
        const bank    = document.getElementById("bankName").value.trim();
        const accNum  = document.getElementById("bankAccountNumber").value.trim();
        const accConf = document.getElementById("bankAccountConfirm").value.trim();
        const ifsc    = document.getElementById("bankIFSC").value.trim();
        if (!holder || !bank || !accNum || !ifsc) return showToast("Fill all bank fields.", "error");
        if (accNum !== accConf) return showToast("Account numbers don't match.", "error");
        await addDoc(collection(db, "bankAccounts"), {
          userId: currentUser, type: "bank",
          holderName: holder, bankName: bank, accountNumber: accNum, ifsc,
          createdAt: serverTimestamp()
        });
      }
      closeModal("addBankModal");
      ["bankHolderName","bankName","bankAccountNumber","bankAccountConfirm","bankIFSC","upiId","upiDisplayName"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
      });
      await loadBankAccounts();
      loadUserData();
      showToast("Bank account saved! 🏦", "success");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };

  window.deleteBankAccount = async (accountId) => {
    if (!confirm("Delete this bank account?")) return;
    try {
      await deleteDoc(doc(db, "bankAccounts", accountId));
      await loadBankAccounts();
      showToast("Account removed.", "info");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };

  // ─── Load My Investments ──────────────────────────────────────
  window.loadMyInvestments = async () => {
    const container = document.getElementById("investmentsList");
    if (!container) return;
    try {
      const q    = query(collection(db, "investments"), where("userId","==", currentUser));
      const snap = await getDocs(q);
      const docs = sortDocsByCreatedAt(snap.docs, 10);
      if (!docs.length) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No investments yet</p></div>`;
        return;
      }
      container.innerHTML = docs.map(d => {
        const inv = d.data();
        const plan = PLANS.find(p => p.id === inv.planId) || {};
        const dailyReturn = inv.dailyReturnFixed || (plan.dailyReturnFixed || 0);
        const daysCompleted = inv.daysCompleted || 0;
        const duration = inv.duration || 15;
        const progressPct = Math.min(100, Math.round((daysCompleted / duration) * 100));
        return `
          <div class="investment-item">
            <div class="inv-icon"><i class="${plan.icon || 'fas fa-chart-line'}"></i></div>
            <div class="inv-info">
              <div class="inv-name">${inv.planName}</div>
              <div class="inv-date">Started: ${fmtDate(inv.startDate)} • ₹${dailyReturn}/day • ${daysCompleted}/${duration} days</div>
              <div class="inv-progress-bar" style="background:rgba(108,92,231,0.1);height:6px;border-radius:3px;margin-top:6px;overflow:hidden;">
                <div style="width:${progressPct}%;height:100%;background:linear-gradient(90deg,#6C5CE7,#00B894);border-radius:3px;transition:width 0.3s;"></div>
              </div>
              <span class="txn-status status-${inv.status}">${inv.status}</span>
            </div>
            <div class="inv-amount">${fmt(inv.amount)}</div>
          </div>
        `;
      }).join("");
    } catch(err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${err.message}</p></div>`;
    }
  };

  // ─── Load Transactions ────────────────────────────────────────
  async function loadTransactions() {
    try {
      const q    = query(collection(db, "transactions"), where("userId","==",currentUser));
      const snap = await getDocs(q);
      allTransactions = sortDocsByCreatedAt(snap.docs, 50).map(d => ({ id: d.id, ...d.data() }));
      renderTransactions(allTransactions.slice(0, 10), "transactionsList");
      renderTransactions(allTransactions, "walletTransactionsList");
    } catch(err) { console.error(err); }
  }

  function renderTransactions(transactions, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!transactions.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>No transactions yet</p></div>`;
      return;
    }
    container.innerHTML = transactions.map(t => {
      const isCredit = t.type === "deposit" || t.type === "daily_return";
      const typeIcon = t.type === "deposit" ? "deposit" : t.type === "withdraw" ? "withdraw" : t.type === "daily_return" ? "deposit" : "invest";
      const iconClass= t.type === "deposit" ? "fa-circle-arrow-down" : t.type === "withdraw" ? "fa-arrow-up-from-bracket" : t.type === "daily_return" ? "fa-coins" : "fa-seedling";
      const label    = t.type === "deposit" ? "Deposit" : t.type === "withdraw" ? "Withdrawal" : t.type === "daily_return" ? "Daily Return" : "Investment — " + (t.plan || "");
      return `
        <div class="txn-item">
          <div class="txn-icon ${typeIcon}"><i class="fas ${iconClass}"></i></div>
          <div class="txn-info">
            <div class="txn-type">${label}</div>
            <div class="txn-date">${fmtDateTime(t.createdAt)}</div>
            <span class="txn-status status-${t.status}">${t.status}</span>
          </div>
          <div>
            <div class="txn-amount ${isCredit ? 'credit':'debit'}">${isCredit?'+':'-'}${fmt(t.amount)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.filterTransactions = (type, btn) => {
    document.querySelectorAll(".txn-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const filtered = type === "all" ? allTransactions : allTransactions.filter(t => t.type === type);
    renderTransactions(filtered, "walletTransactionsList");
  };

  // ─── Notifications ────────────────────────────────────────────
  let notificationDocs = [];

  async function loadNotifications() {
    try {
      const q    = query(collection(db, "notifications"), where("userId","==",currentUser));
      const snap = await getDocs(q);
      const docs = sortDocsByCreatedAt(snap.docs, 20);
      notificationDocs = docs;
      const badge = document.getElementById("notifBadge");
      const markAllBtn = document.getElementById("markAllReadBtn");
      if (!docs.length) {
        if (badge) badge.classList.add("hidden");
        if (markAllBtn) markAllBtn.style.display = "none";
        document.getElementById("notificationsList").innerHTML = `<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No notifications</p></div>`;
        return;
      }
      const unread = docs.filter(d => !d.data().read).length;
      if (badge) {
        if (unread > 0) { badge.textContent = unread; badge.classList.remove("hidden"); }
        else { badge.classList.add("hidden"); }
      }
      if (markAllBtn) markAllBtn.style.display = unread > 0 ? "inline-flex" : "none";

      document.getElementById("notificationsList").innerHTML = docs.map((d, index) => {
        const n = d.data();
        const isRead = n.read === true;
        const color = n.type === "success" ? "dot-green" : n.type === "warning" ? "dot-orange" : n.type === "error" ? "dot-red" : "dot-blue";
        const readClass = isRead ? "notif-read" : "notif-unread";
        return `
          <div class="notif-item ${readClass}" data-notif-id="${d.id}" onclick="markNotificationRead('${d.id}', this)">
            <div class="notif-dot ${color}"></div>
            <div style="flex:1;min-width:0;">
              <div class="notif-text">${n.message}</div>
              <div class="notif-time">${fmtDateTime(n.createdAt)}</div>
            </div>
            <span class="notif-read-check"><i class="fas fa-check-circle"></i></span>
          </div>
        `;
      }).join("");
    } catch(err) { console.error("Notifications:", err); }
  }

  window.markNotificationRead = async (notifId, element) => {
    if (!notifId || !element) return;
    if (element.classList.contains("notif-read")) return;
    try {
      element.classList.remove("notif-unread");
      element.classList.add("notif-marking-read");
      await updateDoc(doc(db, "notifications", notifId), { read: true });
      setTimeout(() => {
        element.classList.remove("notif-marking-read");
        element.classList.add("notif-read");
      }, 400);
      const badge = document.getElementById("notifBadge");
      if (badge && !badge.classList.contains("hidden")) {
        const currentCount = parseInt(badge.textContent) || 0;
        const newCount = Math.max(0, currentCount - 1);
        if (newCount > 0) { badge.textContent = newCount; }
        else { badge.classList.add("hidden"); const markAllBtn = document.getElementById("markAllReadBtn"); if (markAllBtn) markAllBtn.style.display = "none"; }
      }
    } catch(err) { console.error("Mark notification read error:", err); }
  };

  window.markAllNotificationsRead = async () => {
    try {
      const unreadItems = document.querySelectorAll(".notif-item.notif-unread");
      if (unreadItems.length === 0) { showToast("All notifications already read! ✅", "info"); return; }
      unreadItems.forEach(item => { item.classList.remove("notif-unread"); item.classList.add("notif-marking-read"); });
      const updatePromises = [];
      for (const nd of notificationDocs) {
        const data = nd.data();
        if (!data.read) { updatePromises.push(updateDoc(doc(db, "notifications", nd.id), { read: true })); }
      }
      await Promise.all(updatePromises);
      setTimeout(() => { unreadItems.forEach(item => { item.classList.remove("notif-marking-read"); item.classList.add("notif-read"); }); }, 400);
      const badge = document.getElementById("notifBadge"); if (badge) badge.classList.add("hidden");
      const markAllBtn = document.getElementById("markAllReadBtn"); if (markAllBtn) markAllBtn.style.display = "none";
      showToast("All notifications marked as read ✅", "success");
    } catch(err) { console.error("Mark all read error:", err); showToast("Failed to mark notifications.", "error"); }
  };

  window.showNotifications = () => { loadNotifications(); openModal("notificationsModal"); };

  // ─── Portfolio Chart ──────────────────────────────────────────
  async function renderPortfolioChart() {
    const canvas = document.getElementById("portfolioChart");
    const emptyEl = document.getElementById("portfolioEmpty");
    if (!canvas) return;
    try {
      const q    = query(collection(db, "investments"), where("userId","==",currentUser));
      const snap = await getDocs(q);
      if (snap.empty) { canvas.style.display = "none"; if (emptyEl) emptyEl.classList.remove("hidden"); return; }
      canvas.style.display = "block"; if (emptyEl) emptyEl.classList.add("hidden");
      const planCounts = {};
      snap.docs.forEach(d => { const name = d.data().planName || "Unknown"; planCounts[name] = (planCounts[name] || 0) + 1; });
      if (portfolioChart) portfolioChart.destroy();
      const colors = ["#00B894","#6C5CE7","#E17055","#00CEC9","#FD79A8","#FDCB6E","#74B9FF"];
      portfolioChart = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: { labels: Object.keys(planCounts), datasets: [{ data: Object.values(planCounts), backgroundColor: colors.slice(0, Object.keys(planCounts).length), borderWidth: 0, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { font: { family: "Poppins", size: 12, weight: "600" }, padding: 16 } } } }
      });
    } catch(err) { console.error("Portfolio chart:", err); }
  }

  // ─── Daily Reward ─────────────────────────────────────────────
  function loadDailyRewardStatus() {
    let streak = currentUserData?.dailyRewardStreak || 0;
    if (streak > MAX_REWARD_STREAK) streak = MAX_REWARD_STREAK;
    const streakEl = document.getElementById("rewardStreak");
    if (streakEl) streakEl.textContent = `🔥 Day ${streak}/${MAX_REWARD_STREAK}`;
    const lastReward = currentUserData?.lastRewardDate;
    const today = new Date().toDateString();
    const banner = document.getElementById("dailyRewardBanner");
    const subtextEl = document.getElementById("dailyRewardSubtext");
    if (lastReward) {
      const lastDate = lastReward.toDate ? lastReward.toDate() : new Date(lastReward);
      if (lastDate.toDateString() === today) {
        if (banner) banner.classList.add("claimed");
        if (subtextEl) subtextEl.textContent = "✅ Claimed today! Come back tomorrow.";
      } else { if (banner) banner.classList.remove("claimed"); if (subtextEl) subtextEl.textContent = "Tap to claim your daily bonus!"; }
    } else { if (banner) banner.classList.remove("claimed"); if (subtextEl) subtextEl.textContent = "Tap to claim your first bonus!"; }
  }

  window.claimDailyReward = async () => {
    await ensureRuntimeConfigLoaded();
    const lastReward = currentUserData?.lastRewardDate;
    const today = new Date().toDateString();
    if (lastReward) {
      const lastDate = lastReward.toDate ? lastReward.toDate() : new Date(lastReward);
      if (lastDate.toDateString() === today) return showToast("Already claimed today! Come back tomorrow. 🕐", "warning");
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (lastDate.toDateString() !== yesterday.toDateString()) currentUserData.dailyRewardStreak = 0;
    }
    let currentStreak = currentUserData?.dailyRewardStreak || 0;
    if (currentStreak >= MAX_REWARD_STREAK) currentStreak = 0;
    const streak = currentStreak + 1;
    const baseReward = Number(runtimePlatformConfig.baseReward || DEFAULT_PLATFORM_CONFIG.baseReward);
    const streakBonus = Number(runtimePlatformConfig.streakBonus || DEFAULT_PLATFORM_CONFIG.streakBonus);
    const maxReward = Number(runtimePlatformConfig.maxReward || DEFAULT_PLATFORM_CONFIG.maxReward);
    const bonus  = Math.min(baseReward + streak * streakBonus, maxReward);
    try {
      const newBalance = (currentUserData?.balance || 0) + bonus;
      const rewardHistory = currentUserData?.rewardHistory || [];
      rewardHistory.push(getTodayString());
      const recentHistory = rewardHistory.slice(-30);
      await updateDoc(doc(db, "users", currentUser), { balance: newBalance, dailyRewardStreak: streak, lastRewardDate: serverTimestamp(), rewardHistory: recentHistory });
      currentUserData.balance = newBalance; currentUserData.dailyRewardStreak = streak; currentUserData.rewardHistory = recentHistory;
      await addDoc(collection(db, "notifications"), { userId: currentUser, message: `🎁 Daily reward claimed! ₹${bonus} added. Day ${streak} of ${MAX_REWARD_STREAK}!`, type: "success", read: false, createdAt: serverTimestamp() });
      loadUserData(); loadDailyRewardStatus(); renderDailyCalendar();
      showToast(`🎁 ₹${bonus} bonus claimed! Day ${streak} of ${MAX_REWARD_STREAK}!`, "success");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };

  function renderDailyCalendar() {
    const container = document.getElementById("dailyCalendar");
    if (!container) return;
    const streak = currentUserData?.dailyRewardStreak || 0;
    const lastReward = currentUserData?.lastRewardDate;
    const today = new Date().toDateString();
    let claimedToday = false;
    if (lastReward) { const lastDate = lastReward.toDate ? lastReward.toDate() : new Date(lastReward); claimedToday = lastDate.toDateString() === today; }
    let completedDays = streak; if (completedDays > MAX_REWARD_STREAK) completedDays = 0;
    let html = "";
    for (let day = 1; day <= MAX_REWARD_STREAK; day++) {
      let classes = "daily-day"; let icon = "";
      if (day < completedDays || (day === completedDays && claimedToday)) { classes += " checked"; icon = "✅"; }
      else if (day === completedDays + 1 && !claimedToday && completedDays > 0) { classes += " today"; icon = "🎁"; }
      else if (day === 1 && completedDays === 0 && !claimedToday) { classes += " today"; icon = "🎁"; }
      else { classes += " missed"; icon = "⬜"; }
      const baseReward = Number(runtimePlatformConfig.baseReward || DEFAULT_PLATFORM_CONFIG.baseReward);
      const streakBonusVal = Number(runtimePlatformConfig.streakBonus || DEFAULT_PLATFORM_CONFIG.streakBonus);
      const maxRewardVal = Number(runtimePlatformConfig.maxReward || DEFAULT_PLATFORM_CONFIG.maxReward);
      const dayReward = Math.min(baseReward + day * streakBonusVal, maxRewardVal);
      html += `<div class="${classes}"><span class="day-num">Day ${day}</span><span class="day-icon">${icon}</span><span class="day-num">₹${dayReward}</span></div>`;
    }
    container.innerHTML = html;
  }

  // ─── Calculator ───────────────────────────────────────────────
  window.calculateReturns = () => {
    const amount = parseFloat(document.getElementById("calcAmount")?.value) || 0;
    const rate   = parseFloat(document.getElementById("calcRate")?.value) || 0;
    const days   = parseInt(document.getElementById("calcDays")?.value) || 0;
    const daily = amount * rate / 100; const total = daily * days; const final_ = amount + total;
    document.getElementById("crDaily").textContent = fmt(daily);
    document.getElementById("crTotal").textContent = fmt(total);
    document.getElementById("crFinal").textContent = fmt(final_);
  };

  // ─── Copy Referral ────────────────────────────────────────────
  window.copyReferral = () => {
    const code = document.getElementById("referralCode")?.textContent;
    if (!code || code === "—") return showToast("No referral code yet.", "warning");
    navigator.clipboard.writeText(code).then(() => { showToast("Referral code copied! 📋", "success"); }).catch(() => {
      const textarea = document.createElement('textarea'); textarea.value = code; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); showToast("Referral code copied! 📋", "success");
    });
  };

  // ─── Dark Mode ────────────────────────────────────────────────
  window.toggleDarkMode = async () => {
    const isDark = document.getElementById("darkModeToggle")?.checked;
    document.body.classList.toggle("dark-mode", isDark);
    try { await updateDoc(doc(db, "users", currentUser), { darkMode: isDark }); } catch(err) { console.error(err); }
  };

  window.toggleNotifications = async () => {
    const enabled = document.getElementById("notifToggle")?.checked;
    try { await updateDoc(doc(db, "users", currentUser), { notificationsEnabled: enabled }); showToast(enabled ? "Notifications enabled" : "Notifications disabled", "info"); } catch(err) { console.error(err); }
  };

  // ═══════════════════════════════════════════════════════════════
  //  WITHDRAW SLIP UPLOAD — Users upload payment received proofs
  // ═══════════════════════════════════════════════════════════════

  let uploadedWithdrawSlip = null;

  window.handleWithdrawSlipUpload = (event) => {
    event.stopPropagation();
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast("Please upload an image file.", "error"); return; }
    if (file.size > 5 * 1024 * 1024) { showToast("File too large. Max 5MB.", "error"); return; }
    uploadedWithdrawSlip = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const placeholder = document.getElementById("slipUploadPlaceholder");
      const preview = document.getElementById("slipUploadPreview");
      const previewImg = document.getElementById("slipUploadPreviewImg");
      if (placeholder) placeholder.classList.add("hidden");
      if (preview) preview.classList.remove("hidden");
      if (previewImg) previewImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.removeWithdrawSlip = (event) => {
    event.stopPropagation();
    uploadedWithdrawSlip = null;
    const placeholder = document.getElementById("slipUploadPlaceholder");
    const preview = document.getElementById("slipUploadPreview");
    const previewImg = document.getElementById("slipUploadPreviewImg");
    const input = document.getElementById("slipUploadInput");
    if (placeholder) placeholder.classList.remove("hidden");
    if (preview) preview.classList.add("hidden");
    if (previewImg) previewImg.src = "";
    if (input) input.value = "";
  };

  window.submitWithdrawSlip = async () => {
    if (!uploadedWithdrawSlip) return showToast("Please upload a withdraw slip image.", "error");
    const amount = parseFloat(document.getElementById("slipAmount")?.value);
    if (!amount || amount <= 0) return showToast("Please enter the amount received.", "error");

    showToast("Uploading withdraw slip...", "info");
    try {
      const slipData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(uploadedWithdrawSlip);
      });

      await addDoc(collection(db, "withdrawSlips"), {
        userId: currentUser,
        userName: currentUserData.name,
        userPhone: currentUserData.phone,
        amount: amount,
        slipImage: slipData,
        slipFileName: uploadedWithdrawSlip.name,
        status: "pending", // pending -> verified -> rejected
        bonusAllocated: 0,
        createdAt: serverTimestamp()
      });

      // Reset form
      uploadedWithdrawSlip = null;
      const placeholder = document.getElementById("slipUploadPlaceholder");
      const preview = document.getElementById("slipUploadPreview");
      if (placeholder) placeholder.classList.remove("hidden");
      if (preview) preview.classList.add("hidden");
      if (document.getElementById("slipAmount")) document.getElementById("slipAmount").value = "";
      if (document.getElementById("slipUploadInput")) document.getElementById("slipUploadInput").value = "";

      loadMyUploadedSlips();
      showToast("Withdraw slip uploaded! Admin will verify it. 📤", "success");
    } catch(err) {
      console.error(err);
      showToast("Upload failed: " + err.message, "error");
    }
  };

  // Load user's own uploaded slips
  async function loadMyUploadedSlips() {
    const container = document.getElementById("myUploadedSlipsList");
    if (!container || !currentUser) return;
    try {
      const q = query(collection(db, "withdrawSlips"), where("userId", "==", currentUser));
      const snap = await getDocs(q);
      const docs = sortDocsByCreatedAt(snap.docs, 10);
      if (!docs.length) {
        container.innerHTML = `<div class="empty-state sm"><i class="fas fa-receipt"></i><p>No slips uploaded yet</p></div>`;
        return;
      }
      container.innerHTML = docs.map(d => {
        const data = d.data();
        const statusClass = data.status === "verified" ? "status-approved" : data.status === "rejected" ? "status-rejected" : "status-pending";
        const bonusText = data.bonusAllocated > 0 ? `<span style="color:#00B894;font-size:11px;"> +₹${data.bonusAllocated} bonus</span>` : '';
        return `
          <div class="slip-item">
            <div class="slip-icon"><i class="fas fa-receipt"></i></div>
            <div class="slip-info">
              <div class="slip-amount">${fmt(data.amount)}</div>
              <div class="slip-date">${fmtDateTime(data.createdAt)}</div>
            </div>
            <span class="txn-status ${statusClass}">${data.status}${bonusText}</span>
          </div>
        `;
      }).join("");
    } catch(err) { console.error("Load slips:", err); }
  }

  // ═══════════════════════════════════════════════════════════════
  //  WITHDRAW PROOFS (Public) — Show verified slips from all users
  // ═══════════════════════════════════════════════════════════════

  async function loadWithdrawProofs() {
    const container = document.getElementById("withdrawProofsList");
    if (!container) return;
    try {
      const q = query(collection(db, "withdrawSlips"), where("status", "==", "verified"));
      const snap = await getDocs(q);
      const docs = sortDocsByCreatedAt(snap.docs, 30);

      // Update trust stats
      let totalAmount = 0;
      const uniqueUsers = new Set();
      docs.forEach(d => {
        const data = d.data();
        totalAmount += Number(data.amount || 0);
        if (data.userId) uniqueUsers.add(data.userId);
      });
      const countEl = document.getElementById("proofTotalCount");
      const amountEl = document.getElementById("proofTotalAmount");
      const usersEl = document.getElementById("proofUniqueUsers");
      if (countEl) countEl.textContent = docs.length;
      if (amountEl) amountEl.textContent = fmt(totalAmount);
      if (usersEl) usersEl.textContent = uniqueUsers.size;

      if (!docs.length) {
        container.innerHTML = `<div class="empty-state sm"><i class="fas fa-shield-check"></i><p>No verified proofs yet</p></div>`;
        return;
      }
      container.innerHTML = docs.map(d => {
        const data = d.data();
        const maskedName = maskName(data.userName || "User");
        const adminComment = data.adminComment || "";
        const hasImage = !!data.slipImage;
        const timeAgo = getTimeAgo(data.verifiedAt || data.createdAt);
        return `
          <div class="proof-feed-card" onclick="viewProofImage('${d.id}')">
            <div class="proof-feed-top">
              <div class="proof-feed-avatar"><i class="fas fa-user-check"></i></div>
              <div class="proof-feed-user">
                <div class="proof-feed-name">${maskedName}</div>
                <div class="proof-feed-time">${timeAgo}</div>
              </div>
              <div class="proof-feed-verified"><i class="fas fa-circle-check"></i> Verified</div>
            </div>
            ${hasImage ? `<div class="proof-feed-image-wrap"><img src="${data.slipImage}" alt="Payment Proof" loading="lazy"/><div class="proof-image-overlay"><i class="fas fa-expand"></i> Tap to view</div></div>` : ''}
            <div class="proof-feed-bottom">
              <div class="proof-feed-amount-row">
                <span class="proof-feed-label">Withdrawal Amount</span>
                <span class="proof-feed-amount">${fmt(data.amount)}</span>
              </div>
              ${adminComment ? `<div class="proof-feed-comment"><i class="fas fa-comment-dots"></i><span>${adminComment}</span></div>` : ''}
              <div class="proof-feed-badges">
                <span class="proof-mini-badge green"><i class="fas fa-circle-check"></i> Admin Verified</span>
                <span class="proof-mini-badge blue"><i class="fas fa-shield-halved"></i> Genuine</span>
              </div>
            </div>
          </div>
        `;
      }).join("");
    } catch(err) {
      console.error("Load proofs:", err);
      container.innerHTML = `<div class="empty-state sm"><i class="fas fa-exclamation-circle"></i><p>Could not load proofs</p></div>`;
    }
  }

  function getTimeAgo(ts) {
    if (!ts) return "Recently";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return "Recently";
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
    if (diff < 604800) return Math.floor(diff / 86400) + " days ago";
    return fmtDate(ts);
  }

  window.viewProofImage = async (slipId) => {
    try {
      const snap = await getDoc(doc(db, "withdrawSlips", slipId));
      if (!snap.exists()) return showToast("Proof not found.", "error");
      const data = snap.data();
      if (!data.slipImage) return showToast("No image available.", "error");

      let modal = document.getElementById("proofViewModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "proofViewModal";
        modal.className = "modal-overlay hidden";
        modal.innerHTML = `<div class="modal-card"><div class="modal-header"><h3><i class="fas fa-shield-check"></i> Withdraw Proof</h3><button class="modal-close" onclick="closeModal('proofViewModal')"><i class="fas fa-xmark"></i></button></div><div class="modal-body" style="text-align:center;padding:16px;"><div id="proofViewInfo" style="margin-bottom:12px;text-align:left;"></div><img id="proofViewImg" src="" alt="Withdraw Proof" style="max-width:100%;max-height:400px;border-radius:12px;border:2px solid #e2e8f0;"/><div id="proofViewComment" style="margin-top:12px;text-align:left;"></div></div><div class="modal-footer"><button class="btn-secondary" onclick="closeModal('proofViewModal')">Close</button></div></div>`;
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
        document.body.appendChild(modal);
      }

      const infoEl = document.getElementById("proofViewInfo");
      if (infoEl) {
        infoEl.innerHTML = `
          <div style="background:rgba(0,184,148,0.08);border:1px solid rgba(0,184,148,0.2);border-radius:12px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-weight:700;color:var(--text);">${maskName(data.userName)}</span>
              <span style="font-size:20px;font-weight:900;color:#00B894;">${fmt(data.amount)}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span style="background:rgba(0,184,148,0.15);color:#00B894;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;"><i class="fas fa-circle-check"></i> Admin Verified</span>
              <span style="font-size:11px;color:var(--text-3);">${fmtDateTime(data.verifiedAt || data.createdAt)}</span>
            </div>
          </div>`;
      }
      const commentEl = document.getElementById("proofViewComment");
      if (commentEl && data.adminComment) {
        commentEl.innerHTML = `
          <div style="background:rgba(108,92,231,0.06);border:1px solid rgba(108,92,231,0.15);border-radius:12px;padding:12px;">
            <div style="font-size:10px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;"><i class="fas fa-comment-dots"></i> Admin Comment</div>
            <p style="font-size:13px;color:var(--text);font-weight:500;margin:0;">${data.adminComment}</p>
          </div>`;
      } else if (commentEl) {
        commentEl.innerHTML = '';
      }
      const img = document.getElementById("proofViewImg");
      if (img) img.src = data.slipImage;
      openModal("proofViewModal");
    } catch(err) { showToast("Failed to load proof: " + err.message, "error"); }
  };

  // ─── Edit Profile Modal Prefill ───────────────────────────────
  const origOpenModal = window.openModal;
  window.openModal = (id) => {
    origOpenModal(id);
    if (id === "editProfileModal") {
      document.getElementById("editName").value  = currentUserData?.name || "";
      document.getElementById("editEmail").value = currentUserData?.email || "";
      document.getElementById("editPhone").value = currentUserData?.phone || "";
    }
    if (id === "withdrawModal") {
      updateBankSelect();
      document.getElementById("newAccountFields")?.classList.add("hidden");
    }
    if (id === "depositModal") {
      uploadedScreenshot = null;
      const placeholder = document.getElementById("screenshotPlaceholder");
      const preview = document.getElementById("screenshotPreview");
      if (placeholder) placeholder.classList.remove("hidden");
      if (preview) preview.classList.add("hidden");
    }
  };

  // ─── User Tab Switching ───────────────────────────────────────
  window.switchUserTab = (tab, btn) => {
    document.querySelectorAll(".bottom-nav .nav-item").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    ["homeSection","investSection","walletSection","settingsSection","proofsSection"].forEach(id => {
      const el = document.getElementById(id); if (el) el.classList.add("hidden");
    });

    const sectionMap = { home: "homeSection", invest: "investSection", wallet: "walletSection", settings: "settingsSection", proofs: "proofsSection" };
    const sectionId = sectionMap[tab];
    if (sectionId) document.getElementById(sectionId)?.classList.remove("hidden");

    if (tab === "home")     { loadUserData(); renderDailyCalendar(); }
    if (tab === "invest")   { loadMyInvestments(); }
    if (tab === "proofs")   { loadWithdrawProofs(); }
    if (tab === "wallet")   { loadTransactions(); }
    if (tab === "settings") { loadBankAccounts(); loadUserData(); loadRuntimeConfig(true); loadMyUploadedSlips(); }
  };

  // ─── App Ready ────────────────────────────────────────────────
  window._refreshDashboard = async () => {
    await loadDynamicPlans();
    await loadRuntimeConfig(true);
    await loadUserData();
    renderPlans();
    await loadMyInvestments();
    await loadTransactions();
    await loadNotifications();
    await loadBankAccounts();
    loadDailyRewardStatus();
    renderDailyCalendar();
    loadMyUploadedSlips();
    processAutoDailyReturns();
  };

  // ═══════════════════════════════════════════════════════════════
  //  PULL-TO-REFRESH
  // ═══════════════════════════════════════════════════════════════
  (function setupPullToRefresh() {
    const mainEl = document.getElementById('userMainContent');
    const ptrEl = document.getElementById('pullToRefresh');
    const ptrText = document.getElementById('ptrText');
    const ptrArrow = document.getElementById('ptrArrow');
    const ptrSpinner = document.getElementById('ptrSpinner');
    if (!mainEl || !ptrEl) return;

    const PTR_THRESHOLD = 70; const PTR_MAX_PULL = 110; const PTR_RESISTANCE = 2.5;
    let touchStartY = 0; let touchCurrentY = 0; let isPulling = false; let isRefreshing = false; let pullDistance = 0;

    function getActiveSection() { const sections = ['homeSection', 'investSection', 'walletSection']; for (const id of sections) { const el = document.getElementById(id); if (el && !el.classList.contains('hidden')) return id; } return null; }
    function isAtTop() { return mainEl.scrollTop <= 2; }

    async function performRefresh() {
      const activeSection = getActiveSection();
      try {
        await loadDynamicPlans();
        await loadRuntimeConfig(true);
        await loadUserData();
        if (activeSection === 'homeSection') { await loadTransactions(); await loadNotifications(); loadDailyRewardStatus(); renderDailyCalendar(); processAutoDailyReturns(); }
        else if (activeSection === 'walletSection') { await loadTransactions(); await loadBankAccounts(); }
        else if (activeSection === 'investSection') { await loadMyInvestments(); renderPlans(); }
        showToast('Refreshed! ✨', 'success');
      } catch(err) { console.warn('Pull-to-refresh error:', err); showToast('Refresh failed. Try again.', 'error'); }
    }

    mainEl.addEventListener('touchstart', (e) => { if (isRefreshing) return; const activeSection = getActiveSection(); if (!activeSection) return; if (!isAtTop()) return; touchStartY = e.touches[0].clientY; touchCurrentY = touchStartY; isPulling = true; pullDistance = 0; }, { passive: true });
    mainEl.addEventListener('touchmove', (e) => { if (!isPulling || isRefreshing) return; if (!isAtTop()) { resetPull(); return; } touchCurrentY = e.touches[0].clientY; const rawDistance = touchCurrentY - touchStartY; if (rawDistance <= 0) { resetPull(); return; } pullDistance = Math.min(PTR_MAX_PULL, rawDistance / PTR_RESISTANCE); if (pullDistance > 5 && isAtTop()) e.preventDefault(); ptrEl.style.height = pullDistance + 'px'; ptrEl.classList.add('pulling'); mainEl.classList.add('ptr-active', 'ptr-pulling'); const rotation = (pullDistance / PTR_MAX_PULL) * 360; if (ptrSpinner) ptrSpinner.style.transform = `rotate(${rotation}deg)`; if (pullDistance >= PTR_THRESHOLD) { ptrEl.classList.add('release-ready'); if (ptrText) ptrText.textContent = 'Release to refresh'; } else { ptrEl.classList.remove('release-ready'); if (ptrText) ptrText.textContent = 'Pull down to refresh'; } }, { passive: false });
    mainEl.addEventListener('touchend', () => { if (!isPulling || isRefreshing) return; isPulling = false; if (pullDistance >= PTR_THRESHOLD) triggerRefresh(); else resetPull(); }, { passive: true });
    mainEl.addEventListener('touchcancel', () => { if (isPulling) resetPull(); }, { passive: true });

    function resetPull() { isPulling = false; pullDistance = 0; ptrEl.classList.remove('pulling', 'release-ready'); ptrEl.style.height = '0px'; mainEl.classList.remove('ptr-active', 'ptr-pulling'); if (ptrSpinner) ptrSpinner.style.transform = ''; if (ptrText) ptrText.textContent = 'Pull down to refresh'; }

    async function triggerRefresh() {
      isRefreshing = true; ptrEl.classList.remove('pulling', 'release-ready'); ptrEl.classList.add('refreshing'); ptrEl.style.height = '64px'; mainEl.classList.remove('ptr-pulling'); if (ptrSpinner) ptrSpinner.style.transform = ''; if (ptrText) ptrText.textContent = 'Refreshing...'; if (ptrArrow) ptrArrow.style.display = 'none';
      const ripple = document.createElement('div'); ripple.className = 'ptr-ripple'; ptrEl.appendChild(ripple); setTimeout(() => ripple.remove(), 600);
      await performRefresh();
      setTimeout(() => { isRefreshing = false; ptrEl.classList.remove('refreshing'); ptrEl.style.height = '0px'; mainEl.classList.remove('ptr-active'); if (ptrText) ptrText.textContent = 'Pull down to refresh'; if (ptrArrow) ptrArrow.style.display = ''; }, 500);
    }
  })();

  // ─── Withdraw Modal — Check if disabled ───────────────────────
  const origOpenModal2 = window.openModal;
  window.openModal = (id) => {
    origOpenModal2(id);
    if (id === 'withdrawModal') {
      if (!runtimeWithdrawConfig.apiWithdrawEnabled) {
        const modalBody = document.querySelector('#withdrawModal .modal-body');
        const modalFooter = document.querySelector('#withdrawModal .modal-footer');
        if (modalBody) { modalBody.innerHTML = `<div class="withdraw-disabled-banner"><i class="fas fa-ban"></i><h4>Withdrawals Temporarily Disabled</h4><p>Withdrawals are currently disabled by the administrator. Please check back later or contact support.</p></div>`; }
        if (modalFooter) { modalFooter.innerHTML = '<button class="btn-secondary full" onclick="closeModal(\'withdrawModal\')">Close</button>'; }
      } else {
        const withdrawableInfo = document.getElementById('withdrawableInfo');
        if (withdrawableInfo) { const wb = currentUserData?.withdrawableBalance || 0; withdrawableInfo.textContent = `Withdrawable balance (from plan earnings): ${fmt(wb)}`; }
      }
    }
  };

  // Telegram & Customer Care
  window.openTelegramLink = () => { const link = runtimeLinksConfig.telegramLink; if (link) window.open(link, '_blank'); else showToast('Telegram link not available.', 'warning'); };
  window.openCustomerCareLink = () => { const link = runtimeLinksConfig.customerCareLink; if (link) window.open(link, '_blank'); else showToast('Customer care link not available.', 'warning'); };

  window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => { showToast('Copied! 📋', 'success'); }).catch(() => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Copied! 📋', 'success');
    });
  };

  console.log(`SliceInvest v4.0 initialized (${backendMode} mode)`);
})();
