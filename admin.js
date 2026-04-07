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
    var cols = ["users","investments","requests","transactions","notifications","config","bankAccounts","admins"];
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

  if (isUserAllowedByConfig(user)) {
    var adminProfile = await resolveAdminProfile(user);
    return { allowed: true, profile: adminProfile.profile };
  }

  if (ADMIN_ACCESS_CONFIG.allowAdminsCollectionFallback) {
    var adminProfile2 = await resolveAdminProfile(user);
    if (adminProfile2.matched) {
      return { allowed: true, profile: adminProfile2.profile };
    }

    if (!hasConfiguredAdminRestriction()) {
      try {
        var collectionName = ADMIN_ACCESS_CONFIG.adminsCollectionName || "admins";
        var allAdminsSnap = await backend.getDocs(backend.collection(backend.db, collectionName));
        if (allAdminsSnap.empty) {
          var bootstrapProfile = {
            name: user.displayName || "Admin",
            email: user.email || "",
            role: "admin",
            createdAt: backend.serverTimestamp(),
            bootstrap: true
          };
          await backend.setDoc(backend.doc(backend.db, collectionName, user.uid), bootstrapProfile);
          return { allowed: true, profile: Object.assign({ id: user.uid }, bootstrapProfile) };
        }
      } catch (e) {
        console.warn("[Admin] Admin bootstrap failed:", e);
      }
    }
  }

  return {
    allowed: false,
    reason: "This account is not authorized for admin access. Add your admin email in ADMIN_ACCESS_CONFIG.allowedEmails or create a matching admin document in Firestore."
  };
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
  loadUpiSettings().catch(function(e) { console.error("UPI settings:", e); });
  loadPlatformConfig().catch(function(e) { console.error("Platform config:", e); });
  loadUsersForNotifDropdown().catch(function(e) { console.error("Notif dropdown:", e); });
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
    "users": "User Management",
    "transactions": "All Transactions",
    "investments": "Investment Management",
    "notifications": "Notifications",
    "upi-settings": "UPI Settings",
    "platform": "Platform Configuration"
  };
  document.getElementById("pageTitle").textContent = titles[page] || "Dashboard";

  document.getElementById("sidebar").classList.remove("open");
  var overlay = document.getElementById("sidebarOverlay");
  if (overlay) overlay.classList.remove("active");

  switch(page) {
    case "dashboard":      loadDashboardStats(); break;
    case "deposits":       loadDeposits(); break;
    case "withdrawals":    loadWithdrawals(); break;
    case "users":          loadUsers(); break;
    case "transactions":   loadAllTransactions(); break;
    case "investments":    loadAllInvestments(); break;
    case "notifications":  loadSentNotifications(); loadUsersForNotifDropdown(); break;
    case "upi-settings":   loadUpiSettings(); break;
    case "platform":       loadPlatformConfig(); break;
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
  var action = newStatus === "approved" ? "approve" : "reject";
  if (!confirm("Are you sure you want to " + action + " this deposit?")) return;

  try {
    var d = backend.doc, gd = backend.getDoc, ud = backend.updateDoc, ad = backend.addDoc, col = backend.collection, db = backend.db, st = backend.serverTimestamp;

    var reqRef = d(db, "requests", requestId);
    var reqSnap = await gd(reqRef);
    if (!reqSnap.exists()) return showToast("Request not found.", "error");
    var reqData = reqSnap.data();

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

    showToast("Deposit " + newStatus + "! ✅", "success");
    loadDeposits();
    loadDashboardStats();
  } catch(err) {
    console.error(err);
    showToast("Failed: " + err.message, "error");
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
      return '<tr><td data-label="User"><strong>' + (data.userName || "\u2014") + '</strong><br><small style="color:#94A3B8">' + (data.userPhone || data.userId || "") + '</small></td><td data-label="Amount"><strong style="color:#E74C3C">' + fmt(data.amount) + '</strong></td><td data-label="Bank Details" class="td-bank-details">' + bankDetailHtml + '</td><td data-label="Date">' + fmtDateTime(data.createdAt) + '</td><td data-label="Status"><span class="status-badge ' + data.status + '">' + data.status + '</span></td><td data-label="Actions"><div class="actions-cell">' + (isPending ? '<button class="btn-action approve" onclick="processWithdrawal(\'' + d.id + '\',\'approved\')"><i class="fas fa-check"></i> Approve</button><button class="btn-action reject" onclick="processWithdrawal(\'' + d.id + '\',\'rejected\')"><i class="fas fa-xmark"></i> Reject</button><button class="btn-action danger" onclick="processWithdrawal(\'' + d.id + '\',\'failed\')"><i class="fas fa-triangle-exclamation"></i> Failed</button>' : '<span style="color:#94A3B8;font-size:11px">Processed</span>') + '</div></td></tr>';
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
  var actionLabels = { approved: 'approve', rejected: 'reject', failed: 'mark as failed' };
  var action = actionLabels[newStatus] || newStatus;
  if (!confirm("Are you sure you want to " + action + " this withdrawal?")) return;

  try {
    var d = backend.doc, gd = backend.getDoc, ud = backend.updateDoc, ad = backend.addDoc, col = backend.collection, db = backend.db, st = backend.serverTimestamp;

    var reqRef = d(db, "requests", requestId);
    var reqSnap = await gd(reqRef);
    if (!reqSnap.exists()) return showToast("Request not found.", "error");
    var reqData = reqSnap.data();

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
      // ═══ FIX: REFUND the balance back since it was deducted on request ═══
      var userRef = d(db, "users", reqData.userId);
      var userSnap = await gd(userRef);
      if (userSnap.exists()) {
        var userData = userSnap.data();
        var refundedBalance = (userData.balance || 0) + Number(reqData.amount || 0);
        await ud(userRef, { balance: refundedBalance });
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
        ? "\u26A0\uFE0F Withdrawal of " + fmt(reqData.amount) + " failed. Amount refunded to your wallet. Please try again or contact support."
        : "\u274c Withdrawal of " + fmt(reqData.amount) + " was rejected. Amount refunded to your wallet. Contact support for details.";

      await ad(col(db, "notifications"), {
        userId: reqData.userId,
        message: failMsg,
        type: "warning", read: false, createdAt: st()
      });
    }

    showToast("Withdrawal " + newStatus + "! \u2705", "success");
    loadWithdrawals();
    loadDashboardStats();
  } catch(err) {
    console.error(err);
    showToast("Failed: " + err.message, "error");
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
    return '<tr><td data-label="Name"><strong>' + (data.name || "\u2014") + '</strong></td><td data-label="Phone">' + (data.phone || "\u2014") + '</td><td data-label="Balance"><strong>' + fmt(data.balance || 0) + '</strong></td><td data-label="Invested">' + fmt(data.totalInvested || 0) + '</td><td data-label="Status"><span class="status-badge ' + (isDisabled ? "disabled" : "enabled") + '">' + (isDisabled ? "Disabled" : "Active") + '</span></td><td data-label="Actions"><div class="actions-cell"><button class="btn-action view" onclick="viewUser(\'' + d.id + '\')"><i class="fas fa-eye"></i></button><button class="btn-action edit" onclick="openAddBalance(\'' + d.id + '\',\'' + safeName + '\',' + (data.balance || 0) + ')"><i class="fas fa-wallet"></i></button><button class="btn-action ' + (isDisabled ? 'approve' : 'warn') + '" onclick="toggleUserStatus(\'' + d.id + '\',' + (!isDisabled) + ')"><i class="fas fa-' + (isDisabled ? 'check' : 'ban') + '"></i></button><button class="btn-action danger" onclick="deleteUserAccount(\'' + d.id + '\',\'' + safeName + '\')" title="Delete User & All Data"><i class="fas fa-trash"></i></button></div></td></tr>';
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
    return '<tr><td data-label="Name"><strong>' + (u.name || "\u2014") + '</strong></td><td data-label="Phone">' + (u.phone || "\u2014") + '</td><td data-label="Balance"><strong>' + fmt(u.balance || 0) + '</strong></td><td data-label="Invested">' + fmt(u.totalInvested || 0) + '</td><td data-label="Status"><span class="status-badge ' + (isDisabled ? "disabled" : "enabled") + '">' + (isDisabled ? "Disabled" : "Active") + '</span></td><td data-label="Actions"><div class="actions-cell"><button class="btn-action view" onclick="viewUser(\'' + u.id + '\')"><i class="fas fa-eye"></i></button><button class="btn-action edit" onclick="openAddBalance(\'' + u.id + '\',\'' + safeName + '\',' + (u.balance || 0) + ')"><i class="fas fa-wallet"></i></button><button class="btn-action ' + (isDisabled ? 'approve' : 'warn') + '" onclick="toggleUserStatus(\'' + u.id + '\',' + (!isDisabled) + ')"><i class="fas fa-' + (isDisabled ? 'check' : 'ban') + '"></i></button><button class="btn-action danger" onclick="deleteUserAccount(\'' + u.id + '\',\'' + safeName + '\')" title="Delete User & All Data"><i class="fas fa-trash"></i></button></div></td></tr>';
  }).join("");
};

