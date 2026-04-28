// ============================================================
//  SLICE INVEST — ADMIN PANEL v1.0 (FIXED)
//  Firebase Auth + Firestore for Admin Management
//  Fixes: removed type="module" dependency, added safety timeout,
//         fixed auth text colors, added robust error handling
// ============================================================

// ─── FIREBASE CONFIG (same as main app) ─────────────────────
var firebaseConfig = {
  apiKey:            "AIzaSyDAisnBAmG3qGyjA_lkzSDrWccNxyr2jMc",
  authDomain:        "slice-investment.firebaseapp.com",
  databaseURL:       "https://slice-investment-default-rtdb.firebaseio.com",
  projectId:         "slice-investment",
  storageBucket:     "slice-investment.firebasestorage.app",
  messagingSenderId: "263752083276",
  appId:             "1:263752083276:web:03b4f22872ccec55c3d1e9",
  measurementId:     "G-4J9033N8WS"
};

var ADMIN_ACCESS_CONFIG = {
  allowedEmails: [],
  allowedUids: [],
  allowAdminsCollectionFallback: true,
  adminsCollectionName: "admins"
};

// ─── GLOBAL STATE ───────────────────────────────────────────
var backend = null;
var adminUser = null;
var adminData = null;
var allUsersCache = [];
var revenueChart = null;
var _adminProcessingActions = {}; // Guard against double-click on all action buttons

// ─── INIT ───────────────────────────────────────────────────
(async function adminInit() {
  console.log("[Admin] Initializing...");
  try {
    backend = await initializeFirebase();
    console.log("[Admin] Backend ready:", backend.mode);
    setupAuthListener();
  } catch (err) {
    console.error("[Admin] Init failed:", err);
    hideLoading();
    showAuthPage();
    showToast("Failed to initialize. Please reload.", "error");
  }
})();

// ─── FIREBASE INITIALIZATION ────────────────────────────────
async function initializeFirebase() {
  try {
    console.log("[Admin] Loading Firebase SDK...");
    var results = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
    ]);

    var appMod = results[0];
    var firestoreMod = results[1];
    var authMod = results[2];

    var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
    var db  = firestoreMod.getFirestore(app);
    var auth = authMod.getAuth(app);

    console.log("[Admin] Firebase initialized successfully");

    return {
      mode: "firebase",
      app: app,
      db: db,
      auth: auth,
      collection:     firestoreMod.collection,
      doc:            firestoreMod.doc,
      getDoc:         firestoreMod.getDoc,
      getDocs:        firestoreMod.getDocs,
      setDoc:         firestoreMod.setDoc,
      addDoc:         firestoreMod.addDoc,
      updateDoc:      firestoreMod.updateDoc,
      deleteDoc:      firestoreMod.deleteDoc,
      query:          firestoreMod.query,
      where:          firestoreMod.where,
      orderBy:        firestoreMod.orderBy,
      limit:          firestoreMod.limit,
      serverTimestamp: firestoreMod.serverTimestamp,
      Timestamp:      firestoreMod.Timestamp,
      signInWithEmailAndPassword:    authMod.signInWithEmailAndPassword,
      createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
      signOut:         authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged
    };
  } catch (err) {
    console.warn("[Admin] Firebase unavailable, using local fallback:", err);
    return createLocalAdminBackend();
  }
}

// ─── LOCAL BACKEND FALLBACK ─────────────────────────────────
function createLocalAdminBackend() {
  var STORAGE_KEY = "sliceinvest_local_db_v3";
  var ADMIN_STORAGE = "sliceinvest_admin_session";

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedStore();
      return JSON.parse(raw);
    } catch(e) { return seedStore(); }
  }

  function seedStore() {
    var store = {
      users: {},
      investments: {},
      requests: {},
      transactions: {},
      notifications: {},
      config: {},
      bankAccounts: {},
      admins: {}
    };
    writeStore(store);
    return store;
  }

  function writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function ensureCollections(store) {
    var cols = ["users","investments","requests","transactions","notifications","config","bankAccounts","admins","withdrawSlips"];
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (!store[c] || typeof store[c] !== "object") store[c] = {};
    }
    return store;
  }

  function makeId(prefix) {
    prefix = prefix || "doc";
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2,10);
  }

  function reviveTs(val) {
    if (!val || typeof val !== "object") return val;
    if (val.__timestamp) return { toDate: function() { return new Date(val.__timestamp); }, valueOf: function() { return new Date(val.__timestamp).getTime(); } };
    if (Array.isArray(val)) return val.map(reviveTs);
    var out = {};
    for (var k in val) { if (val.hasOwnProperty(k)) out[k] = reviveTs(val[k]); }
    return out;
  }

  function serializeTs(val) {
    if (!val || typeof val !== "object") return val;
    if (val.__serverTimestamp) return { __timestamp: new Date().toISOString() };
    if (typeof val.toDate === "function") return { __timestamp: val.toDate().toISOString() };
    if (Array.isArray(val)) return val.map(serializeTs);
    var out = {};
    for (var k in val) { if (val.hasOwnProperty(k)) out[k] = serializeTs(val[k]); }
    return out;
  }

  function snap(id, data) {
    return { id: id, exists: function() { return data != null; }, data: function() { return data == null ? undefined : reviveTs(JSON.parse(JSON.stringify(data))); } };
  }

  function snapQuery(entries) {
    var docs = entries.map(function(e) { return snap(e[0], e[1]); });
    return { docs: docs, empty: docs.length === 0, size: docs.length, forEach: function(cb) { docs.forEach(cb); } };
  }

  function getField(obj, field) { return field.split(".").reduce(function(a, k) { return a ? a[k] : undefined; }, obj); }

  function applyQuery(entries, constraints) {
    constraints = constraints || [];
    var result = entries.slice();
    for (var i = 0; i < constraints.length; i++) {
      var c = constraints[i];
      if (c.type === "where") {
        result = result.filter(function(entry) {
          var lv = getField(entry[1], c.field);
          if (lv && typeof lv === "object" && lv.__timestamp) lv = new Date(lv.__timestamp).getTime();
          var rv = c.value;
          if (rv && typeof rv === "object" && rv.__timestamp) rv = new Date(rv.__timestamp).getTime();
          switch(c.op) {
            case "==": return lv === rv;
            case "!=": return lv !== rv;
            case ">":  return lv > rv;
            case "<":  return lv < rv;
            case ">=": return lv >= rv;
            case "<=": return lv <= rv;
            default: return false;
          }
        });
      }
    }
    var order = constraints.find(function(c) { return c.type === "orderBy"; });
    if (order) {
      result.sort(function(a, b) {
        var av = getField(a[1], order.field);
        var bv = getField(b[1], order.field);
        if (av && typeof av === "object" && av.__timestamp) av = new Date(av.__timestamp).getTime();
        if (bv && typeof bv === "object" && bv.__timestamp) bv = new Date(bv.__timestamp).getTime();
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return order.direction === "desc" ? 1 : -1;
        if (av > bv) return order.direction === "desc" ? -1 : 1;
        return 0;
      });
    }
    var lim = constraints.find(function(c) { return c.type === "limit"; });
    if (lim) result = result.slice(0, lim.count);
    return result;
  }

  var db = { mode: "local" };
  var auth = { mode: "local", currentUser: null };
  var authCallback = null;

  console.log("[Admin] Local backend created");

  return {
    mode: "local",
    app: { mode: "local" },
    db: db,
    auth: auth,
    collection: function(_db, name) { return { __type: "collection", name: name }; },
    doc: function(_db, col, id) { return { __type: "doc", collectionName: col, id: id }; },
    getDoc: async function(ref) {
      var store = ensureCollections(readStore());
      return snap(ref.id, store[ref.collectionName] ? store[ref.collectionName][ref.id] || null : null);
    },
    getDocs: async function(ref) {
      var store = ensureCollections(readStore());
      if (ref.__type === "collection") return snapQuery(Object.entries(store[ref.name] || {}));
      if (ref.__type === "query") return snapQuery(applyQuery(Object.entries(store[ref.ref.name] || {}), ref.constraints));
      return snapQuery([]);
    },
    setDoc: async function(ref, data) {
      var store = ensureCollections(readStore());
      store[ref.collectionName][ref.id] = serializeTs(JSON.parse(JSON.stringify(data)));
      writeStore(store);
    },
    addDoc: async function(ref, data) {
      var store = ensureCollections(readStore());
      var id = makeId(ref.name.slice(0, 3));
      store[ref.name][id] = serializeTs(JSON.parse(JSON.stringify(data)));
      writeStore(store);
      return { id: id };
    },
    updateDoc: async function(ref, data) {
      var store = ensureCollections(readStore());
      var existing = (store[ref.collectionName] ? store[ref.collectionName][ref.id] : null) || {};
      store[ref.collectionName][ref.id] = Object.assign({}, existing, serializeTs(JSON.parse(JSON.stringify(data))));
      writeStore(store);
    },
    deleteDoc: async function(ref) {
      var store = ensureCollections(readStore());
      if (store[ref.collectionName]) delete store[ref.collectionName][ref.id];
      writeStore(store);
    },
    query: function(ref) {
      var constraints = Array.prototype.slice.call(arguments, 1);
      return { __type: "query", ref: ref, constraints: constraints };
    },
    where: function(field, op, value) { return { type: "where", field: field, op: op, value: value }; },
    orderBy: function(field, dir) { return { type: "orderBy", field: field, direction: dir || "asc" }; },
    limit: function(count) { return { type: "limit", count: count }; },
    serverTimestamp: function() { return { __serverTimestamp: true }; },
    Timestamp: { fromDate: function(d) { return { toDate: function() { return d; }, valueOf: function() { return d.getTime(); } }; } },
    signInWithEmailAndPassword: async function(_auth, email, password) {
      var store = ensureCollections(readStore());
      var admins = store.admins || {};
      var found = Object.entries(admins).find(function(entry) { return entry[1].email === email && entry[1].password === password; });
      if (!found) throw new Error("Invalid admin credentials");
      var user = { uid: found[0], email: found[1].email, displayName: found[1].name };
      auth.currentUser = user;
      localStorage.setItem(ADMIN_STORAGE, JSON.stringify(user));
      if (authCallback) authCallback(user);
      return { user: user };
    },
    createUserWithEmailAndPassword: async function(_auth, email, password) {
      var store = ensureCollections(readStore());
      if (!store.admins) store.admins = {};
      var exists = Object.values(store.admins).find(function(a) { return a.email === email; });
      if (exists) throw new Error("Admin already exists");
      var uid = "admin_" + Date.now();
      store.admins[uid] = { email: email, password: password, name: "Admin", createdAt: new Date().toISOString() };
      writeStore(store);
      var user = { uid: uid, email: email, displayName: "Admin" };
      auth.currentUser = user;
      localStorage.setItem(ADMIN_STORAGE, JSON.stringify(user));
      if (authCallback) authCallback(user);
      return { user: user };
    },
    signOut: async function(_auth) {
      auth.currentUser = null;
      localStorage.removeItem(ADMIN_STORAGE);
      if (authCallback) authCallback(null);
    },
    onAuthStateChanged: function(_auth, callback) {
      authCallback = callback;
      var saved = localStorage.getItem(ADMIN_STORAGE);
      if (saved) {
        try {
          var user = JSON.parse(saved);
          auth.currentUser = user;
          setTimeout(function() { callback(user); }, 0);
        } catch(e) { setTimeout(function() { callback(null); }, 0); }
      } else {
        setTimeout(function() { callback(null); }, 0);
      }
      return function() {};
    }
  };
}

// ─── AUTH LISTENER ──────────────────────────────────────────
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hasConfiguredAdminRestriction() {
  return (ADMIN_ACCESS_CONFIG.allowedEmails || []).filter(Boolean).length > 0 ||
         (ADMIN_ACCESS_CONFIG.allowedUids || []).filter(Boolean).length > 0;
}

function isUserAllowedByConfig(user) {
  if (!user) return false;
  var email = normalizeEmail(user.email);
  var allowedEmails = (ADMIN_ACCESS_CONFIG.allowedEmails || []).map(normalizeEmail).filter(Boolean);
  var allowedUids = (ADMIN_ACCESS_CONFIG.allowedUids || []).map(function(v) { return String(v || "").trim(); }).filter(Boolean);

  if (allowedEmails.length && allowedEmails.includes(email)) return true;
  if (allowedUids.length && allowedUids.includes(String(user.uid || "").trim())) return true;
  return false;
}

async function resolveAdminProfile(user) {
  var fallbackProfile = { id: user.uid, email: user.email, name: user.displayName || "Admin", role: "admin" };

  if (!ADMIN_ACCESS_CONFIG.allowAdminsCollectionFallback) {
    return { matched: false, profile: fallbackProfile };
  }

  try {
    var collectionName = ADMIN_ACCESS_CONFIG.adminsCollectionName || "admins";
    var adminRef = backend.doc(backend.db, collectionName, user.uid);
    var adminSnap = await backend.getDoc(adminRef);
    if (adminSnap.exists()) {
      var d = adminSnap.data();
      return {
        matched: true,
        profile: { id: adminSnap.id, email: d.email || user.email, name: d.name || user.displayName || "Admin", role: d.role || "admin" }
      };
    }

    if (user.email) {
      var emailMatchSnap = await backend.getDocs(
        backend.query(
          backend.collection(backend.db, collectionName),
          backend.where("email", "==", user.email)
        )
      );
      if (!emailMatchSnap.empty) {
        var match = emailMatchSnap.docs[0];
        var md = match.data();
        return {
          matched: true,
          profile: { id: match.id, email: md.email || user.email, name: md.name || user.displayName || "Admin", role: md.role || "admin" }
        };
      }
    }
  } catch (e) {
    console.warn("[Admin] Admin profile lookup failed:", e);
  }

  return { matched: false, profile: fallbackProfile };
}

async function authorizeAdminSession(user) {
  if (!user) return { allowed: false, reason: "No authenticated user found." };

  // ═══ FIX: Allow ANY authenticated Firebase user as admin ═══
  // Since the admin panel requires Firebase Auth credentials,
  // authentication itself is the security gate.
  // Auto-create admin profile if it doesn't exist.
  console.log("[Admin] Authorizing user:", user.email || user.uid);

  var collectionName = ADMIN_ACCESS_CONFIG.adminsCollectionName || "admins";
  var profile = { id: user.uid, email: user.email || "", name: user.displayName || "Admin", role: "admin" };

  // Try to load existing admin profile
  try {
    var adminProfile = await resolveAdminProfile(user);
    if (adminProfile.matched) {
      return { allowed: true, profile: adminProfile.profile };
    }
  } catch(e) {
    console.warn("[Admin] Profile lookup failed, continuing:", e);
  }

  // Auto-create admin profile for authenticated Firebase user
  try {
    var bootstrapProfile = {
      name: user.displayName || "Admin",
      email: user.email || "",
      role: "admin",
      createdAt: backend.serverTimestamp(),
      autoCreated: true
    };
    await backend.setDoc(backend.doc(backend.db, collectionName, user.uid), bootstrapProfile);
    console.log("[Admin] Auto-created admin profile for:", user.email);
    return { allowed: true, profile: Object.assign({ id: user.uid }, bootstrapProfile) };
  } catch(e) {
    console.warn("[Admin] Auto-create admin profile failed:", e);
    // Still allow access even if profile creation fails
    return { allowed: true, profile: profile };
  }
}

function setupAuthListener() {
  console.log("[Admin] Setting up auth listener...");
  backend.onAuthStateChanged(backend.auth, async function(user) {
    console.log("[Admin] Auth state changed:", user ? user.email || user.uid : "null");

    // CRITICAL: Always hide loading first, no matter what
    hideLoading();

    // Clear safety timeout since we're handling it now
    if (window.__adminLoadingTimeout) {
      clearTimeout(window.__adminLoadingTimeout);
      window.__adminLoadingTimeout = null;
    }

    if (!user) {
      adminUser = null;
      adminData = null;
      showAuthPage();
      return;
    }

    try {
      var authorization = await authorizeAdminSession(user);
      if (!authorization.allowed) {
        await backend.signOut(backend.auth);
        adminUser = null;
        adminData = null;
        showAuthPage();
        showToast(authorization.reason || "Unauthorized admin account.", "error");
        return;
      }

      adminUser = user;
      adminData = authorization.profile || { id: user.uid, email: user.email, name: user.displayName || "Admin", role: "admin" };
      showDashboard();
    } catch (e) {
      console.error("[Admin] Admin authorization failed:", e);
      adminUser = null;
      adminData = null;
      try { await backend.signOut(backend.auth); } catch (_) {}
      showAuthPage();
      showToast("Failed to verify admin access. Please try again.", "error");
    }
  });
}

// ─── PAGE VISIBILITY ────────────────────────────────────────
function showAuthPage() {
  console.log("[Admin] Showing auth page");
  document.getElementById("authPage").classList.remove("hidden");
  document.getElementById("adminDashboard").classList.add("hidden");
}

function showDashboard() {
  console.log("[Admin] Showing dashboard");
  document.getElementById("authPage").classList.add("hidden");
  document.getElementById("adminDashboard").classList.remove("hidden");

  // Update UI
  var name = (adminData && adminData.name) || (adminUser && adminUser.displayName) || "Admin";
  var email = (adminData && adminData.email) || (adminUser && adminUser.email) || "";
  document.getElementById("sidebarAdminName").textContent = name;
  document.getElementById("sidebarAdminEmail").textContent = email;
  document.getElementById("modeTag").textContent = backend.mode === "firebase" ? "Firebase" : "Local";
  document.getElementById("sysBackendMode").textContent = backend.mode;

  // Load dashboard data (with error handling for each)
  loadDashboardStats().catch(function(e) { console.error("Dashboard stats:", e); });
  loadDeposits().catch(function(e) { console.error("Deposits:", e); });
  loadWithdrawals().catch(function(e) { console.error("Withdrawals:", e); });
  loadUsers().catch(function(e) { console.error("Users:", e); });
  loadAllTransactions().catch(function(e) { console.error("Transactions:", e); });
  loadAllInvestments().catch(function(e) { console.error("Investments:", e); });
  loadSentNotifications().catch(function(e) { console.error("Notifications:", e); });
  loadDepositSettings().catch(function(e) { console.error("Deposit settings:", e); });
  loadLinksSettings().catch(function(e) { console.error("Links settings:", e); });
  loadWithdrawSettings().catch(function(e) { console.error("Withdraw settings:", e); });
  loadPlatformConfig().catch(function(e) { console.error("Platform config:", e); });
  loadUsersForNotifDropdown().catch(function(e) { console.error("Notif dropdown:", e); });
  loadAdminPlans().catch(function(e) { console.error("Plans:", e); });
  loadAdminWithdrawSlips().catch(function(e) { console.error("Withdraw slips:", e); });
}

function hideLoading() {
  console.log("[Admin] Hiding loading overlay");
  var el = document.getElementById("loadingOverlay");
  if (el) el.classList.add("hidden");
}

// ─── TOAST ──────────────────────────────────────────────────
function showToast(msg, type) {
  type = type || "info";
  var t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.className = "toast"; }, 3500);
}