window.viewUser = async function(userId) {
  var content = document.getElementById("userDetailContent");
  content.innerHTML = '<p>Loading...</p>';
  openModal("userDetailModal");

  try {
    var snap = await backend.getDoc(backend.doc(backend.db, "users", userId));
    if (!snap.exists()) { content.innerHTML = '<p>User not found.</p>'; return; }
    var u = snap.data();

    content.innerHTML = '<div class="user-detail-grid"><div class="ud-item"><label>Name</label><div class="ud-value">' + (u.name || "—") + '</div></div><div class="ud-item"><label>Phone</label><div class="ud-value">' + (u.phone || "—") + '</div></div><div class="ud-item"><label>Balance</label><div class="ud-value" style="color:#00B894">' + fmt(u.balance || 0) + '</div></div><div class="ud-item"><label>Total Invested</label><div class="ud-value">' + fmt(u.totalInvested || 0) + '</div></div><div class="ud-item"><label>Total Returns</label><div class="ud-value">' + fmt(u.totalReturns || 0) + '</div></div><div class="ud-item"><label>Active Plans</label><div class="ud-value">' + (u.activePlans || 0) + '</div></div><div class="ud-item"><label>Referral Code</label><div class="ud-value">' + (u.referralCode || "—") + '</div></div><div class="ud-item"><label>Referred By</label><div class="ud-value">' + (u.referredBy || "—") + '</div></div><div class="ud-item"><label>Reward Streak</label><div class="ud-value">🔥 ' + (u.dailyRewardStreak || 0) + ' days</div></div><div class="ud-item"><label>Status</label><div class="ud-value">' + (u.disabled ? "🔴 Disabled" : "🟢 Active") + '</div></div><div class="ud-item"><label>Withdraw Password</label><div class="ud-value">' + (u.withdrawPassword ? "Set" : "Not Set") + '</div></div><div class="ud-item full"><label>Created At</label><div class="ud-value">' + fmtDateTime(u.createdAt) + '</div></div><div class="ud-item full"><label>User ID</label><div class="ud-value" style="font-size:11px;word-break:break-all">' + userId + '</div></div></div>';
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
      bankAccounts: 0
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

    // 6. Finally, delete the user document itself
    await dd(d(db, 'users', userId));

    var summary = 'User "' + (userName || userId) + '" deleted! 🗑️\n' +
      'Removed: ' + deletedCounts.investments + ' investments, ' +
      deletedCounts.transactions + ' transactions, ' +
      deletedCounts.requests + ' requests, ' +
      deletedCounts.notifications + ' notifications, ' +
      deletedCounts.bankAccounts + ' bank accounts.';

    console.log('[Admin] ' + summary);
    showToast('User permanently deleted! 🗑️ (' +
      (deletedCounts.investments + deletedCounts.transactions + deletedCounts.requests + deletedCounts.notifications + deletedCounts.bankAccounts) +
      ' related records removed)', 'success');

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
  }
};