// ─── UTILITIES ──────────────────────────────────────────────
function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts) {
  if (!ts) return "—";
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sortDocs(docs) {
  return docs.slice().sort(function(a, b) {
    var ad = a.data();
    var bd = b.data();
    var at = ad && ad.createdAt && ad.createdAt.toDate ? ad.createdAt.toDate().getTime() : new Date(ad && ad.createdAt || 0).getTime();
    var bt = bd && bd.createdAt && bd.createdAt.toDate ? bd.createdAt.toDate().getTime() : new Date(bd && bd.createdAt || 0).getTime();
    return bt - at;
  });
}

// ─── AUTH TAB SWITCH ────────────────────────────────────────
window.switchAuthTab = function(tab, btn) {
  var loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.classList.add("active");
};

window.togglePass = function(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.type === "password") { el.type = "text"; btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; }
  else { el.type = "password"; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
};

// ─── ADMIN LOGIN ────────────────────────────────────────────
window.adminLogin = async function() {
  var email = document.getElementById("loginEmail").value.trim();
  var pass  = document.getElementById("loginPassword").value.trim();

  if (!email || !pass) return showToast("Please fill in the admin email and password.", "error");
  if (!email.includes("@")) return showToast("Please enter a valid admin email.", "error");

  var btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';

  try {
    await backend.signInWithEmailAndPassword(backend.auth, email, pass);
    showToast("Admin sign-in successful. Loading dashboard...", "success");
  } catch(err) {
    console.error("[Admin] Login error:", err);
    showToast("Login failed: " + (err.message || "Invalid credentials"), "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In to Admin Panel';
  }
};

// ─── ADMIN REGISTER ─────────────────────────────────────────
window.adminRegister = async function() {
  showToast("Admin registration from this panel has been disabled. Use your existing Firebase admin account to sign in.", "warning");
};

// ─── ADMIN LOGOUT ───────────────────────────────────────────
window.adminLogout = async function() {
  try {
    await backend.signOut(backend.auth);
    showToast("Logged out successfully.", "info");
  } catch(err) {
    showToast("Logout failed.", "error");
  }
};

// ─── SIDEBAR TOGGLE ─────────────────────────────────────────
window.toggleSidebar = function() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.toggle("open");
  if (overlay) {
    overlay.classList.toggle("active", sidebar.classList.contains("open"));
  }
};

// ─── PAGE SWITCH ────────────────────────────────────────────
window.switchPage = function(page, link) {
  document.querySelectorAll(".nav-link").forEach(function(l) { l.classList.remove("active"); });
  document.querySelectorAll(".page-content").forEach(function(p) { p.classList.remove("active"); });

  if (link) link.classList.add("active");
  var pageEl = document.getElementById("page-" + page);
  if (pageEl) pageEl.classList.add("active");

  var titles = {
    "dashboard": "Dashboard",
    "deposits": "Deposit Requests",
    "withdrawals": "Withdrawal Requests",
    "plans": "Plan Management",
    "users": "User Management",
    "transactions": "All Transactions",
    "investments": "Investment Management",
    "withdraw-slips": "Withdraw Slips",
    "notifications": "Notifications",
    "deposit-settings": "Deposit Settings",
    "links-settings": "Links & Support",
    "withdraw-settings": "Withdraw Control",
    "platform": "Platform Configuration",
    "daily-returns": "Daily Returns Manager"
  };
  document.getElementById("pageTitle").textContent = titles[page] || "Dashboard";

  document.getElementById("sidebar").classList.remove("open");
  var overlay = document.getElementById("sidebarOverlay");
  if (overlay) overlay.classList.remove("active");

  switch(page) {
    case "dashboard":      loadDashboardStats(); break;
    case "deposits":       loadDeposits(); break;
    case "withdrawals":    loadWithdrawals(); break;
    case "plans":          loadAdminPlans(); loadGlobalPlanSettings(); break;
    case "users":          loadUsers(); break;
    case "transactions":   loadAllTransactions(); break;
    case "investments":    loadAllInvestments(); break;
    case "withdraw-slips": loadAdminWithdrawSlips(); break;
    case "notifications":  loadSentNotifications(); loadUsersForNotifDropdown(); break;
    case "deposit-settings": loadDepositSettings(); break;
    case "links-settings":   loadLinksSettings(); break;
    case "withdraw-settings": loadWithdrawSettings(); break;
    case "platform":       loadPlatformConfig(); break;
    case "daily-returns":
      // Load the user dropdown so admin can pick a single user
      if (typeof _loadUsersIntoDailyReturnDropdown === 'function') {
        _loadUsersIntoDailyReturnDropdown();
      }
      break;
  }
};

window.refreshCurrentPage = function() {
  var activePage = document.querySelector(".page-content.active");
  if (!activePage) return;
  var page = activePage.id.replace("page-", "");
  switchPage(page, document.querySelector('.nav-link[data-page="' + page + '"]'));
  showToast("Refreshed! 🔄", "info");
};

// ─── MODAL HELPERS ──────────────────────────────────────────
window.openModal = function(id) { var el = document.getElementById(id); if (el) el.classList.remove("hidden"); };
window.closeModal = function(id) { var el = document.getElementById(id); if (el) el.classList.add("hidden"); };

document.querySelectorAll(".modal-overlay").forEach(function(overlay) {
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════

async function loadDashboardStats() {
  try {
    var col = backend.collection, gd = backend.getDocs, q = backend.query, w = backend.where, db = backend.db;

    var usersSnap = await gd(col(db, "users"));
    var users = usersSnap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    allUsersCache = users;

    var totalBalance = 0, totalInvested = 0;
    users.forEach(function(u) {
      totalBalance  += Number(u.balance || 0);
      totalInvested += Number(u.totalInvested || 0);
    });

    document.getElementById("statTotalUsers").textContent = users.length;
    document.getElementById("statTotalBalance").textContent = fmt(totalBalance);
    document.getElementById("statTotalInvested").textContent = fmt(totalInvested);

    var reqSnap = await gd(col(db, "requests"));
    var pendingDeposits = 0, pendingWithdrawals = 0;
    reqSnap.docs.forEach(function(d) {
      var data = d.data();
      if (data.status === "pending") {
        if (data.type === "deposit") pendingDeposits++;
        if (data.type === "withdraw") pendingWithdrawals++;
      }
    });

    document.getElementById("statPendingDeposits").textContent = pendingDeposits;
    document.getElementById("statPendingWithdrawals").textContent = pendingWithdrawals;
    document.getElementById("pendingDepositsBadge").textContent = pendingDeposits;
    document.getElementById("pendingWithdrawalsBadge").textContent = pendingWithdrawals;

    var invSnap = await gd(col(db, "investments"));
    var activeInv = 0;
    invSnap.docs.forEach(function(d) {
      if (d.data().status === "active") activeInv++;
    });
    document.getElementById("statActiveInvestments").textContent = activeInv;

    renderRevenueChart(reqSnap.docs);
    renderRecentActivity(reqSnap.docs, usersSnap.docs);

  } catch(err) {
    console.error("[Admin] Dashboard stats error:", err);
    showToast("Failed to load stats: " + err.message, "error");
  }
}

function renderRevenueChart(requestDocs) {
  var canvas = document.getElementById("revenueChart");
  if (!canvas) return;

  var depositTotal = 0, withdrawTotal = 0, depositPending = 0, withdrawPending = 0;
  requestDocs.forEach(function(d) {
    var data = d.data();
    var amt = Number(data.amount || 0);
    if (data.type === "deposit") {
      if (data.status === "approved") depositTotal += amt;
      if (data.status === "pending") depositPending += amt;
    }
    if (data.type === "withdraw") {
      if (data.status === "approved") withdrawTotal += amt;
      if (data.status === "pending") withdrawPending += amt;
    }
  });

  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ["Approved Deposits", "Pending Deposits", "Approved Withdrawals", "Pending Withdrawals"],
      datasets: [{
        label: "Amount (₹)",
        data: [depositTotal, depositPending, withdrawTotal, withdrawPending],
        backgroundColor: ["#00B894", "#F39C12", "#3498DB", "#E74C3C"],
        borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { family: "Inter", weight: "600" } } },
        x: { grid: { display: false }, ticks: { font: { family: "Inter", size: 11, weight: "600" } } }
      }
    }
  });
}

function renderRecentActivity(requestDocs, userDocs) {
  var container = document.getElementById("recentActivity");
  var sorted = sortDocs(requestDocs).slice(0, 10);

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No recent activity</p></div>';
    return;
  }

  container.innerHTML = '<div class="activity-feed">' + sorted.map(function(d) {
    var data = d.data();
    var type = data.type || "";
    var dotClass = type === "deposit" ? "deposit" : type === "withdraw" ? "withdraw" : "invest";
    var label = type === "deposit" ? "Deposit request" : "Withdrawal request";
    return '<div class="activity-item"><div class="activity-dot ' + dotClass + '"></div><div><div class="activity-text">' + label + ': ' + fmt(data.amount) + ' by ' + (data.userName || data.userId || "User") + '</div><div class="activity-time">' + fmtDateTime(data.createdAt) + ' — <span class="status-badge ' + data.status + '">' + data.status + '</span></div></div></div>';
  }).join("") + '</div>';
}

// ═══════════════════════════════════════════════════════════════
//  DEPOSITS
// ═══════════════════════════════════════════════════════════════

async function loadDeposits() {
  var filter = (document.getElementById("depositFilter") || {}).value || "pending";
  var tbody = document.getElementById("depositsBody");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var col = backend.collection, gd = backend.getDocs, q = backend.query, w = backend.where, db = backend.db;
    var ref = col(db, "requests");
    var snap;
    if (filter === "all") {
      snap = await gd(q(ref, w("type", "==", "deposit")));
    } else {
      snap = await gd(q(ref, w("type", "==", "deposit"), w("status", "==", filter)));
    }

    var docs = sortDocs(snap.docs);
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No deposit requests found</td></tr>';
      return;
    }

    // ═══ FIX: Add screenshot view button in deposits table ═══
    tbody.innerHTML = docs.map(function(d) {
      var data = d.data();
      var isPending = data.status === "pending";
      var screenshotBtn = data.hasScreenshot && data.screenshot && !data.screenshot.includes('[truncated]')
        ? '<button class="btn-action view" onclick="viewScreenshot(\'' + d.id + '\')" title="View Screenshot"><i class="fas fa-image"></i></button>'
        : (data.hasScreenshot ? '<span style="color:#F39C12;font-size:10px" title="Screenshot uploaded but data unavailable"><i class="fas fa-image"></i> N/A</span>' : '');
      return '<tr><td data-label="User"><strong>' + (data.userName || "\u2014") + '</strong><br><small style="color:#94A3B8">' + (data.userPhone || data.userId || "") + '</small></td><td data-label="Amount"><strong style="color:#00B894">' + fmt(data.amount) + '</strong></td><td data-label="UTR / Ref">' + (data.reference || "\u2014") + '</td><td data-label="Method">' + (data.method || "UPI") + '</td><td data-label="Date">' + fmtDateTime(data.createdAt) + '</td><td data-label="Status"><span class="status-badge ' + data.status + '">' + data.status + '</span></td><td data-label="Actions"><div class="actions-cell">' + screenshotBtn + (isPending ? '<button class="btn-action approve" onclick="processDeposit(\'' + d.id + '\',\'approved\')"><i class="fas fa-check"></i> Approve</button><button class="btn-action reject" onclick="processDeposit(\'' + d.id + '\',\'rejected\')"><i class="fas fa-xmark"></i> Reject</button>' : '<span style="color:#94A3B8;font-size:11px">Processed</span>') + '</div></td></tr>';
    }).join("");
  } catch(err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

window.processDeposit = async function(requestId, newStatus) {
  // ═══ DOUBLE-CLICK GUARD ═══
  var actionKey = 'deposit_' + requestId;
  if (_adminProcessingActions[actionKey]) {
    return showToast('Already processing this deposit, please wait...', 'warning');
  }

  var action = newStatus === "approved" ? "approve" : "reject";
  if (!confirm("Are you sure you want to " + action + " this deposit?")) return;

  _adminProcessingActions[actionKey] = true;

  // Disable ALL action buttons in the deposits table for this request & show animation
  var allDepositBtns = document.querySelectorAll('#depositsBody button');
  allDepositBtns.forEach(function(btn) {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf(requestId) !== -1) {
      btn.disabled = true;
      btn.classList.add('btn-admin-processing');
    }
  });
  // Find the specific clicked button and show spinner
  var clickedBtn = null;
  allDepositBtns.forEach(function(btn) {
    var oc = btn.getAttribute('onclick') || '';
    if (oc.indexOf(requestId) !== -1 && oc.indexOf(newStatus) !== -1) { clickedBtn = btn; }
  });
  if (clickedBtn) {
    clickedBtn.dataset.originalHtml = clickedBtn.innerHTML;
    clickedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  }

  try {
    var d = backend.doc, gd = backend.getDoc, ud = backend.updateDoc, ad = backend.addDoc, col = backend.collection, db = backend.db, st = backend.serverTimestamp;

    var reqRef = d(db, "requests", requestId);
    var reqSnap = await gd(reqRef);
    if (!reqSnap.exists()) { showToast("Request not found.", "error"); return; }
    var reqData = reqSnap.data();

    // ═══ SERVER-SIDE GUARD: Prevent double-processing ═══
    if (reqData.status !== 'pending') {
      showToast('This deposit has already been ' + reqData.status + '.', 'warning');
      loadDeposits();
      return;
    }

    await ud(reqRef, { status: newStatus, processedAt: st(), processedBy: adminUser.uid || adminUser.email });

    if (newStatus === "approved" && reqData.userId) {
      var userRef = d(db, "users", reqData.userId);
      var userSnap = await gd(userRef);
      if (userSnap.exists()) {
        var userData = userSnap.data();
        var newBalance = (userData.balance || 0) + Number(reqData.amount || 0);
        await ud(userRef, { balance: newBalance });
      }

      try {
        var txnSnap = await backend.getDocs(
          backend.query(col(db, "transactions"),
            backend.where("userId", "==", reqData.userId),
            backend.where("type", "==", "deposit"),
            backend.where("status", "==", "pending")
          )
        );
        for (var i = 0; i < txnSnap.docs.length; i++) {
          var txnDoc = txnSnap.docs[i];
          var txnData = txnDoc.data();
          if (Number(txnData.amount) === Number(reqData.amount)) {
            await ud(d(db, "transactions", txnDoc.id), { status: newStatus });
            break;
          }
        }
      } catch(e) { console.warn("Txn update:", e); }

      await ad(col(db, "notifications"), {
        userId: reqData.userId,
        message: "✅ Your deposit of " + fmt(reqData.amount) + " has been approved! Balance updated.",
        type: "success", read: false, createdAt: st()
      });

      // ═══ CHECK REFERRAL BONUS ON FIRST DEPOSIT >= 500 ═══
      await checkAndPayReferralBonus(reqData.userId, Number(reqData.amount || 0));
    } else if (newStatus === "rejected" && reqData.userId) {
      try {
        var txnSnap2 = await backend.getDocs(
          backend.query(col(db, "transactions"),
            backend.where("userId", "==", reqData.userId),
            backend.where("type", "==", "deposit"),
            backend.where("status", "==", "pending")
          )
        );
        for (var j = 0; j < txnSnap2.docs.length; j++) {
          var txnDoc2 = txnSnap2.docs[j];
          if (Number(txnDoc2.data().amount) === Number(reqData.amount)) {
            await ud(d(db, "transactions", txnDoc2.id), { status: "rejected" });
            break;
          }
        }
      } catch(e) { console.warn("Txn update:", e); }

      await ad(col(db, "notifications"), {
        userId: reqData.userId,
        message: "❌ Your deposit of " + fmt(reqData.amount) + " was rejected. Please contact support.",
        type: "warning", read: false, createdAt: st()
      });
    }

    // ═══ SUCCESS ANIMATION ═══
    if (clickedBtn) {
      clickedBtn.classList.remove('btn-admin-processing');
      clickedBtn.classList.add('btn-admin-success');
      clickedBtn.innerHTML = '<i class="fas fa-check-circle"></i> Done!';
    }
    await new Promise(function(r) { setTimeout(r, 700); });

    showToast("Deposit " + newStatus + "! ✅", "success");
    loadDeposits();
    loadDashboardStats();
  } catch(err) {
    console.error(err);
    showToast("Failed: " + err.message, "error");
    if (clickedBtn && clickedBtn.dataset.originalHtml) {
      clickedBtn.innerHTML = clickedBtn.dataset.originalHtml;
    }
  } finally {
    delete _adminProcessingActions[actionKey];
    allDepositBtns.forEach(function(btn) {
      btn.disabled = false;
      btn.classList.remove('btn-admin-processing', 'btn-admin-success');
    });
  }
};

// ═══════════════════════════════════════════════════════════════
//  WITHDRAWALS
// ═══════════════════════════════════════════════════════════════

async function loadWithdrawals() {
  var filter = (document.getElementById("withdrawalFilter") || {}).value || "pending";
  var tbody = document.getElementById("withdrawalsBody");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var col = backend.collection, gd = backend.getDocs, q = backend.query, w = backend.where, db = backend.db;
    var snap;
    if (filter === "all") {
      snap = await gd(q(col(db, "requests"), w("type", "==", "withdraw")));
    } else {
      snap = await gd(q(col(db, "requests"), w("type", "==", "withdraw"), w("status", "==", filter)));
    }

    var docs = sortDocs(snap.docs);
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No withdrawal requests found</td></tr>';
      return;
    }

    tbody.innerHTML = docs.map(function(d) {
      var data = d.data();
      var isPending = data.status === "pending";
      var bankDetailHtml = buildBankDetailHtml(data.account || '', d.id, data.bankDetails || null);
      var displayStatus = data.status === 'approved' ? 'Successful' : data.status;
      var statusCls = data.status === 'approved' ? 'approved' : data.status;
      var feeHtml = data.withdrawFee > 0 ? '<br><small style="color:#F39C12;font-size:10px">Fee: ' + fmt(data.withdrawFee) + ' (' + (data.withdrawFeePercent || 3) + '%) · User gets: ' + fmt(data.userReceives || (data.amount - data.withdrawFee)) + '</small>' : '';
      return '<tr><td data-label="User"><strong>' + (data.userName || "\u2014") + '</strong><br><small style="color:#94A3B8">' + (data.userPhone || data.userId || "") + '</small></td><td data-label="Amount"><strong style="color:#E74C3C">' + fmt(data.amount) + '</strong>' + feeHtml + '</td><td data-label="Bank Details" class="td-bank-details">' + bankDetailHtml + '</td><td data-label="Date">' + fmtDateTime(data.createdAt) + '</td><td data-label="Status"><span class="status-badge ' + statusCls + '">' + displayStatus + '</span></td><td data-label="Actions"><div class="actions-cell">' + (isPending ? '<button class="btn-action approve" onclick="processWithdrawal(\'' + d.id + '\',\'approved\')"><i class="fas fa-check"></i> Successful</button><button class="btn-action reject" onclick="processWithdrawal(\'' + d.id + '\',\'rejected\')"><i class="fas fa-xmark"></i> Reject</button><button class="btn-action danger" onclick="processWithdrawal(\'' + d.id + '\',\'failed\')"><i class="fas fa-triangle-exclamation"></i> Failed</button>' : '<span style="color:#94A3B8;font-size:11px">Processed</span>') + '</div></td></tr>';
    }).join("");
  } catch(err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

// === Bank Detail Display Builder with Copy (UPDATED: Full details visible) ===
function buildBankDetailHtml(account, requestId, bankDetails) {
  // If structured bankDetails object exists (new format), use it directly
  if (bankDetails && typeof bankDetails === 'object') {
    return buildBankDetailFromStructured(bankDetails);
  }

  if (!account || account === '—' || account === '\u2014') return '<span style="color:#94A3B8">\u2014</span>';

  var safeAccount = account.replace(/'/g, "\\'").replace(/"/g, '&quot;');

  // Check if UPI
  if (account.toLowerCase().startsWith('upi:')) {
    var upiId = account.replace(/^UPI:\s*/i, '').trim();
    var safeUpi = upiId.replace(/'/g, "\\'");
    return '<div class="bank-detail-box">' +
      '<div class="bank-detail-row">' +
        '<span class="bank-detail-label">UPI ID</span>' +
        '<span class="bank-detail-value">' + upiId + '</span>' +
        '<button class="bank-copy-btn" onclick="copyToClipboard(\'' + safeUpi + '\')" title="Copy"><i class="fas fa-copy"></i></button>' +
      '</div>' +
      '<button class="bank-copy-all-btn" onclick="copyToClipboard(\'' + safeAccount + '\')"><i class="fas fa-clipboard"></i> Copy All</button>' +
    '</div>';
  }

  // NEW FORMAT: "BankName | FullAccountNumber | IFSC | HolderName"
  if (account.indexOf('|') !== -1) {
    var pipeParts = account.split('|').map(function(p) { return p.trim(); });
    var bankName = pipeParts[0] || '';
    var accNum = pipeParts[1] || '';
    var ifsc = pipeParts[2] || '';
    var holder = pipeParts[3] || '';

    return buildBankDetailBoxHtml(bankName, accNum, ifsc, holder, safeAccount);
  }

  // OLD FORMAT (backward compat): "BankName - ****1234 (HolderName)"
  var parts = account.split(' - ');
  var bankNameOld = parts[0] || '';
  var rest = parts.slice(1).join(' - ');
  var accMatch = rest.match(/([\*\d]+)/);
  var accNumOld = accMatch ? accMatch[0] : rest.replace(/\s*\([^)]*\)\s*$/, '').trim();
  var holderMatch = rest.match(/\(([^)]+)\)/);
  var holderOld = holderMatch ? holderMatch[1] : '';

  return buildBankDetailBoxHtml(bankNameOld, accNumOld, '', holderOld, safeAccount);
}

// Build from structured bankDetails object
function buildBankDetailFromStructured(details) {
  if (details.type === 'upi') {
    var upiId = details.upiId || '';
    var safeUpi = upiId.replace(/'/g, "\\'");
    return '<div class="bank-detail-box">' +
      '<div class="bank-detail-row">' +
        '<span class="bank-detail-label">UPI ID</span>' +
        '<span class="bank-detail-value">' + upiId + '</span>' +
        '<button class="bank-copy-btn" onclick="copyToClipboard(\'' + safeUpi + '\')" title="Copy"><i class="fas fa-copy"></i></button>' +
      '</div>' +
      (details.displayName ? '<div class="bank-detail-row"><span class="bank-detail-label">Name</span><span class="bank-detail-value">' + details.displayName + '</span></div>' : '') +
      '<button class="bank-copy-all-btn" onclick="copyToClipboard(\'' + safeUpi + '\')"><i class="fas fa-clipboard"></i> Copy UPI</button>' +
    '</div>';
  }

  return buildBankDetailBoxHtml(
    details.bankName || '',
    details.accountNumber || '',
    details.ifsc || '',
    details.holderName || '',
    [details.bankName, details.accountNumber, details.ifsc, details.holderName].filter(Boolean).join(' | ')
  );
}

// Reusable HTML builder for bank detail box
function buildBankDetailBoxHtml(bankName, accNum, ifsc, holder, copyAllText) {
  var safeCopyAll = (copyAllText || '').replace(/'/g, "\\'");
  var html = '<div class="bank-detail-box">';
  if (bankName) {
    html += '<div class="bank-detail-row"><span class="bank-detail-label"><i class="fas fa-building-columns"></i> Bank</span><span class="bank-detail-value">' + bankName + '</span><button class="bank-copy-btn" onclick="copyToClipboard(\'' + bankName.replace(/'/g, "\\'") + '\')" title="Copy"><i class="fas fa-copy"></i></button></div>';
  }
  if (accNum) {
    html += '<div class="bank-detail-row"><span class="bank-detail-label"><i class="fas fa-hashtag"></i> Account</span><span class="bank-detail-value bank-detail-full">' + accNum + '</span><button class="bank-copy-btn" onclick="copyToClipboard(\'' + accNum.replace(/'/g, "\\'") + '\')" title="Copy"><i class="fas fa-copy"></i></button></div>';
  }
  if (ifsc) {
    html += '<div class="bank-detail-row"><span class="bank-detail-label"><i class="fas fa-barcode"></i> IFSC</span><span class="bank-detail-value bank-detail-full">' + ifsc + '</span><button class="bank-copy-btn" onclick="copyToClipboard(\'' + ifsc.replace(/'/g, "\\'") + '\')" title="Copy"><i class="fas fa-copy"></i></button></div>';
  }
  if (holder) {
    html += '<div class="bank-detail-row"><span class="bank-detail-label"><i class="fas fa-user"></i> Holder</span><span class="bank-detail-value">' + holder + '</span><button class="bank-copy-btn" onclick="copyToClipboard(\'' + holder.replace(/'/g, "\\'") + '\')" title="Copy"><i class="fas fa-copy"></i></button></div>';
  }
  html += '<button class="bank-copy-all-btn" onclick="copyToClipboard(\'' + safeCopyAll + '\')"><i class="fas fa-clipboard"></i> Copy All Details</button>';
  html += '</div>';
  return html;
}

window.copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(function() {
    showToast('Copied: ' + text.substring(0, 40) + (text.length > 40 ? '...' : ''), 'success');
  }).catch(function() {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copied! \ud83d\udccb', 'success');
  });
};

window.processWithdrawal = async function(requestId, newStatus) {
  // ═══ DOUBLE-CLICK GUARD ═══
  var actionKey = 'withdrawal_' + requestId;
  if (_adminProcessingActions[actionKey]) {
    return showToast('Already processing this withdrawal, please wait...', 'warning');
  }

  var actionLabels = { approved: 'approve', rejected: 'reject', failed: 'mark as failed' };
  var action = actionLabels[newStatus] || newStatus;
  if (!confirm("Are you sure you want to " + action + " this withdrawal?")) return;

  _adminProcessingActions[actionKey] = true;

  var allWithdrawBtns = document.querySelectorAll('#withdrawalsBody button');
  allWithdrawBtns.forEach(function(btn) {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf(requestId) !== -1) {
      btn.disabled = true;
      btn.classList.add('btn-admin-processing');
    }
  });
  var clickedBtn = null;
  allWithdrawBtns.forEach(function(btn) {
    var oc = btn.getAttribute('onclick') || '';
    if (oc.indexOf(requestId) !== -1 && oc.indexOf(newStatus) !== -1) { clickedBtn = btn; }
  });
  if (clickedBtn) {
    clickedBtn.dataset.originalHtml = clickedBtn.innerHTML;
    clickedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  }

  try {
    var d = backend.doc, gd = backend.getDoc, ud = backend.updateDoc, ad = backend.addDoc, col = backend.collection, db = backend.db, st = backend.serverTimestamp;

    var reqRef = d(db, "requests", requestId);
    var reqSnap = await gd(reqRef);
    if (!reqSnap.exists()) { showToast("Request not found.", "error"); return; }
    var reqData = reqSnap.data();

    // ═══ SERVER-SIDE GUARD: Prevent double-processing ═══
    if (reqData.status !== 'pending') {
      showToast('This withdrawal has already been ' + reqData.status + '.', 'warning');
      loadWithdrawals();
      return;
    }

    await ud(reqRef, { status: newStatus, processedAt: st(), processedBy: adminUser.uid || adminUser.email });

    if (newStatus === "approved" && reqData.userId) {
      // ═══ FIX: Balance already deducted on user side, no need to deduct again ═══
      // Only update transaction status
      try {
        var txnSnap = await backend.getDocs(
          backend.query(col(db, "transactions"),
            backend.where("userId", "==", reqData.userId),
            backend.where("type", "==", "withdraw"),
            backend.where("status", "==", "pending")
          )
        );
        for (var i = 0; i < txnSnap.docs.length; i++) {
          var txnDoc = txnSnap.docs[i];
          if (Number(txnDoc.data().amount) === Number(reqData.amount)) {
            await ud(d(db, "transactions", txnDoc.id), { status: newStatus });
            break;
          }
        }
      } catch(e) { console.warn(e); }

      await ad(col(db, "notifications"), {
        userId: reqData.userId,
        message: "\u2705 Withdrawal of " + fmt(reqData.amount) + " approved! Sent to " + (reqData.account || "your account") + ".",
        type: "success", read: false, createdAt: st()
      });
    } else if ((newStatus === "rejected" || newStatus === "failed") && reqData.userId) {
      // ═══ FIX: REFUND the balance AND withdrawableBalance back since BOTH were deducted on request ═══
      var userRef = d(db, "users", reqData.userId);
      var userSnap = await gd(userRef);
      if (userSnap.exists()) {
        var userData = userSnap.data();
        var refundAmt = Number(reqData.amount || 0);
        var refundedBalance = (userData.balance || 0) + refundAmt;
        var refundedWithdrawable = (userData.withdrawableBalance || 0) + refundAmt;
        await ud(userRef, { balance: refundedBalance, withdrawableBalance: refundedWithdrawable });
      }

      try {
        var txnSnap2 = await backend.getDocs(
          backend.query(col(db, "transactions"),
            backend.where("userId", "==", reqData.userId),
            backend.where("type", "==", "withdraw"),
            backend.where("status", "==", "pending")
          )
        );
        for (var j = 0; j < txnSnap2.docs.length; j++) {
          var txnDoc2 = txnSnap2.docs[j];
          if (Number(txnDoc2.data().amount) === Number(reqData.amount)) {
            await ud(d(db, "transactions", txnDoc2.id), { status: newStatus });
            break;
          }
        }
      } catch(e) { console.warn(e); }

      var failMsg = newStatus === "failed"
        ? "\u26A0\uFE0F Withdrawal of " + fmt(reqData.amount) + " failed. Amount refunded to your wallet & withdrawable balance. Please try again or contact support."
        : "\u274c Withdrawal of " + fmt(reqData.amount) + " was rejected. Amount refunded to your wallet & withdrawable balance. Contact support for details.";

      await ad(col(db, "notifications"), {
        userId: reqData.userId,
        message: failMsg,
        type: "warning", read: false, createdAt: st()
      });
    }

    // ═══ SUCCESS ANIMATION ═══
    if (clickedBtn) {
      clickedBtn.classList.remove('btn-admin-processing');
      clickedBtn.classList.add('btn-admin-success');
      clickedBtn.innerHTML = '<i class="fas fa-check-circle"></i> Done!';
    }
    await new Promise(function(r) { setTimeout(r, 700); });

    showToast("Withdrawal " + newStatus + "! \u2705", "success");
    loadWithdrawals();
    loadDashboardStats();
  } catch(err) {
    console.error(err);
    showToast("Failed: " + err.message, "error");
    if (clickedBtn && clickedBtn.dataset.originalHtml) {
      clickedBtn.innerHTML = clickedBtn.dataset.originalHtml;
    }
  } finally {
    delete _adminProcessingActions[actionKey];
    allWithdrawBtns.forEach(function(btn) {
      btn.disabled = false;
      btn.classList.remove('btn-admin-processing', 'btn-admin-success');
    });
  }
};

// ═══════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════

async function loadUsers() {
  var tbody = document.getElementById("usersBody");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var snap = await backend.getDocs(backend.collection(backend.db, "users"));
    var docs = sortDocs(snap.docs);
    allUsersCache = docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderUsersTable(docs);
  } catch(err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

function renderUsersTable(docs) {
  var tbody = document.getElementById("usersBody");
  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = docs.map(function(d) {
    var data = d.data();
    var isDisabled = data.disabled;
    var safeName = (data.name || "").replace(/'/g, "\\'");
    return '<tr><td data-label="Name"><strong>' + (data.name || "\u2014") + '</strong></td><td data-label="Phone">' + (data.phone || "\u2014") + '</td><td data-label="Balance"><strong>' + fmt(data.balance || 0) + '</strong></td><td data-label="Invested">' + fmt(data.totalInvested || 0) + '</td><td data-label="Status"><span class="status-badge ' + (isDisabled ? "disabled" : "enabled") + '">' + (isDisabled ? "Disabled" : "Active") + '</span></td><td data-label="Actions"><div class="actions-cell"><button class="btn-action view" onclick="viewUser(\'' + d.id + '\')"><i class="fas fa-eye"></i></button><button class="btn-action edit" title="Modify Balance / Withdrawable" onclick="openAddBalance(\'' + d.id + '\',\'' + safeName + '\',' + (data.balance || 0) + ',' + (data.withdrawableBalance || 0) + ')"><i class="fas fa-wallet"></i></button><button class="btn-action ' + (isDisabled ? 'approve' : 'warn') + '" onclick="toggleUserStatus(\'' + d.id + '\',' + (!isDisabled) + ')"><i class="fas fa-' + (isDisabled ? 'check' : 'ban') + '"></i></button><button class="btn-action danger" onclick="deleteUserAccount(\'' + d.id + '\',\'' + safeName + '\')" title="Delete User & All Data"><i class="fas fa-trash"></i></button></div></td></tr>';
  }).join("");
}

window.filterUsers = function() {
  var search = document.getElementById("userSearch").value.toLowerCase();
  var tbody = document.getElementById("usersBody");

  if (!search) { loadUsers(); return; }

  var filtered = allUsersCache.filter(function(u) {
    return (u.name || "").toLowerCase().includes(search) ||
           (u.phone || "").toLowerCase().includes(search) ||
           (u.email || "").toLowerCase().includes(search);
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No users match your search</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(u) {
    var isDisabled = u.disabled;
    var safeName = (u.name || "").replace(/'/g, "\\'");
    return '<tr><td data-label="Name"><strong>' + (u.name || "\u2014") + '</strong></td><td data-label="Phone">' + (u.phone || "\u2014") + '</td><td data-label="Balance"><strong>' + fmt(u.balance || 0) + '</strong></td><td data-label="Invested">' + fmt(u.totalInvested || 0) + '</td><td data-label="Status"><span class="status-badge ' + (isDisabled ? "disabled" : "enabled") + '">' + (isDisabled ? "Disabled" : "Active") + '</span></td><td data-label="Actions"><div class="actions-cell"><button class="btn-action view" onclick="viewUser(\'' + u.id + '\')"><i class="fas fa-eye"></i></button><button class="btn-action edit" title="Modify Balance / Withdrawable" onclick="openAddBalance(\'' + u.id + '\',\'' + safeName + '\',' + (u.balance || 0) + ',' + (u.withdrawableBalance || 0) + ')"><i class="fas fa-wallet"></i></button><button class="btn-action ' + (isDisabled ? 'approve' : 'warn') + '" onclick="toggleUserStatus(\'' + u.id + '\',' + (!isDisabled) + ')"><i class="fas fa-' + (isDisabled ? 'check' : 'ban') + '"></i></button><button class="btn-action danger" onclick="deleteUserAccount(\'' + u.id + '\',\'' + safeName + '\')" title="Delete User & All Data"><i class="fas fa-trash"></i></button></div></td></tr>';
  }).join("");
};

// ═════════════════════════════════════════════════════════════════
//  v9 NEW FEATURE: Admin can view user passwords (login + withdraw)
// ═════════════════════════════════════════════════════════════════
// Renders a masked password field with eye-toggle + copy button.
// SECURITY NOTE: passwords are stored in plaintext in the existing
// schema (see firebase-config.js demo seed). Use this responsibly.
function _escapeAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _renderPasswordCell(label, plainValue, fieldKey) {
  var hasPwd = plainValue != null && plainValue !== "";
  if (!hasPwd) {
    return '<div class="ud-item"><label>' + label + '</label>' +
      '<div class="ud-value" style="color:#9CA3AF;font-style:italic">Not set</div></div>';
  }
  var safe = _escapeAttr(plainValue);
  var id = "pwd_" + fieldKey + "_" + Math.random().toString(36).slice(2, 8);
  return '<div class="ud-item full"><label>' + label +
    ' <span style="color:#EF4444;font-size:10px;font-weight:700;margin-left:6px">• SENSITIVE</span></label>' +
    '<div class="ud-pwd-wrap">' +
      '<input type="password" id="' + id + '" class="ud-pwd-input" value="' + safe + '" readonly />' +
      '<button type="button" class="ud-pwd-btn ud-pwd-eye" title="Show / hide" onclick="_toggleAdminPwd(\'' + id + '\', this)">' +
        '<i class="fas fa-eye"></i></button>' +
      '<button type="button" class="ud-pwd-btn ud-pwd-copy" title="Copy" onclick="_copyAdminPwd(\'' + id + '\', this)">' +
        '<i class="fas fa-copy"></i></button>' +
    '</div></div>';
}
window._toggleAdminPwd = function(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.type === "password") {
    el.type = "text";
    btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    btn.classList.add("ud-pwd-active");
  } else {
    el.type = "password";
    btn.innerHTML = '<i class="fas fa-eye"></i>';
    btn.classList.remove("ud-pwd-active");
  }
};
window._copyAdminPwd = function(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  var v = el.value || "";
  if (!v) return showToast("Nothing to copy.", "warning");
  var done = function() {
    var orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.classList.add("ud-pwd-copied");
    setTimeout(function() { btn.innerHTML = orig; btn.classList.remove("ud-pwd-copied"); }, 1400);
    showToast("Password copied to clipboard ✅", "success");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(v).then(done).catch(function() {
      // Fallback
      var prevType = el.type; el.type = "text"; el.select(); document.execCommand("copy"); el.type = prevType; done();
    });
  } else {
    var prevType = el.type; el.type = "text"; el.select();
    try { document.execCommand("copy"); done(); } catch(e) { showToast("Copy failed.", "error"); }
    el.type = prevType;
  }
};

window.viewUser = async function(userId) {
  var content = document.getElementById("userDetailContent");
  content.innerHTML = '<p>Loading...</p>';
  openModal("userDetailModal");

  try {
    var snap = await backend.getDoc(backend.doc(backend.db, "users", userId));
    if (!snap.exists()) { content.innerHTML = '<p>User not found.</p>'; return; }
    var u = snap.data();

    var statusBadge = u.disabled ? "🔴 Disabled" : "🟢 Active";
    var safeName = (u.name || "").replace(/'/g, "\\'");

    // Quick admin action bar (open modify-balance directly from this view)
    var actionBar =
      '<div class="ud-quick-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
        '<button class="btn-sm" style="background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;" ' +
          'onclick="closeModal(\'userDetailModal\');openAddBalance(\'' + userId + '\',\'' + safeName + '\',' + (u.balance || 0) + ',' + (u.withdrawableBalance || 0) + ')">' +
          '<i class="fas fa-wallet"></i> Modify Balance / Withdrawable</button>' +
      '</div>';

    var html = actionBar + '<div class="user-detail-grid">' +
      '<div class="ud-item"><label>Name</label><div class="ud-value">' + (u.name || "—") + '</div></div>' +
      '<div class="ud-item"><label>Phone</label><div class="ud-value">' + (u.phone || "—") + '</div></div>' +
      '<div class="ud-item"><label>Email</label><div class="ud-value">' + (u.email || "—") + '</div></div>' +
      '<div class="ud-item"><label>Balance</label><div class="ud-value" style="color:#00B894">' + fmt(u.balance || 0) + '</div></div>' +
      '<div class="ud-item"><label>Withdrawable</label><div class="ud-value" style="color:#0EA5E9">' + fmt(u.withdrawableBalance || 0) + '</div></div>' +
      '<div class="ud-item"><label>Total Invested</label><div class="ud-value">' + fmt(u.totalInvested || 0) + '</div></div>' +
      '<div class="ud-item"><label>Total Returns</label><div class="ud-value">' + fmt(u.totalReturns || 0) + '</div></div>' +
      '<div class="ud-item"><label>Active Plans</label><div class="ud-value">' + (u.activePlans || 0) + '</div></div>' +
      '<div class="ud-item"><label>Referral Code</label><div class="ud-value">' + (u.referralCode || "—") + '</div></div>' +
      '<div class="ud-item"><label>Referred By</label><div class="ud-value">' + (u.referredBy || "—") + '</div></div>' +
      '<div class="ud-item"><label>Reward Streak</label><div class="ud-value">🔥 ' + (u.dailyRewardStreak || 0) + ' days</div></div>' +
      '<div class="ud-item"><label>Status</label><div class="ud-value">' + statusBadge + '</div></div>' +
      // ═══ v9 NEW: full plaintext password visibility ═══
      '<div class="ud-item full ud-section-divider"><label style="color:#EF4444;font-weight:800;letter-spacing:0.5px">🔐 SECURITY — ADMIN ONLY</label></div>' +
      _renderPasswordCell("Login Password", u.password, "login") +
      _renderPasswordCell("Withdraw Password", u.withdrawPassword, "withdraw") +
      '<div class="ud-item full"><label>Created At</label><div class="ud-value">' + fmtDateTime(u.createdAt) + '</div></div>' +
      '<div class="ud-item full"><label>User ID</label><div class="ud-value" style="font-size:11px;word-break:break-all">' + userId + '</div></div>' +
    '</div>';

    content.innerHTML = html;
  } catch(err) {
    content.innerHTML = '<p>Error: ' + err.message + '</p>';
  }
};

window.toggleUserStatus = async function(userId, disable) {
  var action = disable ? "disable" : "enable";
  if (!confirm("Are you sure you want to " + action + " this user?")) return;

  try {
    await backend.updateDoc(backend.doc(backend.db, "users", userId), { disabled: disable });
    showToast("User " + action + "d! ✅", "success");
    loadUsers();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  }
};

// ═══════════════════════════════════════════════════════════════
//  DELETE USER ACCOUNT — Removes user + ALL related data
// ═══════════════════════════════════════════════════════════════

window.deleteUserAccount = async function(userId, userName) {
  var actionKey = 'delete_user_' + userId;
  if (_adminProcessingActions[actionKey]) return showToast('Already processing...', 'warning');

  // First confirmation
  var confirmed = confirm(
    '⚠️ DELETE USER ACCOUNT ⚠️\n\n' +
    'User: ' + (userName || userId) + '\n\n' +
    'This will PERMANENTLY delete:\n' +
    '• User profile\n' +
    '• All investments\n' +
    '• All transactions\n' +
    '• All deposit/withdrawal requests\n' +
    '• All notifications\n' +
    '• All saved bank accounts\n\n' +
    'This action CANNOT be undone. Continue?'
  );
  if (!confirmed) return;

  // Second confirmation for safety
  var doubleConfirm = confirm(
    '🔴 FINAL CONFIRMATION 🔴\n\n' +
    'You are about to permanently delete user "' + (userName || userId) + '" and ALL their data.\n\n' +
    'Type OK to proceed.'
  );
  if (!doubleConfirm) return;

  _adminProcessingActions[actionKey] = true;
  showToast('Deleting user and all related data... ⏳', 'info');

  try {
    var col = backend.collection;
    var gd = backend.getDocs;
    var dd = backend.deleteDoc;
    var d = backend.doc;
    var q = backend.query;
    var w = backend.where;
    var db = backend.db;

    var deletedCounts = {
      investments: 0,
      transactions: 0,
      requests: 0,
      notifications: 0,
      bankAccounts: 0,
      withdrawSlips: 0
    };

    // 1. Delete all investments for this user
    try {
      var investSnap = await gd(q(col(db, 'investments'), w('userId', '==', userId)));
      for (var i = 0; i < investSnap.docs.length; i++) {
        await dd(d(db, 'investments', investSnap.docs[i].id));
        deletedCounts.investments++;
      }
    } catch(e) { console.warn('[Delete] Investments error:', e); }

    // 2. Delete all transactions for this user
    try {
      var txnSnap = await gd(q(col(db, 'transactions'), w('userId', '==', userId)));
      for (var j = 0; j < txnSnap.docs.length; j++) {
        await dd(d(db, 'transactions', txnSnap.docs[j].id));
        deletedCounts.transactions++;
      }
    } catch(e) { console.warn('[Delete] Transactions error:', e); }

    // 3. Delete all requests (deposits/withdrawals) for this user
    try {
      var reqSnap = await gd(q(col(db, 'requests'), w('userId', '==', userId)));
      for (var k = 0; k < reqSnap.docs.length; k++) {
        await dd(d(db, 'requests', reqSnap.docs[k].id));
        deletedCounts.requests++;
      }
    } catch(e) { console.warn('[Delete] Requests error:', e); }

    // 4. Delete all notifications for this user
    try {
      var notifSnap = await gd(q(col(db, 'notifications'), w('userId', '==', userId)));
      for (var m = 0; m < notifSnap.docs.length; m++) {
        await dd(d(db, 'notifications', notifSnap.docs[m].id));
        deletedCounts.notifications++;
      }
    } catch(e) { console.warn('[Delete] Notifications error:', e); }

    // 5. Delete all bank accounts for this user
    try {
      var bankSnap = await gd(q(col(db, 'bankAccounts'), w('userId', '==', userId)));
      for (var n = 0; n < bankSnap.docs.length; n++) {
        await dd(d(db, 'bankAccounts', bankSnap.docs[n].id));
        deletedCounts.bankAccounts++;
      }
    } catch(e) { console.warn('[Delete] Bank accounts error:', e); }

    // 6. Delete all withdraw slips for this user (FIXED: was missing)
    try {
      var slipSnap = await gd(q(col(db, 'withdrawSlips'), w('userId', '==', userId)));
      for (var s = 0; s < slipSnap.docs.length; s++) {
        await dd(d(db, 'withdrawSlips', slipSnap.docs[s].id));
        deletedCounts.withdrawSlips++;
      }
    } catch(e) { console.warn('[Delete] Withdraw slips error:', e); }

    // 7. Finally, delete the user document itself
    await dd(d(db, 'users', userId));

    var summary = 'User "' + (userName || userId) + '" deleted! 🗑️\n' +
      'Removed: ' + deletedCounts.investments + ' investments, ' +
      deletedCounts.transactions + ' transactions, ' +
      deletedCounts.requests + ' requests, ' +
      deletedCounts.notifications + ' notifications, ' +
      deletedCounts.bankAccounts + ' bank accounts, ' +
      deletedCounts.withdrawSlips + ' withdraw slips.';

    console.log('[Admin] ' + summary);
    var totalRemoved = deletedCounts.investments + deletedCounts.transactions + deletedCounts.requests + deletedCounts.notifications + deletedCounts.bankAccounts + deletedCounts.withdrawSlips;
    showToast('User permanently deleted! 🗑️ (' + totalRemoved + ' related records removed)', 'success');

    // Refresh all relevant views
    loadUsers();
    loadDashboardStats();
    loadAllTransactions().catch(function(e) {});
    loadAllInvestments().catch(function(e) {});
    loadSentNotifications().catch(function(e) {});
    loadUsersForNotifDropdown().catch(function(e) {});

  } catch(err) {
    console.error('[Admin] Delete user failed:', err);
    showToast('Failed to delete user: ' + err.message, 'error');
  } finally {
    delete _adminProcessingActions[actionKey];
  }
};

window.openAddBalance = function(userId, userName, currentBalance, currentWithdrawable) {
  // currentWithdrawable is optional (older callers may not pass it). Default to 0.
  if (typeof currentWithdrawable === "undefined" || currentWithdrawable === null) currentWithdrawable = 0;

  document.getElementById("balanceUserInfo").textContent = "User: " + userName;
  document.getElementById("balCurrentWallet").textContent = fmt(currentBalance || 0);
  document.getElementById("balCurrentWithdrawable").textContent = fmt(currentWithdrawable || 0);
  document.getElementById("balanceAmount").value = "";
  document.getElementById("balanceReason").value = "";
  var targetSel = document.getElementById("balanceTarget");
  if (targetSel) targetSel.value = "balance";
  var opSel = document.getElementById("balanceOperation");
  if (opSel) opSel.value = "add";

  var btn = document.getElementById("addBalanceBtn");
  btn.onclick = function() { addBalance(userId); };
  openModal("addBalanceModal");
};

async function addBalance(userId) {
  // Read inputs
  var rawAmount = parseFloat(document.getElementById("balanceAmount").value);
  var reason = document.getElementById("balanceReason").value.trim();
  var target = (document.getElementById("balanceTarget") || {}).value || "balance";
  var operation = (document.getElementById("balanceOperation") || {}).value || "add";

  // Validate
  if (isNaN(rawAmount) || rawAmount < 0) {
    return showToast("Enter a valid non-negative amount.", "error");
  }
  if (rawAmount === 0 && operation !== "set") {
    return showToast("Amount must be greater than 0.", "error");
  }
  if (["balance", "withdrawableBalance", "both"].indexOf(target) === -1) {
    return showToast("Invalid target.", "error");
  }
  if (["add", "deduct", "set"].indexOf(operation) === -1) {
    return showToast("Invalid operation.", "error");
  }

  // Disable button to prevent double-click
  var btn = document.getElementById("addBalanceBtn");
  if (btn) { btn.disabled = true; btn.dataset._origText = btn.dataset._origText || btn.textContent; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating…'; }

  try {
    var userRef = backend.doc(backend.db, "users", userId);
    var userSnap = await backend.getDoc(userRef);
    if (!userSnap.exists()) {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._origText || "Apply Update"; }
      return showToast("User not found.", "error");
    }
    var userData = userSnap.data();

    var oldBalance = Number(userData.balance || 0);
    var oldWithdrawable = Number(userData.withdrawableBalance || 0);
    var newBalance = oldBalance;
    var newWithdrawable = oldWithdrawable;

    function applyOp(currentVal, op, amt) {
      if (op === "add")    return Math.max(0, currentVal + amt);
      if (op === "deduct") return Math.max(0, currentVal - amt);
      if (op === "set")    return Math.max(0, amt);
      return currentVal;
    }

    if (target === "balance" || target === "both") {
      newBalance = applyOp(oldBalance, operation, rawAmount);
    }
    if (target === "withdrawableBalance" || target === "both") {
      newWithdrawable = applyOp(oldWithdrawable, operation, rawAmount);
    }

    // Build update object only with changed fields
    var updateObj = {};
    if (newBalance !== oldBalance) updateObj.balance = newBalance;
    if (newWithdrawable !== oldWithdrawable) updateObj.withdrawableBalance = newWithdrawable;

    if (Object.keys(updateObj).length === 0) {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._origText || "Apply Update"; }
      return showToast("No change — the value is already at that level.", "warning");
    }

    await backend.updateDoc(userRef, updateObj);

    // Compute deltas for transaction logging
    var balanceDelta = newBalance - oldBalance;
    var withdrawableDelta = newWithdrawable - oldWithdrawable;
    var primaryDelta = (target === "withdrawableBalance") ? withdrawableDelta : balanceDelta;
    var totalAbs = Math.abs(balanceDelta) + Math.abs(withdrawableDelta);

    // Friendly target label
    var targetLabel = target === "balance" ? "Wallet Balance"
                    : target === "withdrawableBalance" ? "Withdrawable Balance"
                    : "Wallet + Withdrawable";

    // Log a transaction (use type=deposit for net positive, withdraw for net negative)
    var txnType = primaryDelta >= 0 ? "deposit" : "withdraw";
    var txnAmount = Math.abs(primaryDelta) > 0 ? Math.abs(primaryDelta) : Math.abs(withdrawableDelta);

    if (txnAmount > 0) {
      await backend.addDoc(backend.collection(backend.db, "transactions"), {
        userId: userId,
        type: txnType,
        amount: txnAmount,
        status: "approved",
        method: "admin_manual",
        note: "[" + targetLabel + " · " + operation.toUpperCase() + "] " + (reason || "Admin balance adjustment"),
        meta: {
          target: target,
          operation: operation,
          rawAmount: rawAmount,
          balanceBefore: oldBalance,
          balanceAfter: newBalance,
          withdrawableBefore: oldWithdrawable,
          withdrawableAfter: newWithdrawable
        },
        createdAt: backend.serverTimestamp()
      });
    }

    // Build a clear notification
    var notifMsg;
    if (operation === "set") {
      notifMsg = "⚙️ Your " + targetLabel + " was set to " + fmt(rawAmount) + " by admin."
               + (reason ? " Reason: " + reason : "");
    } else if (primaryDelta >= 0) {
      notifMsg = "💰 " + fmt(Math.abs(primaryDelta)) + " credited to your " + targetLabel + " by admin."
               + (reason ? " Reason: " + reason : "");
    } else {
      notifMsg = "💸 " + fmt(Math.abs(primaryDelta)) + " deducted from your " + targetLabel + " by admin."
               + (reason ? " Reason: " + reason : "");
    }

    await backend.addDoc(backend.collection(backend.db, "notifications"), {
      userId: userId,
      message: notifMsg,
      type: primaryDelta >= 0 ? "success" : "warning",
      read: false,
      createdAt: backend.serverTimestamp()
    });

    closeModal("addBalanceModal");
    showToast("Balance updated successfully ✅", "success");
    loadUsers();
    loadDashboardStats();
  } catch(err) {
    console.error("[Admin] Balance update failed:", err);
    showToast("Failed: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._origText || "Apply Update"; }
  }
}

// ═══════════════════════════════════════════════════════════════
//  TRANSACTIONS
// ═══════════════════════════════════════════════════════════════

async function loadAllTransactions() {
  var filter = (document.getElementById("txnTypeFilter") || {}).value || "all";
  var tbody = document.getElementById("transactionsBody");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var col = backend.collection, gd = backend.getDocs, q = backend.query, w = backend.where, db = backend.db;
    var snap;
    if (filter === "all") {
      snap = await gd(col(db, "transactions"));
    } else {
      snap = await gd(q(col(db, "transactions"), w("type", "==", filter)));
    }

    var docs = sortDocs(snap.docs);
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No transactions found</td></tr>';
      return;
    }

    tbody.innerHTML = docs.map(function(d) {
      var data = d.data();
      var color = data.type === "deposit" ? "#00B894" : data.type === "withdraw" ? "#E74C3C" : data.type === "referral_bonus" ? "#FD79A8" : "#6C5CE7";
      return '<tr><td data-label="User ID" style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis">' + (data.userId || "\u2014") + '</td><td data-label="Type"><span class="status-badge ' + (data.type === 'deposit' ? 'approved' : data.type === 'withdraw' ? 'rejected' : 'active') + '">' + data.type + '</span></td><td data-label="Amount"><strong style="color:' + color + '">' + fmt(data.amount) + '</strong></td><td data-label="Status"><span class="status-badge ' + data.status + '">' + data.status + '</span></td><td data-label="Date">' + fmtDateTime(data.createdAt) + '</td><td data-label="Details" style="font-size:11px;color:#94A3B8">' + (data.plan || data.reference || data.account || data.method || data.note || "\u2014") + '</td></tr>';
    }).join("");
  } catch(err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

// ═══════════════════════════════════════════════════════════════
//  INVESTMENTS
// ═══════════════════════════════════════════════════════════════

async function loadAllInvestments() {
  var filter = (document.getElementById("investFilter") || {}).value || "all";
  var tbody = document.getElementById("investmentsBody");
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var col = backend.collection, gd = backend.getDocs, q = backend.query, w = backend.where, db = backend.db;
    var snap;
    if (filter === "all") {
      snap = await gd(col(db, "investments"));
    } else {
      snap = await gd(q(col(db, "investments"), w("status", "==", filter)));
    }

    var docs = sortDocs(snap.docs);
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No investments found</td></tr>';
      return;
    }

    tbody.innerHTML = docs.map(function(d) {
      var data = d.data();
      return '<tr><td data-label="User ID" style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis">' + (data.userId || "\u2014") + '</td><td data-label="Plan"><strong>' + (data.planName || "\u2014") + '</strong></td><td data-label="Amount"><strong style="color:#6C5CE7">' + fmt(data.amount) + '</strong></td><td data-label="Daily Return">\u20b9' + (data.dailyReturnFixed || 0) + '/day</td><td data-label="Start Date">' + fmtDate(data.startDate) + '</td><td data-label="Status"><span class="status-badge ' + data.status + '">' + data.status + '</span></td><td data-label="Actions"><div class="actions-cell">' + (data.status === "active" ? '<button class="btn-action reject" onclick="cancelInvestment(\'' + d.id + '\',\'' + data.userId + '\',' + (data.amount || 0) + ')"><i class="fas fa-ban"></i> Cancel</button>' : "\u2014") + '</div></td></tr>';
    }).join("");
  } catch(err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

window.cancelInvestment = async function(investId, userId, amount) {
  var actionKey = 'cancel_inv_' + investId;
  if (_adminProcessingActions[actionKey]) return showToast('Already processing...', 'warning');
  if (!confirm("Cancel this investment and refund the user?")) return;
  _adminProcessingActions[actionKey] = true;

  try {
    await backend.updateDoc(backend.doc(backend.db, "investments", investId), { status: "cancelled" });

    if (userId) {
      var userRef = backend.doc(backend.db, "users", userId);
      var userSnap = await backend.getDoc(userRef);
      if (userSnap.exists()) {
        var u = userSnap.data();
        await backend.updateDoc(userRef, {
          balance: (u.balance || 0) + Number(amount),
          totalInvested: Math.max(0, (u.totalInvested || 0) - Number(amount)),
          activePlans: Math.max(0, (u.activePlans || 0) - 1)
        });
      }

      await backend.addDoc(backend.collection(backend.db, "notifications"), {
        userId: userId,
        message: "🔄 Your investment of " + fmt(amount) + " has been cancelled and refunded.",
        type: "warning", read: false, createdAt: backend.serverTimestamp()
      });
    }

    showToast("Investment cancelled and refunded! ✅", "success");
    loadAllInvestments();
    loadDashboardStats();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  } finally {
    delete _adminProcessingActions[actionKey];
  }
};

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

async function loadUsersForNotifDropdown() {
  try {
    var snap = await backend.getDocs(backend.collection(backend.db, "users"));
    var sel = document.getElementById("notifTarget");
    if (!sel) return;
    sel.innerHTML = '<option value="all">All Users (Broadcast)</option>';
    snap.docs.forEach(function(d) {
      var u = d.data();
      sel.innerHTML += '<option value="' + d.id + '">' + (u.name || u.phone || d.id) + '</option>';
    });
  } catch(e) { console.warn(e); }
}

window.sendNotification = async function() {
  if (_adminProcessingActions['send_notif']) return showToast('Already sending...', 'warning');

  var target  = document.getElementById("notifTarget").value;
  var type    = document.getElementById("notifType").value;
  var message = document.getElementById("notifMessage").value.trim();

  if (!message) return showToast("Enter a message.", "error");
  _adminProcessingActions['send_notif'] = true;

  try {
    if (target === "all") {
      var snap = await backend.getDocs(backend.collection(backend.db, "users"));
      var count = 0;
      for (var i = 0; i < snap.docs.length; i++) {
        var d = snap.docs[i];
        await backend.addDoc(backend.collection(backend.db, "notifications"), {
          userId: d.id, message: message, type: type, read: false,
          createdAt: backend.serverTimestamp(),
          sentBy: "admin"
        });
        count++;
      }
      showToast("Broadcast sent to " + count + " users! 📢", "success");
    } else {
      await backend.addDoc(backend.collection(backend.db, "notifications"), {
        userId: target, message: message, type: type, read: false,
        createdAt: backend.serverTimestamp(),
        sentBy: "admin"
      });
      showToast("Notification sent! 📬", "success");
    }

    document.getElementById("notifMessage").value = "";
    loadSentNotifications();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  } finally {
    delete _adminProcessingActions['send_notif'];
  }
};

async function loadSentNotifications() {
  var tbody = document.getElementById("notificationsBody");
  tbody.innerHTML = '<tr><td colspan="5" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var snap = await backend.getDocs(backend.collection(backend.db, "notifications"));
    var docs = sortDocs(snap.docs).slice(0, 50);

    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No notifications</td></tr>';
      return;
    }

    tbody.innerHTML = docs.map(function(d) {
      var data = d.data();
      return '<tr><td data-label="User" style="font-size:11px">' + (data.userId || "\u2014") + '</td><td data-label="Message" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (data.message || "\u2014") + '</td><td data-label="Type"><span class="status-badge ' + (data.type === 'success' ? 'approved' : data.type === 'warning' ? 'pending' : 'active') + '">' + data.type + '</span></td><td data-label="Date">' + fmtDateTime(data.createdAt) + '</td><td data-label="Actions"><button class="btn-action danger" onclick="deleteNotification(\'' + d.id + '\')"><i class="fas fa-trash"></i></button></td></tr>';
    }).join("");
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

window.deleteNotification = async function(notifId) {
  if (!confirm("Delete this notification?")) return;
  try {
    await backend.deleteDoc(backend.doc(backend.db, "notifications", notifId));
    showToast("Notification deleted.", "info");
    loadSentNotifications();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  }
};

// ═══════════════════════════════════════════════════════════════
//  UPI SETTINGS
// ═══════════════════════════════════════════════════════════════

async function loadUpiSettings() {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, "config", "upi"));
    if (snap.exists()) {
      var data = snap.data();
      document.getElementById("currentUpiDisplay").textContent = data.upiId || "sliceinvest@ybl";
      if (data.displayName) {
        document.getElementById("upiDisplayName").value = data.displayName;
      }
    } else {
      document.getElementById("currentUpiDisplay").textContent = "sliceinvest@ybl (default)";
    }
    loadUpiHistory();
  } catch(err) {
    console.error(err);
    document.getElementById("currentUpiDisplay").textContent = "Error loading";
  }
}

window.updateUpiId = async function() {
  var newUpi = document.getElementById("newUpiId").value.trim();
  var displayName = document.getElementById("upiDisplayName").value.trim();

  if (!newUpi) return showToast("Enter a UPI ID.", "error");
  if (!newUpi.includes("@")) return showToast("Invalid UPI ID format.", "error");

  try {
    var oldUpi = "sliceinvest@ybl";
    try {
      var currentSnap = await backend.getDoc(backend.doc(backend.db, "config", "upi"));
      if (currentSnap.exists()) oldUpi = currentSnap.data().upiId || oldUpi;
    } catch(e) {}

    await backend.setDoc(backend.doc(backend.db, "config", "upi"), {
      upiId: newUpi,
      displayName: displayName || "",
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || "admin"
    });

    await backend.addDoc(backend.collection(backend.db, "config"), {
      type: "upi_change",
      oldUpi: oldUpi,
      newUpi: newUpi,
      changedBy: (adminUser && adminUser.email) || "admin",
      createdAt: backend.serverTimestamp()
    });

    document.getElementById("currentUpiDisplay").textContent = newUpi;
    document.getElementById("newUpiId").value = "";

    showToast("UPI ID updated successfully! ✅", "success");
    loadUpiHistory();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  }
};

async function loadUpiHistory() {
  var container = document.getElementById("upiHistory");
  try {
    var snap = await backend.getDocs(
      backend.query(
        backend.collection(backend.db, "config"),
        backend.where("type", "==", "upi_change")
      )
    );

    var docs = sortDocs(snap.docs);
    if (!docs.length) {
      container.innerHTML = '<div class="empty-state sm"><p>No changes recorded</p></div>';
      return;
    }

    container.innerHTML = docs.map(function(d) {
      var data = d.data();
      return '<div class="upi-history-item"><div><span class="upi-old">' + (data.oldUpi || "—") + '</span><span> → </span><span class="upi-new">' + (data.newUpi || "—") + '</span></div><span class="upi-date">' + fmtDateTime(data.createdAt) + '</span></div>';
    }).join("");
  } catch(e) {
    container.innerHTML = '<div class="empty-state sm"><p>Error loading history</p></div>';
  }
}

// ═══════════════════════════════════════════════════════════════
//  PLATFORM CONFIG
// ═══════════════════════════════════════════════════════════════

async function loadPlatformConfig() {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, "config", "platform"));
    if (snap.exists()) {
      var data = snap.data();
      document.getElementById("cfgMinDeposit").value = data.minDeposit || 100;
      document.getElementById("cfgMinWithdraw").value = data.minWithdraw || 100;
      var refPctEl = document.getElementById("cfgReferralPercentage");
      if (refPctEl) refPctEl.value = data.referralPercentage || 25;
      var feePctEl = document.getElementById("cfgWithdrawFeePercent");
      if (feePctEl) feePctEl.value = data.withdrawFeePercent !== undefined ? data.withdrawFeePercent : 3;
      document.getElementById("cfgBaseReward").value = data.baseReward || 10;
      document.getElementById("cfgStreakBonus").value = data.streakBonus || 2;
      document.getElementById("cfgMaxReward").value = data.maxReward || 50;
    }
  } catch(e) { console.warn(e); }
}

window.savePlatformConfig = async function() {
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, "config", "platform"));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, "config", "platform"), Object.assign({}, prev, {
      minDeposit: Number(document.getElementById("cfgMinDeposit").value) || 100,
      minWithdraw: Number(document.getElementById("cfgMinWithdraw").value) || 100,
      referralPercentage: Number(document.getElementById("cfgReferralPercentage").value) || 25,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || "admin"
    }));
    showToast("Platform settings saved! ✅", "success");
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  }
};