window.openAddBalance = function(userId, userName, currentBalance) {
  document.getElementById("balanceUserInfo").textContent = "User: " + userName + " (Current: " + fmt(currentBalance) + ")";
  document.getElementById("balanceAmount").value = "";
  document.getElementById("balanceReason").value = "";
  var btn = document.getElementById("addBalanceBtn");
  btn.onclick = function() { addBalance(userId); };
  openModal("addBalanceModal");
};

async function addBalance(userId) {
  var amount = parseFloat(document.getElementById("balanceAmount").value);
  var reason = document.getElementById("balanceReason").value.trim();

  if (isNaN(amount) || amount === 0) return showToast("Enter a valid amount.", "error");

  try {
    var userRef = backend.doc(backend.db, "users", userId);
    var userSnap = await backend.getDoc(userRef);
    if (!userSnap.exists()) return showToast("User not found.", "error");

    var userData = userSnap.data();
    var newBalance = Math.max(0, (userData.balance || 0) + amount);

    await backend.updateDoc(userRef, { balance: newBalance });

    await backend.addDoc(backend.collection(backend.db, "transactions"), {
      userId: userId, type: amount > 0 ? "deposit" : "withdraw",
      amount: Math.abs(amount),
      status: "approved",
      method: "admin_manual",
      note: reason || "Admin balance adjustment",
      createdAt: backend.serverTimestamp()
    });

    await backend.addDoc(backend.collection(backend.db, "notifications"), {
      userId: userId,
      message: amount > 0
        ? "💰 " + fmt(Math.abs(amount)) + " credited to your wallet by admin. " + (reason ? "Reason: " + reason : "")
        : "💸 " + fmt(Math.abs(amount)) + " deducted from your wallet by admin. " + (reason ? "Reason: " + reason : ""),
      type: amount > 0 ? "success" : "warning",
      read: false,
      createdAt: backend.serverTimestamp()
    });

    closeModal("addBalanceModal");
    showToast("Balance updated! ✅", "success");
    loadUsers();
    loadDashboardStats();
  } catch(err) {
    showToast("Failed: " + err.message, "error");
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
      var color = data.type === "deposit" ? "#00B894" : data.type === "withdraw" ? "#E74C3C" : "#6C5CE7";
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
  if (!confirm("Cancel this investment and refund the user?")) return;

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
  var target  = document.getElementById("notifTarget").value;
  var type    = document.getElementById("notifType").value;
  var message = document.getElementById("notifMessage").value.trim();

  if (!message) return showToast("Enter a message.", "error");

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
      document.getElementById("cfgReferralBonus").value = data.referralBonus || 50;
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
      referralBonus: Number(document.getElementById("cfgReferralBonus").value) || 50,
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

console.log("[Admin] SliceInvest Admin Panel v1.0 (FIXED) script loaded");