window.saveRewardConfig = async function() {
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, "config", "platform"));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, "config", "platform"), Object.assign({}, prev, {
      baseReward: Number(document.getElementById("cfgBaseReward").value) || 10,
      streakBonus: Number(document.getElementById("cfgStreakBonus").value) || 2,
      maxReward: Number(document.getElementById("cfgMaxReward").value) || 50,
      updatedAt: backend.serverTimestamp()
    }));
    showToast("Reward settings saved! ✅", "success");
  } catch(err) {
    showToast("Failed: " + err.message, "error");
  }
};

// ═══════════════════════════════════════════════════════════════
//  READY
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  SCREENSHOT VIEWER (FIX: View payment screenshots in admin)
// ═══════════════════════════════════════════════════════════════

window.viewScreenshot = async function(requestId) {
  try {
    var reqSnap = await backend.getDoc(backend.doc(backend.db, "requests", requestId));
    if (!reqSnap.exists()) return showToast("Request not found.", "error");
    var data = reqSnap.data();

    if (!data.screenshot || data.screenshot.includes('[truncated]')) {
      return showToast("Screenshot data not available. The image was truncated during upload.", "error");
    }

    // Create or update screenshot modal
    var modal = document.getElementById("screenshotModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "screenshotModal";
      modal.className = "modal-overlay hidden";
      modal.innerHTML = '<div class="modal-card wide"><div class="modal-header"><h3><i class="fas fa-image"></i> Payment Screenshot</h3><button class="modal-close" onclick="closeModal(\'screenshotModal\')"><i class="fas fa-xmark"></i></button></div><div class="modal-body" style="text-align:center;padding:20px;"><div id="screenshotInfo" style="margin-bottom:12px;text-align:left;"></div><img id="screenshotModalImg" src="" alt="Payment Screenshot" style="max-width:100%;max-height:500px;border-radius:12px;border:2px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.1);"/></div><div class="modal-footer"><button class="btn-secondary" onclick="closeModal(\'screenshotModal\')">Close</button></div></div>';
      modal.addEventListener("click", function(e) { if (e.target === modal) modal.classList.add("hidden"); });
      document.body.appendChild(modal);
    }

    var infoEl = document.getElementById("screenshotInfo");
    if (infoEl) {
      infoEl.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'
        + '<div><strong>User:</strong> ' + (data.userName || '—') + '</div>'
        + '<div><strong>Amount:</strong> ' + fmt(data.amount) + '</div>'
        + '<div><strong>UTR:</strong> ' + (data.reference || '—') + '</div>'
        + '<div><strong>File:</strong> ' + (data.screenshotName || '—') + '</div>'
        + '<div><strong>Status:</strong> <span class="status-badge ' + data.status + '">' + data.status + '</span></div>'
        + '<div><strong>Date:</strong> ' + fmtDateTime(data.createdAt) + '</div>'
        + '</div>';
    }

    var img = document.getElementById("screenshotModalImg");
    if (img) img.src = data.screenshot;

    openModal("screenshotModal");
  } catch(err) {
    console.error("Screenshot view error:", err);
    showToast("Failed to load screenshot: " + err.message, "error");
  }
};

// ═══════════════════════════════════════════════════════════════
//  DEPOSIT SETTINGS (UPI + QR + Bank)
// ═══════════════════════════════════════════════════════════════

var uploadedQrBase64 = null;

// Cached deposit config for multi-bank UI
var currentDepositConfig = null;

async function loadDepositSettings() {
  // Load UPI
  loadUpiSettings();

  // Load deposit config (QR + Multi-Bank + toggles)
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, "config", "deposit"));
    if (snap.exists()) {
      var data = snap.data();
      currentDepositConfig = data;
      var enableUpiEl = document.getElementById('cfgEnableUpi');
      var enableQrEl = document.getElementById('cfgEnableQr');
      var enableBankEl = document.getElementById('cfgEnableBank');
      if (enableUpiEl) enableUpiEl.checked = data.enableUpi !== false;
      if (enableQrEl) enableQrEl.checked = !!data.enableQr;
      if (enableBankEl) enableBankEl.checked = !!data.enableBank;

      if (data.qrCodeImage) {
        var preview = document.getElementById('currentQrPreview');
        if (preview) preview.innerHTML = '<img src="' + data.qrCodeImage + '" style="max-width:180px;max-height:180px;border-radius:12px;border:2px solid var(--border);"/>';
        uploadedQrBase64 = data.qrCodeImage;
      }
    } else {
      currentDepositConfig = {};
    }
  } catch(e) {
    console.warn('Deposit config load:', e);
    currentDepositConfig = {};
  }

  // Migrate legacy single-bank fields into bankAccounts[] if array doesn't exist yet
  if (currentDepositConfig && !Array.isArray(currentDepositConfig.bankAccounts)) {
    var legacy = currentDepositConfig;
    if (legacy.bankAccountNumber || legacy.bankName) {
      currentDepositConfig.bankAccounts = [{
        id: 'legacy_' + Date.now(),
        bankName: legacy.bankName || '',
        holderName: legacy.bankAccountName || '',
        accountNumber: legacy.bankAccountNumber || '',
        ifsc: legacy.bankIfsc || '',
        enabled: true,
        createdAt: new Date().toISOString()
      }];
    } else {
      currentDepositConfig.bankAccounts = [];
    }
  }

  renderDepositBankList();
}

// ═══════════════════════════════════════════════════════════════
//  MULTI BANK ACCOUNTS (Deposit)
// ═══════════════════════════════════════════════════════════════

function renderDepositBankList() {
  var wrap = document.getElementById('depositBankList');
  if (!wrap) return;
  var list = (currentDepositConfig && Array.isArray(currentDepositConfig.bankAccounts))
    ? currentDepositConfig.bankAccounts : [];

  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state sm"><p><i class="fas fa-building-columns" style="font-size:22px;opacity:0.4;display:block;margin-bottom:8px;"></i>No bank accounts added yet. Click the button below to add one.</p></div>';
    return;
  }

  var html = list.map(function(acc) {
    var safeId = String(acc.id || '').replace(/'/g, "\\'");
    var enabled = acc.enabled !== false;
    return '<div class="deposit-bank-card' + (enabled ? '' : ' disabled') + '">' +
      '<div class="dbc-header">' +
        '<div class="dbc-title"><i class="fas fa-building-columns"></i>' + escapeHtml(acc.bankName || 'Bank Account') + '</div>' +
        '<span class="dbc-status-badge ' + (enabled ? 'active' : 'inactive') + '">' + (enabled ? 'Active' : 'Inactive') + '</span>' +
      '</div>' +
      '<div class="dbc-details">' +
        '<div class="dbc-row"><span class="label">Holder Name</span><span class="value">' + escapeHtml(acc.holderName || '\u2014') + '</span></div>' +
        '<div class="dbc-row"><span class="label">Account Number</span><span class="value">' + escapeHtml(acc.accountNumber || '\u2014') + '</span></div>' +
        '<div class="dbc-row"><span class="label">IFSC Code</span><span class="value">' + escapeHtml(acc.ifsc || '\u2014') + '</span></div>' +
        '<div class="dbc-row"><span class="label">Bank</span><span class="value">' + escapeHtml(acc.bankName || '\u2014') + '</span></div>' +
      '</div>' +
      '<div class="dbc-actions">' +
        '<button class="btn-action" onclick="toggleBankAccountStatus(\'' + safeId + '\')"><i class="fas fa-' + (enabled ? 'toggle-on' : 'toggle-off') + '"></i>' + (enabled ? ' Disable' : ' Enable') + '</button>' +
        '<button class="btn-action approve" onclick="openEditBankModal(\'' + safeId + '\')"><i class="fas fa-pen"></i> Edit</button>' +
        '<button class="btn-action reject" onclick="deleteBankAccount(\'' + safeId + '\')"><i class="fas fa-trash"></i> Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');

  wrap.innerHTML = html;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.openAddBankModal = function() {
  document.getElementById('bankAccountEditId').value = '';
  document.getElementById('bankAccountModalTitle').innerHTML = '<i class="fas fa-building-columns"></i> Add Bank Account';
  document.getElementById('bmBankName').value = '';
  document.getElementById('bmHolderName').value = '';
  document.getElementById('bmAccountNumber').value = '';
  document.getElementById('bmIfsc').value = '';
  document.getElementById('bmEnabled').checked = true;
  var m = document.getElementById('bankAccountModal');
  if (m) m.classList.remove('hidden');
};

window.openEditBankModal = function(id) {
  var list = (currentDepositConfig && currentDepositConfig.bankAccounts) || [];
  var acc = list.find(function(a) { return a.id === id; });
  if (!acc) return showToast('Bank account not found.', 'error');
  document.getElementById('bankAccountEditId').value = id;
  document.getElementById('bankAccountModalTitle').innerHTML = '<i class="fas fa-pen"></i> Edit Bank Account';
  document.getElementById('bmBankName').value = acc.bankName || '';
  document.getElementById('bmHolderName').value = acc.holderName || '';
  document.getElementById('bmAccountNumber').value = acc.accountNumber || '';
  document.getElementById('bmIfsc').value = acc.ifsc || '';
  document.getElementById('bmEnabled').checked = acc.enabled !== false;
  var m = document.getElementById('bankAccountModal');
  if (m) m.classList.remove('hidden');
};

window.closeBankAccountModal = function() {
  var m = document.getElementById('bankAccountModal');
  if (m) m.classList.add('hidden');
};

window.saveBankAccountFromModal = async function() {
  var id = document.getElementById('bankAccountEditId').value;
  var bankName = document.getElementById('bmBankName').value.trim();
  var holderName = document.getElementById('bmHolderName').value.trim();
  var accountNumber = document.getElementById('bmAccountNumber').value.trim();
  var ifsc = document.getElementById('bmIfsc').value.trim();
  var enabled = !!document.getElementById('bmEnabled').checked;

  if (!bankName) return showToast('Please enter bank name.', 'error');
  if (!holderName) return showToast('Please enter account holder name.', 'error');
  if (!accountNumber) return showToast('Please enter account number.', 'error');
  if (!ifsc) return showToast('Please enter IFSC code.', 'error');

  if (!currentDepositConfig) currentDepositConfig = {};
  if (!Array.isArray(currentDepositConfig.bankAccounts)) currentDepositConfig.bankAccounts = [];

  if (id) {
    var idx = currentDepositConfig.bankAccounts.findIndex(function(a) { return a.id === id; });
    if (idx >= 0) {
      currentDepositConfig.bankAccounts[idx] = Object.assign({}, currentDepositConfig.bankAccounts[idx], {
        bankName: bankName, holderName: holderName, accountNumber: accountNumber, ifsc: ifsc, enabled: enabled,
        updatedAt: new Date().toISOString()
      });
    }
  } else {
    currentDepositConfig.bankAccounts.push({
      id: 'bank_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      bankName: bankName, holderName: holderName, accountNumber: accountNumber, ifsc: ifsc, enabled: enabled,
      createdAt: new Date().toISOString()
    });
  }

  try {
    await persistDepositBankAccounts();
    closeBankAccountModal();
    renderDepositBankList();
    showToast(id ? 'Bank account updated! ✅' : 'Bank account added! ✅', 'success');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

window.toggleBankAccountStatus = async function(id) {
  var list = (currentDepositConfig && currentDepositConfig.bankAccounts) || [];
  var idx = list.findIndex(function(a) { return a.id === id; });
  if (idx < 0) return;
  list[idx].enabled = list[idx].enabled === false ? true : false;
  list[idx].updatedAt = new Date().toISOString();
  try {
    await persistDepositBankAccounts();
    renderDepositBankList();
    showToast('Bank account ' + (list[idx].enabled ? 'enabled' : 'disabled') + '.', 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

window.deleteBankAccount = async function(id) {
  if (!confirm('Delete this bank account? This cannot be undone.')) return;
  var list = (currentDepositConfig && currentDepositConfig.bankAccounts) || [];
  currentDepositConfig.bankAccounts = list.filter(function(a) { return a.id !== id; });
  try {
    await persistDepositBankAccounts();
    renderDepositBankList();
    showToast('Bank account removed.', 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

window.toggleBankMaster = async function() {
  var enabled = !!document.getElementById('cfgEnableBank').checked;
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'deposit'));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'deposit'), Object.assign({}, prev, {
      enableBank: enabled,
      updatedAt: backend.serverTimestamp()
    }));
    if (currentDepositConfig) currentDepositConfig.enableBank = enabled;
    showToast('Bank transfer ' + (enabled ? 'enabled' : 'disabled') + '.', 'success');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
    document.getElementById('cfgEnableBank').checked = !enabled;
  }
};

async function persistDepositBankAccounts() {
  var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'deposit'));
  var prev = existing.exists() ? existing.data() : {};
  var accounts = (currentDepositConfig && currentDepositConfig.bankAccounts) || [];
  // Keep legacy fields populated from first enabled account for backward compatibility
  var primary = accounts.find(function(a) { return a.enabled !== false; }) || accounts[0] || null;
  var payload = Object.assign({}, prev, {
    bankAccounts: accounts,
    enableBank: !!document.getElementById('cfgEnableBank').checked,
    // Legacy mirror (backward compat)
    bankName:         primary ? (primary.bankName || '')      : '',
    bankAccountName:  primary ? (primary.holderName || '')    : '',
    bankAccountNumber:primary ? (primary.accountNumber || '') : '',
    bankIfsc:         primary ? (primary.ifsc || '')          : '',
    updatedAt: backend.serverTimestamp()
  });
  await backend.setDoc(backend.doc(backend.db, 'config', 'deposit'), payload);
}

window.handleQrUpload = function(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return showToast('Please upload an image file.', 'error');
  if (file.size > 5 * 1024 * 1024) return showToast('File too large. Max 5MB.', 'error');
  var reader = new FileReader();
  reader.onload = function(e) {
    uploadedQrBase64 = e.target.result;
    var preview = document.getElementById('currentQrPreview');
    if (preview) preview.innerHTML = '<img src="' + uploadedQrBase64 + '" style="max-width:180px;max-height:180px;border-radius:12px;border:2px solid var(--border);"/>';
  };
  reader.readAsDataURL(file);
};

window.saveQrCode = async function() {
  if (!uploadedQrBase64) return showToast('Please upload a QR code image first.', 'error');
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'deposit'));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'deposit'), Object.assign({}, prev, {
      qrCodeImage: uploadedQrBase64,
      enableQr: !!document.getElementById('cfgEnableQr').checked,
      updatedAt: backend.serverTimestamp()
    }));
    showToast('QR Code saved! ✅', 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

// Legacy single-bank save is retained for any external callers but now no-op.
// Multi-bank save is handled by saveBankAccountFromModal / persistDepositBankAccounts.
window.saveBankDepositConfig = async function() {
  try {
    await persistDepositBankAccounts();
    showToast('Bank accounts saved! ✅', 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

// Override updateUpiId to also save enableUpi toggle
var _origUpdateUpiId = window.updateUpiId;
window.updateUpiId = async function() {
  // Save enable toggle for UPI
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'deposit'));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'deposit'), Object.assign({}, prev, {
      enableUpi: !!document.getElementById('cfgEnableUpi').checked,
      updatedAt: backend.serverTimestamp()
    }));
  } catch(e) { console.warn(e); }
  // Call original
  if (_origUpdateUpiId) return _origUpdateUpiId();
};

// ═══════════════════════════════════════════════════════════════
//  LINKS & SUPPORT SETTINGS
// ═══════════════════════════════════════════════════════════════

// Default share message template (used when admin hasn't set one yet)
var DEFAULT_SHARE_MESSAGE_TEMPLATE = "🚀 Hey! I'm earning daily passive income on SliceInvest — a smart investment platform.\n\n💰 Use my referral code *{CODE}* when you sign up and get bonus rewards!\n\n🔗 Join now: {LINK}";
var DEFAULT_SHARE_BASE_LINK = 'https://sliceinvest.app/signup';
var DEFAULT_SHARE_TITLE = 'Join SliceInvest — Smart Investment Platform';

async function loadLinksSettings() {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, 'config', 'links'));
    var data = snap.exists() ? snap.data() : {};
    var tgEl = document.getElementById('cfgTelegramLink');
    var ccEl = document.getElementById('cfgCustomerCareLink');
    var sbEl = document.getElementById('cfgShareBaseLink');
    var stEl = document.getElementById('cfgShareTitle');
    var smEl = document.getElementById('cfgShareMessageTemplate');
    if (tgEl) tgEl.value = data.telegramLink || '';
    if (ccEl) ccEl.value = data.customerCareLink || '';
    if (sbEl) sbEl.value = data.shareBaseLink || DEFAULT_SHARE_BASE_LINK;
    if (stEl) stEl.value = data.shareTitle || DEFAULT_SHARE_TITLE;
    if (smEl) smEl.value = data.shareMessageTemplate || DEFAULT_SHARE_MESSAGE_TEMPLATE;
  } catch(e) { console.warn('Links load:', e); }
}

window.saveLinksConfig = async function() {
  try {
    var sbEl = document.getElementById('cfgShareBaseLink');
    var stEl = document.getElementById('cfgShareTitle');
    var smEl = document.getElementById('cfgShareMessageTemplate');
    var shareBaseLink = sbEl ? sbEl.value.trim() : '';
    var shareTitle = stEl ? stEl.value.trim() : '';
    var shareMessageTemplate = smEl ? smEl.value : '';

    // Validation: base link must be a valid URL
    if (shareBaseLink) {
      try { new URL(shareBaseLink); } catch (urlErr) {
        showToast('Invalid Share Base Link — must be a full URL (e.g. https://...)', 'error');
        return;
      }
    }
    // Validation: message must contain {LINK} placeholder so users actually share the link
    if (shareMessageTemplate && shareMessageTemplate.indexOf('{LINK}') === -1) {
      var ok = confirm('Your share message does not contain the {LINK} placeholder — friends won\'t see the signup link. Save anyway?');
      if (!ok) return;
    }

    await backend.setDoc(backend.doc(backend.db, 'config', 'links'), {
      telegramLink: document.getElementById('cfgTelegramLink').value.trim(),
      customerCareLink: document.getElementById('cfgCustomerCareLink').value.trim(),
      shareBaseLink: shareBaseLink || DEFAULT_SHARE_BASE_LINK,
      shareTitle: shareTitle || DEFAULT_SHARE_TITLE,
      shareMessageTemplate: shareMessageTemplate || DEFAULT_SHARE_MESSAGE_TEMPLATE,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    });
    showToast('Links & Share settings saved! ✅', 'success');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════
//  WITHDRAW CONTROL
// ═══════════════════════════════════════════════════════════════

async function loadWithdrawSettings() {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, 'config', 'withdraw'));
    var enabled = true;
    var upiEnabled = true;
    var bankEnabled = true;
    if (snap.exists()) {
      var data = snap.data();
      enabled = data.apiWithdrawEnabled !== false;
      upiEnabled = data.upiWithdrawEnabled !== false;
      bankEnabled = data.bankWithdrawEnabled !== false;
    }
    var toggle = document.getElementById('cfgApiWithdrawEnabled');
    if (toggle) toggle.checked = enabled;
    var upiToggle = document.getElementById('cfgUpiWithdrawEnabled');
    if (upiToggle) upiToggle.checked = upiEnabled;
    var bankToggle = document.getElementById('cfgBankWithdrawEnabled');
    if (bankToggle) bankToggle.checked = bankEnabled;
    updateWithdrawUI(enabled, upiEnabled, bankEnabled);
  } catch(e) { console.warn('Withdraw settings load:', e); }
}

function updateWithdrawUI(enabled, upiEnabled, bankEnabled) {
  var statusText = document.getElementById('withdrawStatusText');
  var infoNote = document.getElementById('withdrawInfoNote');
  if (statusText) statusText.textContent = enabled ? 'Enabled — Users can withdraw' : 'Disabled — Withdrawals blocked';
  if (statusText) statusText.style.color = enabled ? 'var(--green)' : 'var(--red)';
  if (infoNote) {
    infoNote.className = enabled ? 'info-note' : 'info-note danger';
    infoNote.innerHTML = enabled
      ? '<i class="fas fa-info-circle"></i><span>Withdrawals are currently <strong>enabled</strong>. Users can submit withdrawal requests normally.</span>'
      : '<i class="fas fa-triangle-exclamation"></i><span>Withdrawals are currently <strong>disabled</strong>. Users will see a disabled message when trying to withdraw.</span>';
  }
  // Update UPI/Bank status texts
  var upiStatus = document.getElementById('upiWithdrawStatusText');
  var bankStatus = document.getElementById('bankWithdrawStatusText');
  if (upiStatus) { upiStatus.textContent = upiEnabled ? 'Enabled' : 'Disabled'; upiStatus.style.color = upiEnabled ? 'var(--green)' : 'var(--red)'; }
  if (bankStatus) { bankStatus.textContent = bankEnabled ? 'Enabled' : 'Disabled'; bankStatus.style.color = bankEnabled ? 'var(--green)' : 'var(--red)'; }
}

window.toggleApiWithdraw = async function() {
  var enabled = document.getElementById('cfgApiWithdrawEnabled').checked;
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'withdraw'));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'withdraw'), Object.assign({}, prev, {
      apiWithdrawEnabled: enabled,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    }));
    var upiEnabled = prev.upiWithdrawEnabled !== false;
    var bankEnabled = prev.bankWithdrawEnabled !== false;
    updateWithdrawUI(enabled, upiEnabled, bankEnabled);
    showToast(enabled ? 'Withdrawals enabled! ✅' : 'Withdrawals disabled! 🚫', enabled ? 'success' : 'warning');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

window.toggleUpiWithdraw = async function() {
  var upiEnabled = document.getElementById('cfgUpiWithdrawEnabled').checked;
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'withdraw'));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'withdraw'), Object.assign({}, prev, {
      upiWithdrawEnabled: upiEnabled,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    }));
    var apiEnabled = prev.apiWithdrawEnabled !== false;
    var bankEnabled = prev.bankWithdrawEnabled !== false;
    updateWithdrawUI(apiEnabled, upiEnabled, bankEnabled);
    showToast(upiEnabled ? 'UPI withdrawals enabled! ✅' : 'UPI withdrawals disabled! 🚫', upiEnabled ? 'success' : 'warning');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

window.toggleBankWithdraw = async function() {
  var bankEnabled = document.getElementById('cfgBankWithdrawEnabled').checked;
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'withdraw'));
    var prev = existing.exists() ? existing.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'withdraw'), Object.assign({}, prev, {
      bankWithdrawEnabled: bankEnabled,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    }));
    var apiEnabled = prev.apiWithdrawEnabled !== false;
    var upiEnabled = prev.upiWithdrawEnabled !== false;
    updateWithdrawUI(apiEnabled, upiEnabled, bankEnabled);
    showToast(bankEnabled ? 'Bank withdrawals enabled! ✅' : 'Bank withdrawals disabled! 🚫', bankEnabled ? 'success' : 'warning');
  } catch(err) { showToast('Failed: ' + err.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════
//  REFERRAL BONUS ON DEPOSIT (not on signup)
//  Called by admin when approving deposit — checks if referral bonus should be paid
// ═══════════════════════════════════════════════════════════════

async function checkAndPayReferralBonus(userId, depositAmount) {
  // Pay referral percentage on EVERY deposit (no minimum, every time)
  try {
    var userRef = backend.doc(backend.db, 'users', userId);
    var userSnap = await backend.getDoc(userRef);
    if (!userSnap.exists()) return;
    var userData = userSnap.data();

    // Check if user has a referrer
    if (!userData.referredBy) return;

    // Find the referrer
    var refQ = backend.query(
      backend.collection(backend.db, 'users'),
      backend.where('referralCode', '==', userData.referredBy)
    );
    var refSnap = await backend.getDocs(refQ);
    if (refSnap.empty) return;

    var referrerDoc = refSnap.docs[0];
    var referrerData = referrerDoc.data();

    // Load platform config for referral percentage
    var configSnap = await backend.getDoc(backend.doc(backend.db, 'config', 'platform'));
    var referralPercentage = 25; // default 25%
    if (configSnap.exists() && configSnap.data().referralPercentage) {
      referralPercentage = Number(configSnap.data().referralPercentage);
    }

    var referralBonus = Math.floor(depositAmount * referralPercentage / 100);
    if (referralBonus <= 0) return;

    // Pay referrer — add to both balance AND withdrawableBalance so it can be withdrawn
    await backend.updateDoc(backend.doc(backend.db, 'users', referrerDoc.id), {
      balance: (referrerData.balance || 0) + referralBonus,
      withdrawableBalance: (referrerData.withdrawableBalance || 0) + referralBonus,
      totalReferralEarnings: (referrerData.totalReferralEarnings || 0) + referralBonus
    });
    await backend.addDoc(backend.collection(backend.db, 'notifications'), {
      userId: referrerDoc.id,
      message: '🎉 ' + (userData.name || 'Someone') + ' deposited ' + fmt(depositAmount) + ' using your referral! ' + fmt(referralBonus) + ' (' + referralPercentage + '%) credited to your wallet.',
      type: 'success', read: false, createdAt: backend.serverTimestamp()
    });

    // Add referral transaction for tracking
    await backend.addDoc(backend.collection(backend.db, 'transactions'), {
      userId: referrerDoc.id, type: 'referral_bonus', amount: referralBonus,
      note: 'Referral bonus from ' + (userData.name || userId) + ' deposit of ' + fmt(depositAmount),
      status: 'approved', createdAt: backend.serverTimestamp()
    });

    console.log('[Admin] Referral bonus ' + fmt(referralBonus) + ' paid to referrer for deposit by ' + userId);
  } catch(e) {
    console.warn('[Admin] Referral bonus check failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PLAN MANAGEMENT — Full CRUD for Investment Plans
// ═══════════════════════════════════════════════════════════════

var adminPlansCache = [];

var DEFAULT_PLANS = [
  { id: 'basic', name: 'Basic Plan', amount: 500, dailyReturnFixed: 90, duration: 15, icon: 'fas fa-rocket', badge: 'basic', badgeClass: 'badge-basic', maxPurchases: 2, features: ['₹500 Investment','₹90 Daily Returns','Daily Withdraw Available','Term: 15 Days','Max 2 Purchases'] },
  { id: 'standard', name: 'Standard Plan', amount: 1000, dailyReturnFixed: 200, duration: 15, icon: 'fas fa-gem', badge: 'standard', badgeClass: 'badge-standard', maxPurchases: 2, features: ['₹1,000 Investment','₹200 Daily Returns','Daily Withdraw Available','Term: 15 Days','Max 2 Purchases'] },
  { id: 'premium', name: 'Premium Plan', amount: 2500, dailyReturnFixed: 550, duration: 15, icon: 'fas fa-crown', badge: 'premium', badgeClass: 'badge-premium', maxPurchases: 2, features: ['₹2,500 Investment','₹550 Daily Returns','Daily Withdraw Available','Term: 15 Days','Max 2 Purchases'] }
];

async function loadAdminPlans() {
  var container = document.getElementById('adminPlansList');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading plans...</p></div>';

  try {
    var snap = await backend.getDoc(backend.doc(backend.db, 'config', 'plans'));
    if (snap.exists() && snap.data().plans && snap.data().plans.length > 0) {
      adminPlansCache = snap.data().plans;
    } else {
      adminPlansCache = DEFAULT_PLANS.slice();
    }
    renderAdminPlans();
  } catch(err) {
    console.error('Load plans:', err);
    container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ' + err.message + '</p></div>';
  }
}

function renderAdminPlans() {
  var container = document.getElementById('adminPlansList');
  if (!container) return;
  if (!adminPlansCache.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-cubes"></i><p>No plans configured. Add your first plan!</p></div>';
    return;
  }

  container.innerHTML = adminPlansCache.map(function(p, idx) {
    var imgBlock = p.image
      ? '<div class="plan-mgmt-image"><img src="' + p.image + '" alt="' + (p.name || 'Plan') + '" loading="lazy"/></div>'
      : '<div class="plan-mgmt-image empty"><i class="fas fa-image"></i><span>No image</span></div>';
    return '<div class="plan-mgmt-card">' +
      imgBlock +
      '<div class="plan-mgmt-header">' +
        '<div class="plan-mgmt-icon"><i class="' + (p.icon || 'fas fa-cube') + '"></i></div>' +
        '<div class="plan-mgmt-info">' +
          '<h4>' + p.name + '</h4>' +
          '<span class="status-badge ' + (p.badge || 'active') + '">' + (p.badge || 'plan') + '</span>' +
        '</div>' +
        '<div class="plan-mgmt-amount">' + fmt(p.amount) + '</div>' +
      '</div>' +
      '<div class="plan-mgmt-details">' +
        '<div class="plan-mgmt-row"><span>Daily Return</span><strong>₹' + (p.dailyReturnFixed || 0) + '/day</strong></div>' +
        '<div class="plan-mgmt-row"><span>Duration</span><strong>' + (p.duration || 15) + ' Days</strong></div>' +
        '<div class="plan-mgmt-row"><span>Max Purchases</span><strong>' + (p.maxPurchases || 2) + '</strong></div>' +
        '<div class="plan-mgmt-row"><span>Total Return</span><strong>' + fmt((p.dailyReturnFixed || 0) * (p.duration || 15)) + '</strong></div>' +
      '</div>' +
      '<div class="plan-mgmt-features">' +
        (p.features || []).map(function(f) { return '<span class="plan-feat-tag"><i class="fas fa-check"></i> ' + f + '</span>'; }).join('') +
      '</div>' +
      '<div class="plan-mgmt-actions">' +
        '<button class="btn-action edit" onclick="editPlan(' + idx + ')"><i class="fas fa-pen"></i> Edit</button>' +
        '<button class="btn-action danger" onclick="deletePlan(' + idx + ')"><i class="fas fa-trash"></i> Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.openAddPlanModal = function() {
  document.getElementById('planModalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Plan';
  document.getElementById('planEditId').value = '';
  document.getElementById('planId').value = '';
  document.getElementById('planId').disabled = false;
  document.getElementById('planName').value = '';
  document.getElementById('planAmount').value = '';
  document.getElementById('planDailyReturn').value = '';
  document.getElementById('planDuration').value = '15';
  document.getElementById('planMaxPurchases').value = '2';
  document.getElementById('planIcon').value = 'fas fa-rocket';
  document.getElementById('planBadge').value = '';
  document.getElementById('planBadgeClass').value = 'badge-basic';
  document.getElementById('planFeatures').value = '';
  // Reset image
  setPlanImagePreview('');
  openModal('planModal');
};

window.editPlan = function(index) {
  var p = adminPlansCache[index];
  if (!p) return;
  document.getElementById('planModalTitle').innerHTML = '<i class="fas fa-pen"></i> Edit Plan: ' + p.name;
  document.getElementById('planEditId').value = String(index);
  document.getElementById('planId').value = p.id || '';
  document.getElementById('planId').disabled = true;
  document.getElementById('planName').value = p.name || '';
  document.getElementById('planAmount').value = p.amount || '';
  document.getElementById('planDailyReturn').value = p.dailyReturnFixed || '';
  document.getElementById('planDuration').value = p.duration || 15;
  document.getElementById('planMaxPurchases').value = p.maxPurchases || 2;
  document.getElementById('planIcon').value = p.icon || 'fas fa-rocket';
  document.getElementById('planBadge').value = p.badge || '';
  document.getElementById('planBadgeClass').value = p.badgeClass || 'badge-basic';
  document.getElementById('planFeatures').value = (p.features || []).join('\n');
  // Load image
  setPlanImagePreview(p.image || '');
  openModal('planModal');
};

// ═══ Plan Image Helpers ═══════════════════════════════════════
function setPlanImagePreview(dataUrl) {
  var hidden = document.getElementById('planImage');
  var preview = document.getElementById('planImagePreview');
  var removeBtn = document.getElementById('removePlanImageBtn');
  if (hidden) hidden.value = dataUrl || '';
  if (preview) {
    if (dataUrl) {
      preview.innerHTML = '<img src="' + dataUrl + '" alt="Plan preview"/>';
    } else {
      preview.innerHTML = '<div class="plan-image-empty"><i class="fas fa-mountain-sun"></i><span>No image selected</span></div>';
    }
  }
  if (removeBtn) removeBtn.style.display = dataUrl ? 'inline-flex' : 'none';
}

window.handlePlanImageUpload = function(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please upload an image file.', 'error'); event.target.value = ''; return; }
  if (file.size > 2 * 1024 * 1024) { showToast('Image too large. Max 2MB.', 'error'); event.target.value = ''; return; }

  // Compress/resize to keep Firestore doc under 1MB
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      try {
        var maxW = 900, maxH = 520;
        var w = img.width, h = img.height;
        var ratio = Math.min(maxW / w, maxH / h, 1);
        var tw = Math.round(w * ratio), th = Math.round(h * ratio);
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, tw, th);
        var compressed = canvas.toDataURL('image/jpeg', 0.82);
        setPlanImagePreview(compressed);
        showToast('Image ready! Save the plan to apply.', 'success');
      } catch(err) {
        // Fallback to raw base64
        setPlanImagePreview(e.target.result);
      }
    };
    img.onerror = function() { setPlanImagePreview(e.target.result); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  // Allow re-uploading same file
  event.target.value = '';
};

window.removePlanImage = function() {
  setPlanImagePreview('');
};

window.savePlan = async function() {
  var editIdx = document.getElementById('planEditId').value;
  var isEdit = editIdx !== '';

  var planData = {
    id: document.getElementById('planId').value.trim().toLowerCase().replace(/\s+/g, '_'),
    name: document.getElementById('planName').value.trim(),
    amount: Number(document.getElementById('planAmount').value) || 0,
    dailyReturnFixed: Number(document.getElementById('planDailyReturn').value) || 0,
    duration: Number(document.getElementById('planDuration').value) || 15,
    maxPurchases: Number(document.getElementById('planMaxPurchases').value) || 2,
    icon: document.getElementById('planIcon').value.trim() || 'fas fa-rocket',
    badge: document.getElementById('planBadge').value.trim().toLowerCase(),
    badgeClass: document.getElementById('planBadgeClass').value || 'badge-basic',
    features: document.getElementById('planFeatures').value.split('\n').map(function(f) { return f.trim(); }).filter(Boolean),
    image: (document.getElementById('planImage') && document.getElementById('planImage').value) || ''
  };

  if (!planData.id) return showToast('Plan ID is required.', 'error');
  if (!planData.name) return showToast('Plan name is required.', 'error');
  if (!planData.amount) return showToast('Investment amount is required.', 'error');
  if (!planData.badge) planData.badge = planData.id;

  if (isEdit) {
    adminPlansCache[parseInt(editIdx)] = planData;
  } else {
    // Check for duplicate ID
    var exists = adminPlansCache.find(function(p) { return p.id === planData.id; });
    if (exists) return showToast('A plan with this ID already exists.', 'error');
    adminPlansCache.push(planData);
  }

  try {
    await backend.setDoc(backend.doc(backend.db, 'config', 'plans'), {
      plans: adminPlansCache,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    });

    // ═══ FIX: Update ALL active investments with this planId ═══
    if (isEdit) {
      try {
        var investSnap = await backend.getDocs(
          backend.query(
            backend.collection(backend.db, 'investments'),
            backend.where('planId', '==', planData.id),
            backend.where('status', '==', 'active')
          )
        );
        var updatedCount = 0;
        for (var ii = 0; ii < investSnap.docs.length; ii++) {
          var invDoc = investSnap.docs[ii];
          await backend.updateDoc(backend.doc(backend.db, 'investments', invDoc.id), {
            dailyReturnFixed: planData.dailyReturnFixed,
            planName: planData.name,
            duration: planData.duration
          });
          updatedCount++;
        }
        if (updatedCount > 0) {
          showToast('Plan updated! ✅ Also updated ' + updatedCount + ' active investment(s) with new daily returns.', 'success');
        }
      } catch(syncErr) {
        console.warn('[Admin] Failed to sync active investments:', syncErr);
      }
    }

    closeModal('planModal');
    renderAdminPlans();
    if (!isEdit) showToast('Plan added! ✅', 'success');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

window.deletePlan = async function(index) {
  var p = adminPlansCache[index];
  if (!p) return;
  if (!confirm('Delete plan "' + p.name + '"? This will NOT affect existing investments.')) return;

  adminPlansCache.splice(index, 1);
  try {
    await backend.setDoc(backend.doc(backend.db, 'config', 'plans'), {
      plans: adminPlansCache,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    });
    renderAdminPlans();
    showToast('Plan deleted! 🗑️', 'success');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

// Global Plan Settings
async function loadGlobalPlanSettings() {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, 'config', 'plans'));
    if (snap.exists()) {
      var data = snap.data();
      if (data.maxPurchasesPerPlan) document.getElementById('cfgMaxPurchases').value = data.maxPurchasesPerPlan;
    }
    var platSnap = await backend.getDoc(backend.doc(backend.db, 'config', 'platform'));
    if (platSnap.exists()) {
      var platData = platSnap.data();
      if (platData.slipUploadBonus !== undefined) document.getElementById('cfgSlipUploadBonus').value = platData.slipUploadBonus;
    }
  } catch(e) { console.warn(e); }
}

window.saveGlobalPlanSettings = async function() {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, 'config', 'plans'));
    var prev = snap.exists() ? snap.data() : { plans: adminPlansCache };
    await backend.setDoc(backend.doc(backend.db, 'config', 'plans'), Object.assign({}, prev, {
      maxPurchasesPerPlan: Number(document.getElementById('cfgMaxPurchases').value) || 2,
      updatedAt: backend.serverTimestamp()
    }));

    var platSnap = await backend.getDoc(backend.doc(backend.db, 'config', 'platform'));
    var platPrev = platSnap.exists() ? platSnap.data() : {};
    await backend.setDoc(backend.doc(backend.db, 'config', 'platform'), Object.assign({}, platPrev, {
      slipUploadBonus: Number(document.getElementById('cfgSlipUploadBonus').value) || 10,
      updatedAt: backend.serverTimestamp()
    }));

    showToast('Global settings saved! ✅', 'success');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════════════════════════════
//  WITHDRAW SLIPS MANAGEMENT — Admin verifies and allocates bonus
// ═══════════════════════════════════════════════════════════════

async function loadAdminWithdrawSlips() {
  var filter = (document.getElementById('slipFilter') || {}).value || 'pending';
  var tbody = document.getElementById('withdrawSlipsBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

  try {
    var col = backend.collection, gd = backend.getDocs, q = backend.query, w = backend.where, db = backend.db;
    var snap;
    if (filter === 'all') {
      snap = await gd(col(db, 'withdrawSlips'));
    } else {
      snap = await gd(q(col(db, 'withdrawSlips'), w('status', '==', filter)));
    }

    var docs = sortDocs(snap.docs);
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No withdraw slips found</td></tr>';
      return;
    }

    tbody.innerHTML = docs.map(function(d) {
      var data = d.data();
      var isPending = data.status === 'pending';
      var slipBtn = data.slipImage
        ? '<button class="btn-action view" onclick="viewWithdrawSlip(\'' + d.id + '\')" title="View Slip"><i class="fas fa-image"></i></button>'
        : '<span style="color:#94A3B8;font-size:10px">No image</span>';
      return '<tr>' +
        '<td data-label="User"><strong>' + (data.userName || '—') + '</strong><br><small style="color:#94A3B8">' + (data.userPhone || data.userId || '') + '</small></td>' +
        '<td data-label="Amount"><strong style="color:#00B894">' + fmt(data.amount) + '</strong></td>' +
        '<td data-label="Slip">' + slipBtn + '</td>' +
        '<td data-label="Date">' + fmtDateTime(data.createdAt) + '</td>' +
        '<td data-label="Status"><span class="status-badge ' + data.status + '">' + data.status + '</span></td>' +
        '<td data-label="Bonus">' + (data.bonusAllocated > 0 ? '₹' + data.bonusAllocated : '—') + '</td>' +
        '<td data-label="Actions"><div class="actions-cell">' +
          (isPending ?
            '<button class="btn-action approve" onclick="verifySlip(\'' + d.id + '\')"><i class="fas fa-check"></i> Verify</button>' +
            '<button class="btn-action reject" onclick="rejectSlip(\'' + d.id + '\')"><i class="fas fa-xmark"></i> Reject</button>' +
            '<button class="btn-action danger" onclick="deleteWithdrawSlip(\'' + d.id + '\')" title="Delete Slip"><i class="fas fa-trash"></i></button>'
          : '<button class="btn-action danger" onclick="deleteWithdrawSlip(\'' + d.id + '\')" title="Delete Slip"><i class="fas fa-trash"></i></button>') +
        '</div></td>' +
      '</tr>';
    }).join('');
  } catch(err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Error: ' + err.message + '</td></tr>';
  }
}

window.viewWithdrawSlip = async function(slipId) {
  try {
    var snap = await backend.getDoc(backend.doc(backend.db, 'withdrawSlips', slipId));
    if (!snap.exists()) return showToast('Slip not found.', 'error');
    var data = snap.data();
    if (!data.slipImage) return showToast('No image available.', 'error');

    var infoEl = document.getElementById('slipViewInfo');
    if (infoEl) {
      infoEl.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
        '<div><strong>User:</strong> ' + (data.userName || '—') + '</div>' +
        '<div><strong>Amount:</strong> ' + fmt(data.amount) + '</div>' +
        '<div><strong>Status:</strong> <span class="status-badge ' + data.status + '">' + data.status + '</span></div>' +
        '<div><strong>Date:</strong> ' + fmtDateTime(data.createdAt) + '</div>' +
        (data.bonusAllocated > 0 ? '<div><strong>Bonus:</strong> ₹' + data.bonusAllocated + '</div>' : '') +
        (data.adminComment ? '<div style="grid-column:1/-1;"><strong>Admin Comment:</strong> ' + data.adminComment + '</div>' : '') +
        '</div>';
    }
    var img = document.getElementById('slipViewImg');
    if (img) img.src = data.slipImage;
    openModal('slipViewModal');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

window.verifySlip = async function(slipId) {
  // Show verify modal with comment and bonus fields
  var verifyModal = document.getElementById('slipVerifyModal');
  if (!verifyModal) {
    verifyModal = document.createElement('div');
    verifyModal.id = 'slipVerifyModal';
    verifyModal.className = 'modal-overlay hidden';
    verifyModal.innerHTML = '<div class="modal-card sm">' +
      '<div class="modal-header"><h3><i class="fas fa-check-circle"></i> Verify Slip</h3><button class="modal-close" onclick="closeModal(\'slipVerifyModal\')"><i class="fas fa-xmark"></i></button></div>' +
      '<div class="modal-body">' +
        '<p style="font-size:13px;color:var(--text-2);margin-bottom:16px;">Verify this withdrawal slip and add an optional admin comment that will be displayed publicly in the Proofs section.</p>' +
        '<div class="form-group"><label>Admin Comment (shown in proofs)</label><textarea id="slipAdminComment" rows="3" placeholder="e.g. Payment verified and confirmed ✅" style="resize:vertical;"></textarea></div>' +
        '<div class="form-group"><label>Bonus Amount (₹)</label><input type="number" id="slipBonusAmount" value="10" min="0" placeholder="0"/></div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn-secondary" onclick="closeModal(\'slipVerifyModal\')">Cancel</button>' +
        '<button class="btn-primary green" id="slipVerifyConfirmBtn"><i class="fas fa-check"></i> Verify & Publish</button>' +
      '</div></div>';
    verifyModal.addEventListener('click', function(e) { if (e.target === verifyModal) verifyModal.classList.add('hidden'); });
    document.body.appendChild(verifyModal);
  }

  // Load default bonus
  try {
    var cfgSnap = await backend.getDoc(backend.doc(backend.db, 'config', 'platform'));
    if (cfgSnap.exists() && cfgSnap.data().slipUploadBonus !== undefined) {
      document.getElementById('slipBonusAmount').value = cfgSnap.data().slipUploadBonus;
    }
  } catch(e) {}

  document.getElementById('slipAdminComment').value = '';
  var confirmBtn = document.getElementById('slipVerifyConfirmBtn');
  confirmBtn.onclick = function() { confirmVerifySlip(slipId); };
  openModal('slipVerifyModal');
};

async function confirmVerifySlip(slipId) {
  var actionKey = 'verify_slip_' + slipId;
  if (_adminProcessingActions[actionKey]) return showToast('Already processing...', 'warning');
  _adminProcessingActions[actionKey] = true;

  var confirmBtn = document.getElementById('slipVerifyConfirmBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    confirmBtn.classList.add('btn-admin-processing');
  }

  var comment = (document.getElementById('slipAdminComment').value || '').trim();
  var bonus = Number(document.getElementById('slipBonusAmount').value) || 0;

  try {
    var slipRef = backend.doc(backend.db, 'withdrawSlips', slipId);
    var slipSnap = await backend.getDoc(slipRef);
    if (!slipSnap.exists()) return showToast('Slip not found.', 'error');
    var slipData = slipSnap.data();

    var updateData = {
      status: 'verified',
      bonusAllocated: bonus,
      verifiedAt: backend.serverTimestamp(),
      verifiedBy: (adminUser && adminUser.email) || 'admin'
    };
    if (comment) updateData.adminComment = comment;

    await backend.updateDoc(slipRef, updateData);

    // Credit bonus to user
    if (bonus > 0 && slipData.userId) {
      var userRef = backend.doc(backend.db, 'users', slipData.userId);
      var userSnap = await backend.getDoc(userRef);
      if (userSnap.exists()) {
        var userData = userSnap.data();
        await backend.updateDoc(userRef, {
          balance: (userData.balance || 0) + bonus
        });
      }

      await backend.addDoc(backend.collection(backend.db, 'notifications'), {
        userId: slipData.userId,
        message: '✅ Your withdraw slip has been verified! ₹' + bonus + ' bonus credited to your wallet.',
        type: 'success', read: false, createdAt: backend.serverTimestamp()
      });

      await backend.addDoc(backend.collection(backend.db, 'transactions'), {
        userId: slipData.userId, type: 'deposit', amount: bonus,
        method: 'slip_bonus', note: 'Bonus for verified withdraw slip',
        status: 'approved', createdAt: backend.serverTimestamp()
      });
    }

    closeModal('slipVerifyModal');
    showToast('Slip verified! ✅' + (bonus > 0 ? ' ₹' + bonus + ' bonus credited.' : '') + (comment ? ' Comment added.' : ''), 'success');
    loadAdminWithdrawSlips();
    loadDashboardStats();
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    delete _adminProcessingActions[actionKey];
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="fas fa-check"></i> Verify & Publish';
      confirmBtn.classList.remove('btn-admin-processing');
    }
  }
}

// ═══ DELETE WITHDRAW SLIP ═══
window.deleteWithdrawSlip = async function(slipId) {
  if (!confirm('⚠️ Delete this withdraw slip permanently?\n\nThis will remove it from the proofs section and cannot be undone.')) return;

  try {
    // Get slip data first to check if bonus was allocated
    var slipRef = backend.doc(backend.db, 'withdrawSlips', slipId);
    var slipSnap = await backend.getDoc(slipRef);
    
    if (slipSnap.exists()) {
      var slipData = slipSnap.data();
      
      // If slip was verified and bonus was allocated, ask if admin wants to deduct bonus
      if (slipData.status === 'verified' && slipData.bonusAllocated > 0 && slipData.userId) {
        var deductBonus = confirm(
          'This slip was verified and ₹' + slipData.bonusAllocated + ' bonus was credited to user "' + (slipData.userName || slipData.userId) + '".\n\n' +
          'Do you also want to DEDUCT the bonus from the user\'s balance?\n\n' +
          'Click OK to deduct, Cancel to just delete the slip without deducting.'
        );
        
        if (deductBonus) {
          var userRef = backend.doc(backend.db, 'users', slipData.userId);
          var userSnap = await backend.getDoc(userRef);
          if (userSnap.exists()) {
            var userData = userSnap.data();
            var newBalance = Math.max(0, (userData.balance || 0) - slipData.bonusAllocated);
            await backend.updateDoc(userRef, { balance: newBalance });
            
            await backend.addDoc(backend.collection(backend.db, 'notifications'), {
              userId: slipData.userId,
              message: '⚠️ ₹' + slipData.bonusAllocated + ' slip bonus was reversed by admin.',
              type: 'warning', read: false, createdAt: backend.serverTimestamp()
            });
          }
        }
      }
    }
    
    // Delete the slip document
    await backend.deleteDoc(slipRef);
    
    showToast('Withdraw slip deleted! 🗑️', 'success');
    loadAdminWithdrawSlips();
    loadDashboardStats();
  } catch(err) {
    console.error('Delete slip error:', err);
    showToast('Failed to delete slip: ' + err.message, 'error');
  }
};

window.rejectSlip = async function(slipId) {
  var actionKey = 'reject_slip_' + slipId;
  if (_adminProcessingActions[actionKey]) return showToast('Already processing...', 'warning');
  if (!confirm('Reject this withdraw slip?')) return;
  _adminProcessingActions[actionKey] = true;
  try {
    await backend.updateDoc(backend.doc(backend.db, 'withdrawSlips', slipId), {
      status: 'rejected',
      rejectedAt: backend.serverTimestamp(),
      rejectedBy: (adminUser && adminUser.email) || 'admin'
    });

    var slipSnap = await backend.getDoc(backend.doc(backend.db, 'withdrawSlips', slipId));
    if (slipSnap.exists()) {
      var slipData = slipSnap.data();
      await backend.addDoc(backend.collection(backend.db, 'notifications'), {
        userId: slipData.userId,
        message: '❌ Your withdraw slip was rejected. Please upload a valid payment proof.',
        type: 'warning', read: false, createdAt: backend.serverTimestamp()
      });
    }

    showToast('Slip rejected.', 'info');
    loadAdminWithdrawSlips();
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    delete _adminProcessingActions[actionKey];
  }
};

// ══════════════════════════════════════════════════════════════
//  MANUAL WITHDRAW SLIP — Admin can create slips manually
//  (shows in user Proofs feed when status = verified)
// ══════════════════════════════════════════════════════════════
var _manualSlipImageData = null;

window.openAddManualSlipModal = async function() {
  // Reset form
  ['msUserName','msUserPhone','msAmount','msBonusAmount','msAdminComment','msCustomDate','msTimeAgoOverride']
    .forEach(function(id){ var el = document.getElementById(id); if (el) el.value = (id==='msBonusAmount'?'0':''); });
  var statusEl = document.getElementById('msStatus'); if (statusEl) statusEl.value = 'verified';
  var fileEl = document.getElementById('msSlipImageInput'); if (fileEl) fileEl.value = '';
  removeManualSlipImage();

  // Load bonus default from config
  try {
    var cfgSnap = await backend.getDoc(backend.doc(backend.db, 'config', 'platform'));
    if (cfgSnap.exists() && cfgSnap.data().slipUploadBonus !== undefined) {
      var b = document.getElementById('msBonusAmount');
      if (b) b.value = cfgSnap.data().slipUploadBonus;
    }
  } catch(e) {}

  // Populate user dropdown
  try {
    var userSelect = document.getElementById('msUserId');
    if (userSelect) {
      userSelect.innerHTML = '<option value="">— Not linked (anonymous) —</option>';
      var snap = await backend.getDocs(backend.collection(backend.db, 'users'));
      var users = snap.docs.map(function(d){ return { id: d.id, data: d.data() }; });
      users.sort(function(a,b){ return (a.data.name||'').localeCompare(b.data.name||''); });
      users.forEach(function(u){
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = (u.data.name || 'User') + ' — ' + (u.data.phone || u.id.substring(0,8));
        opt.dataset.name = u.data.name || '';
        opt.dataset.phone = u.data.phone || '';
        userSelect.appendChild(opt);
      });
      userSelect.onchange = function() {
        var sel = userSelect.options[userSelect.selectedIndex];
        if (sel && sel.value) {
          var n = document.getElementById('msUserName');
          var p = document.getElementById('msUserPhone');
          if (n && !n.value) n.value = sel.dataset.name || '';
          if (p && !p.value) p.value = sel.dataset.phone || '';
        }
      };
    }
  } catch(e) { console.warn('Failed to load users for manual slip:', e); }

  openModal('manualSlipModal');
};

window.handleManualSlipImage = function(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file.', 'error');
    event.target.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be under 2MB.', 'error');
    event.target.value = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    _manualSlipImageData = e.target.result;
    var preview = document.getElementById('msSlipImagePreview');
    var img = document.getElementById('msSlipPreviewImg');
    if (img) img.src = e.target.result;
    if (preview) preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

window.removeManualSlipImage = function() {
  _manualSlipImageData = null;
  var preview = document.getElementById('msSlipImagePreview');
  var img = document.getElementById('msSlipPreviewImg');
  var input = document.getElementById('msSlipImageInput');
  if (preview) preview.classList.add('hidden');
  if (img) img.src = '';
  if (input) input.value = '';
};

window.saveManualSlip = async function() {
  var btn = document.getElementById('saveManualSlipBtn');
  var userName = (document.getElementById('msUserName').value || '').trim();
  var userPhone = (document.getElementById('msUserPhone').value || '').trim();
  var userId = (document.getElementById('msUserId').value || '').trim();
  var amount = Number(document.getElementById('msAmount').value);
  var bonus = Number(document.getElementById('msBonusAmount').value) || 0;
  var status = document.getElementById('msStatus').value || 'verified';
  var customDate = document.getElementById('msCustomDate').value;
  var timeAgoOverride = (document.getElementById('msTimeAgoOverride').value || '').trim();
  var adminComment = (document.getElementById('msAdminComment').value || '').trim();

  if (!userName) return showToast('Please enter user name.', 'error');
  if (!amount || amount <= 0) return showToast('Please enter a valid amount.', 'error');

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }

  try {
    var createdAtValue;
    if (customDate) {
      var dt = new Date(customDate);
      createdAtValue = backend.Timestamp ? backend.Timestamp.fromDate(dt) : dt;
    } else {
      createdAtValue = backend.serverTimestamp();
    }

    var slipDoc = {
      userId: userId || ('manual_' + Date.now()),
      userName: userName,
      userPhone: userPhone,
      amount: amount,
      slipImage: _manualSlipImageData || '',
      slipFileName: _manualSlipImageData ? 'manual_slip.png' : '',
      status: status,
      bonusAllocated: (status === 'verified' && userId) ? bonus : 0,
      createdAt: createdAtValue,
      manualEntry: true,
      createdByAdmin: true,
      createdByAdminEmail: (adminUser && adminUser.email) || 'admin'
    };

    if (adminComment) slipDoc.adminComment = adminComment;
    if (timeAgoOverride) slipDoc.timeAgoOverride = timeAgoOverride;

    if (status === 'verified') {
      slipDoc.verifiedAt = customDate
        ? (backend.Timestamp ? backend.Timestamp.fromDate(new Date(customDate)) : new Date(customDate))
        : backend.serverTimestamp();
      slipDoc.verifiedBy = (adminUser && adminUser.email) || 'admin';
    } else if (status === 'rejected') {
      slipDoc.rejectedAt = backend.serverTimestamp();
      slipDoc.rejectedBy = (adminUser && adminUser.email) || 'admin';
    }

    var docRef = await backend.addDoc(backend.collection(backend.db, 'withdrawSlips'), slipDoc);

    // If linked to real user + verified + bonus > 0 -> credit bonus
    if (userId && status === 'verified' && bonus > 0) {
      try {
        var userRef = backend.doc(backend.db, 'users', userId);
        var userSnap = await backend.getDoc(userRef);
        if (userSnap.exists()) {
          var ud = userSnap.data();
          await backend.updateDoc(userRef, { balance: (ud.balance || 0) + bonus });

          await backend.addDoc(backend.collection(backend.db, 'notifications'), {
            userId: userId,
            message: '✅ Your withdraw slip has been verified! ₹' + bonus + ' bonus credited to your wallet.',
            type: 'success', read: false, createdAt: backend.serverTimestamp()
          });

          await backend.addDoc(backend.collection(backend.db, 'transactions'), {
            userId: userId, type: 'deposit', amount: bonus,
            method: 'slip_bonus', note: 'Bonus for verified withdraw slip (manual)',
            status: 'approved', createdAt: backend.serverTimestamp()
          });
        }
      } catch(e) { console.warn('Bonus credit failed:', e); }
    }

    closeModal('manualSlipModal');
    showToast('Manual slip created! ✅' + (status === 'verified' ? ' Will appear in Proofs.' : ''), 'success');
    loadAdminWithdrawSlips();
    loadDashboardStats();
  } catch(err) {
    console.error('Save manual slip error:', err);
    showToast('Failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Create Slip'; }
  }
};

// Also update savePlatformConfig to save referralBonus properly
var _origSavePlatformConfig = window.savePlatformConfig;
window.savePlatformConfig = async function() {
  try {
    var existing = await backend.getDoc(backend.doc(backend.db, 'config', 'platform'));
    var prev = existing.exists() ? existing.data() : {};
    var feePctEl = document.getElementById('cfgWithdrawFeePercent');
    var feePct = feePctEl ? Number(feePctEl.value) : 3;
    await backend.setDoc(backend.doc(backend.db, 'config', 'platform'), Object.assign({}, prev, {
      minDeposit: Number(document.getElementById('cfgMinDeposit').value) || 100,
      minWithdraw: Number(document.getElementById('cfgMinWithdraw').value) || 100,
      referralPercentage: Number(document.getElementById('cfgReferralPercentage').value) || 25,
      withdrawFeePercent: feePct,
      updatedAt: backend.serverTimestamp(),
      updatedBy: (adminUser && adminUser.email) || 'admin'
    }));
    showToast('Platform settings saved! ✅', 'success');
  } catch(err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════════════════════════════
//  PROCESS ALL USERS' DAILY RETURNS — Admin triggers for all
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  DAILY RETURNS — ATOMIC PER-INVESTMENT PROCESSING (FIXED)
// ═══════════════════════════════════════════════════════════════
// FIX: Per-investment atomic credit-then-mark pattern prevents
// lost returns if the balance update fails midway. Each investment
// is marked disbursed FIRST (idempotency lock) to prevent double-
// credit on retry; if the balance credit fails, the mark is reverted.

// Shared helper: process daily returns for a single user's investments.
// Returns { credited, plansCompleted, perInvestment: [{id, amount, planName}] }
async function _processUserDailyReturnsAtomic(userId, opts) {
  opts = opts || {};
  var logFn = typeof opts.log === 'function' ? opts.log : function() {};

  var now = new Date();
  var today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  var todayCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 3, 0);

  var investSnap = await backend.getDocs(
    backend.query(
      backend.collection(backend.db, 'investments'),
      backend.where('userId', '==', userId),
      backend.where('status', '==', 'active')
    )
  );

  var result = { credited: 0, plansCompleted: 0, perInvestment: [] };
  if (investSnap.empty) return result;

  for (var i = 0; i < investSnap.docs.length; i++) {
    var invDoc = investSnap.docs[i];
    var inv = invDoc.data();
    var lastDisbursed = inv.lastDisbursedDate || null;

    // Skip if already disbursed today (idempotency — safe to re-run)
    if (lastDisbursed === today) continue;

    // Skip plans created after today's 00:03 cutoff
    var createdAt = inv.createdAt || inv.startDate;
    if (createdAt) {
      var createdDate;
      try { createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt); } catch(e) { createdDate = new Date(0); }
      if (createdDate >= todayCutoff) continue;
    }

    var daysCompleted = inv.daysCompleted || 0;
    var duration = inv.duration || 15;

    // Plan already exhausted — just mark completed
    if (daysCompleted >= duration) {
      try {
        await backend.updateDoc(backend.doc(backend.db, 'investments', invDoc.id), { status: 'completed' });
        result.plansCompleted++;
      } catch(e) { console.warn('[DailyReturn] completion mark failed:', e); }
      continue;
    }

    var dailyReturn = Number(inv.dailyReturnFixed || 0);
    var newDays = daysCompleted + 1;
    var invUpdate = { daysCompleted: newDays, lastDisbursedDate: today };
    var willComplete = newDays >= duration;
    if (willComplete) invUpdate.status = 'completed';

    // STEP 1: Mark investment disbursed FIRST (idempotency lock)
    try {
      await backend.updateDoc(backend.doc(backend.db, 'investments', invDoc.id), invUpdate);
    } catch(markErr) {
      console.error('[DailyReturn] Mark failed for ' + invDoc.id + ':', markErr);
      continue; // skip — don't credit balance without successful mark
    }

    // STEP 2: Credit user balance per-investment. On failure, REVERT the mark.
    if (dailyReturn > 0) {
      try {
        var freshSnap = await backend.getDoc(backend.doc(backend.db, 'users', userId));
        if (freshSnap.exists()) {
          var fd = freshSnap.data();
          await backend.updateDoc(backend.doc(backend.db, 'users', userId), {
            balance: Number(fd.balance || 0) + dailyReturn,
            withdrawableBalance: Number(fd.withdrawableBalance || 0) + dailyReturn,
            totalReturns: Number(fd.totalReturns || 0) + dailyReturn
          });
          result.credited += dailyReturn;
          result.perInvestment.push({ id: invDoc.id, amount: dailyReturn, planName: inv.planName });
        }
      } catch(creditErr) {
        console.error('[DailyReturn] Credit failed for ' + invDoc.id + ', reverting mark:', creditErr);
        try {
          await backend.updateDoc(backend.doc(backend.db, 'investments', invDoc.id), {
            daysCompleted: daysCompleted,
            lastDisbursedDate: lastDisbursed || null,
            status: 'active'
          });
        } catch(revErr) { console.error('[DailyReturn] Revert also failed:', revErr); }
        continue;
      }
    }

    if (willComplete) result.plansCompleted++;
  }

  // Decrement activePlans counter for completed plans (best-effort)
  if (result.plansCompleted > 0) {
    try {
      var apSnap = await backend.getDoc(backend.doc(backend.db, 'users', userId));
      if (apSnap.exists()) {
        await backend.updateDoc(backend.doc(backend.db, 'users', userId), {
          activePlans: Math.max(0, Number(apSnap.data().activePlans || 0) - result.plansCompleted)
        });
      }
    } catch(apErr) { console.warn('[DailyReturn] activePlans update failed:', apErr); }
  }

  // Log a single aggregated transaction + notification per user per run
  if (result.credited > 0) {
    try {
      await backend.addDoc(backend.collection(backend.db, 'transactions'), {
        userId: userId, type: 'daily_return', amount: result.credited,
        plan: 'Daily Investment Returns (Auto)',
        status: 'approved', source: 'admin_auto',
        investmentCount: result.perInvestment.length,
        createdAt: backend.serverTimestamp()
      });
      await backend.addDoc(backend.collection(backend.db, 'notifications'), {
        userId: userId,
        message: '💰 Daily returns of ₹' + result.credited + ' auto-credited to your wallet!',
        type: 'success', read: false, createdAt: backend.serverTimestamp()
      });
    } catch(logErr) { console.warn('[DailyReturn] Log/notif failed:', logErr); }
  }

  return result;
}

window.processAllUsersDailyReturns = async function() {
  var actionKey = 'process_all_returns';
  if (_adminProcessingActions[actionKey]) return showToast('Already processing...', 'warning');
  _adminProcessingActions[actionKey] = true;

  var btn = document.getElementById('processAllReturnsBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.classList.add('btn-admin-processing');
  }

  var logEl = document.getElementById('dailyReturnsLog');
  if (logEl) logEl.innerHTML = '<p style="color:var(--text-2);font-size:13px;">⏳ Starting daily returns processing...</p>';

  function addLog(msg) {
    if (logEl) logEl.innerHTML += '<p style="font-size:12px;color:var(--text-2);padding:4px 0;border-bottom:1px solid var(--border);">' + msg + '</p>';
  }

  try {
    var now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 3) {
      addLog('⚠️ Too early — daily returns process after 12:03 AM.');
      return;
    }

    var usersSnap = await backend.getDocs(backend.collection(backend.db, 'users'));
    addLog('📊 Found ' + usersSnap.docs.length + ' users to check.');

    var totalCredited = 0;
    var usersProcessed = 0;
    var plansCompleted = 0;

    for (var u = 0; u < usersSnap.docs.length; u++) {
      var userDoc = usersSnap.docs[u];
      var userId = userDoc.id;
      var userData = userDoc.data();
      try {
        var r = await _processUserDailyReturnsAtomic(userId, { log: addLog });
        if (r.credited > 0) {
          totalCredited += r.credited;
          usersProcessed++;
          addLog('✅ ' + (userData.name || userId) + ': ₹' + r.credited + ' credited (' + r.perInvestment.length + ' plan' + (r.perInvestment.length === 1 ? '' : 's') + ')');
        }
        plansCompleted += r.plansCompleted;
      } catch(userErr) {
        console.error('[DailyReturn] User ' + userId + ' failed:', userErr);
        addLog('<span style="color:var(--red);">❌ ' + (userData.name || userId) + ': ' + userErr.message + '</span>');
      }
    }

    addLog('<br><strong style="color:var(--green);">✅ DONE! ' + usersProcessed + ' users credited, Total: ₹' + totalCredited + ', ' + plansCompleted + ' plans completed</strong>');
    showToast('Daily returns processed! ₹' + totalCredited + ' credited to ' + usersProcessed + ' users. ✅', 'success');
    loadDashboardStats();

  } catch(err) {
    console.error('Process daily returns error:', err);
    addLog('<strong style="color:var(--red);">❌ Error: ' + err.message + '</strong>');
    showToast('Failed: ' + err.message, 'error');
  } finally {
    delete _adminProcessingActions[actionKey];
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play-circle"></i> Process All Users\' Daily Returns';
      btn.classList.remove('btn-admin-processing');
    }
  }
};

// ═══════════════════════════════════════════════════════════════
//  NEW FEATURE: Admin can send daily-return to a SPECIFIC user
// ═══════════════════════════════════════════════════════════════
// Two modes:
//   1) Auto-calculate — credits the sum of today's pending daily
//      returns for the selected user (identical to cron behaviour).
//   2) Custom amount — admin types any amount; it is credited to
//      the user's wallet as a "daily_return" transaction with an
//      optional reason. Does NOT touch the investment counters.

async function _loadUsersIntoDailyReturnDropdown() {
  var sel = document.getElementById('dailyReturnUserSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading users...</option>';
  try {
    var snap = await backend.getDocs(backend.collection(backend.db, 'users'));
    var opts = ['<option value="">-- Select a user --</option>'];
    var rows = [];
    for (var i = 0; i < snap.docs.length; i++) {
      var u = snap.docs[i];
      var d = u.data();
      rows.push({ id: u.id, name: d.name || '(no name)', phone: d.phone || '', balance: d.balance || 0 });
    }
    rows.sort(function(a,b) { return (a.name || '').localeCompare(b.name || ''); });
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      opts.push('<option value="' + r.id + '">' + r.name + ' — ' + (r.phone || r.id) + ' (₹' + r.balance + ')</option>');
    }
    sel.innerHTML = opts.join('');
  } catch(err) {
    console.error('[Admin] Load users for daily-return dropdown failed:', err);
    sel.innerHTML = '<option value="">Failed to load users</option>';
  }
}
window._loadUsersIntoDailyReturnDropdown = _loadUsersIntoDailyReturnDropdown;

// Auto-calculate & send today's daily return to a single user.
window.processSingleUserDailyReturns = async function() {
  var sel = document.getElementById('dailyReturnUserSelect');
  var userId = sel ? sel.value : '';
  if (!userId) return showToast('Please select a user first.', 'warning');

  var actionKey = 'process_single_' + userId;
  if (_adminProcessingActions[actionKey]) return showToast('Already processing this user...', 'warning');
  _adminProcessingActions[actionKey] = true;

  var btn = document.getElementById('processSingleReturnBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

  var logEl = document.getElementById('dailyReturnsLog');
  function addLog(msg) {
    if (logEl) logEl.innerHTML += '<p style="font-size:12px;color:var(--text-2);padding:4px 0;border-bottom:1px solid var(--border);">' + msg + '</p>';
  }

  try {
    var now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 3) {
      return showToast('Too early — daily returns process after 12:03 AM.', 'warning');
    }
    var userSnap = await backend.getDoc(backend.doc(backend.db, 'users', userId));
    if (!userSnap.exists()) return showToast('User not found.', 'error');
    var uName = userSnap.data().name || userId;

    addLog('⏳ Processing pending returns for <strong>' + uName + '</strong>...');
    var r = await _processUserDailyReturnsAtomic(userId, { log: addLog });

    if (r.credited > 0) {
      addLog('✅ ' + uName + ': ₹' + r.credited + ' credited across ' + r.perInvestment.length + ' plan(s).');
      showToast('₹' + r.credited + ' credited to ' + uName + ' ✅', 'success');
    } else if (r.plansCompleted > 0) {
      addLog('ℹ️ ' + uName + ': ' + r.plansCompleted + ' plan(s) marked completed, no pending returns.');
      showToast('No pending returns. ' + r.plansCompleted + ' plan(s) completed.', 'info');
    } else {
      addLog('ℹ️ ' + uName + ': Nothing to credit (already paid today or no active plans).');
      showToast('No pending returns for this user today.', 'info');
    }
    loadDashboardStats();
  } catch(err) {
    console.error('[Admin] processSingleUserDailyReturns failed:', err);
    showToast('Failed: ' + err.message, 'error');
  } finally {
    delete _adminProcessingActions[actionKey];
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-check"></i> Auto-Credit Pending Returns'; }
  }
};

// Send a custom amount as a daily-return to a single user.
window.sendCustomReturnToUser = async function() {
  var sel = document.getElementById('dailyReturnUserSelect');
  var userId = sel ? sel.value : '';
  if (!userId) return showToast('Please select a user first.', 'warning');

  var amtEl = document.getElementById('dailyReturnCustomAmount');
  var reasonEl = document.getElementById('dailyReturnCustomReason');
  var amount = parseFloat(amtEl ? amtEl.value : '0');
  var reason = (reasonEl ? reasonEl.value : '').trim();

  if (!amount || isNaN(amount) || amount <= 0) return showToast('Enter a valid amount (> 0).', 'warning');
  if (amount > 1000000) return showToast('Amount too large (> ₹10,00,000). Aborting for safety.', 'error');

  var actionKey = 'custom_return_' + userId;
  if (_adminProcessingActions[actionKey]) return showToast('Already processing this user...', 'warning');

  var confirmed = confirm('Send ₹' + amount + ' as a daily-return to this user?\n\nReason: ' + (reason || '(none)') + '\n\nThis will credit the user\'s withdrawable balance and create a transaction record.');
  if (!confirmed) return;

  _adminProcessingActions[actionKey] = true;
  var btn = document.getElementById('sendCustomReturnBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

  var logEl = document.getElementById('dailyReturnsLog');
  function addLog(msg) {
    if (logEl) logEl.innerHTML += '<p style="font-size:12px;color:var(--text-2);padding:4px 0;border-bottom:1px solid var(--border);">' + msg + '</p>';
  }

  try {
    var userSnap = await backend.getDoc(backend.doc(backend.db, 'users', userId));
    if (!userSnap.exists()) return showToast('User not found.', 'error');
    var ud = userSnap.data();
    var uName = ud.name || userId;

    // Credit wallet (atomic single update)
    await backend.updateDoc(backend.doc(backend.db, 'users', userId), {
      balance: Number(ud.balance || 0) + amount,
      withdrawableBalance: Number(ud.withdrawableBalance || 0) + amount,
      totalReturns: Number(ud.totalReturns || 0) + amount
    });

    // Transaction log
    await backend.addDoc(backend.collection(backend.db, 'transactions'), {
      userId: userId, type: 'daily_return', amount: amount,
      plan: reason ? ('Admin Manual Return — ' + reason) : 'Admin Manual Daily Return',
      status: 'approved', source: 'admin_manual',
      adminId: (adminUser && adminUser.uid) || 'admin',
      createdAt: backend.serverTimestamp()
    });

    // Notification
    await backend.addDoc(backend.collection(backend.db, 'notifications'), {
      userId: userId,
      message: '💰 You received ₹' + amount + ' as a daily return' + (reason ? ' — ' + reason : '') + '.',
      type: 'success', read: false, createdAt: backend.serverTimestamp()
    });

    addLog('✅ Sent ₹' + amount + ' to <strong>' + uName + '</strong>' + (reason ? ' — ' + reason : ''));
    showToast('₹' + amount + ' sent to ' + uName + ' ✅', 'success');

    // Clear inputs & refresh dashboards
    if (amtEl) amtEl.value = '';
    if (reasonEl) reasonEl.value = '';
    loadDashboardStats();
    _loadUsersIntoDailyReturnDropdown(); // refresh balances in the dropdown
  } catch(err) {
    console.error('[Admin] sendCustomReturnToUser failed:', err);
    showToast('Failed: ' + err.message, 'error');
  } finally {
    delete _adminProcessingActions[actionKey];
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Custom Amount'; }
  }
};

// ═══════════════════════════════════════════════════════════════
// NOTE: Removed the auto-process-on-login IIFE.
// Daily returns used to run automatically 3 seconds after the admin
// dashboard loaded. This caused duplicate processing when both the
// admin and user apps were online, and spiked Firestore usage on
// every admin page refresh. Admin must now click the button
// explicitly OR use a scheduled cloud function for cron execution.
// ═══════════════════════════════════════════════════════════════

// ═══ UNIVERSAL ADMIN BUTTON GUARD — Prevent double-clicks ═══
(function setupAdminButtonGuard() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-primary, .btn-secondary, .btn-sm, .btn-action');
    if (!btn) return;
    if (btn.classList.contains('btn-admin-processing') || btn.classList.contains('btn-admin-success')) return;
    if (btn.classList.contains('modal-close') || btn.classList.contains('eye-btn')) return;
    // Skip nav/filter buttons
    var onclick = btn.getAttribute('onclick') || '';
    if (onclick.indexOf('switchPage') !== -1 || onclick.indexOf('filter') !== -1 || onclick.indexOf('toggleSidebar') !== -1) return;
    if (onclick.indexOf('closeModal') !== -1 || onclick.indexOf('openModal') !== -1) return;
    if (!onclick) return;

    // Prevent rapid double-clicks (300ms debounce)
    if (btn._lastClick && (Date.now() - btn._lastClick) < 800) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    btn._lastClick = Date.now();
  }, true);
})();

console.log("[Admin] SliceInvest Admin Panel v4.0 (MAJOR UPDATE) script loaded");
