// ============================================================
//  SLICE INVEST — Resilient Data Layer
//  Uses Firebase when available, otherwise falls back to localStorage
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyDAisnBAmG3qGyjA_lkzSDrWccNxyr2jMc",
  authDomain:        "slice-investment.firebaseapp.com",
  databaseURL:       "https://slice-investment-default-rtdb.firebaseio.com",
  projectId:         "slice-investment",
  storageBucket:     "slice-investment.firebasestorage.app",
  messagingSenderId: "263752083276",
  appId:             "1:263752083276:web:03b4f22872ccec55c3d1e9",
  measurementId:     "G-4J9033N8WS"
};

function createLocalTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return {
    __timestamp: d.toISOString(),
    toDate() {
      return new Date(this.__timestamp);
    },
    valueOf() {
      return new Date(this.__timestamp).getTime();
    },
    toJSON() {
      return this.__timestamp;
    }
  };
}

const LocalTimestamp = {
  fromDate(date) {
    return createLocalTimestamp(date);
  }
};

function localServerTimestamp() {
  return { __serverTimestamp: true };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createLocalBackend() {
  const STORAGE_KEY = "sliceinvest_local_db_v3";

  function ensureCollections(store) {
    const collections = ["users", "investments", "requests", "transactions", "notifications", "config", "bankAccounts", "withdrawSlips"];
    for (const name of collections) {
      if (!store[name] || typeof store[name] !== "object") store[name] = {};
    }
    return store;
  }

  function seedStore() {
    const now = new Date();
    const createdAt = createLocalTimestamp(now);
    return ensureCollections({
      users: {
        demo_user_1: {
          name: "Demo User",
          phone: "+919876543210",
          password: "123456",
          balance: 5000,
          totalInvested: 0,
          totalReturns: 0,
          activePlans: 0,
          withdrawPassword: "1234",
          disabled: false,
          referralCode: "DEMO1234",
          referredBy: null,
          dailyRewardStreak: 0,
          lastRewardDate: null,
          darkMode: false,
          notificationsEnabled: true,
          email: "demo@sliceinvest.com",
          createdAt
        }
      },
      investments: {},
      requests: {},
      transactions: {},
      notifications: {
        demo_notif_1: {
          userId: "demo_user_1",
          message: "Local demo mode is active. You can log in and test the app without Firebase.",
          type: "info",
          read: false,
          createdAt
        }
      },
      bankAccounts: {
        demo_bank_1: {
          userId: "demo_user_1",
          type: "bank",
          holderName: "Demo User",
          bankName: "State Bank of India",
          accountNumber: "1234567890",
          ifsc: "SBIN0001234",
          createdAt
        },
        demo_upi_1: {
          userId: "demo_user_1",
          type: "upi",
          upiId: "demo@upi",
          displayName: "Demo UPI",
          createdAt
        }
      },
      config: {
        admin: {
          username: "admin",
          password: "Admin@1234"
        }
      }
    });
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = seedStore();
        writeStore(seeded);
        return seeded;
      }
      return ensureCollections(JSON.parse(raw));
    } catch (err) {
      const seeded = seedStore();
      writeStore(seeded);
      return seeded;
    }
  }

  function writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ensureCollections(store)));
  }

  function makeId(prefix = "doc") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function reviveValue(value) {
    if (Array.isArray(value)) return value.map(reviveValue);
    if (!value || typeof value !== "object") return value;
    if (value.__timestamp) return createLocalTimestamp(value.__timestamp);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveValue(v);
    return out;
  }

  function serializeValue(value) {
    if (Array.isArray(value)) return value.map(serializeValue);
    if (!value || typeof value !== "object") return value;
    if (value.__serverTimestamp) return { __timestamp: new Date().toISOString() };
    if (typeof value.toDate === "function") return { __timestamp: value.toDate().toISOString() };
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }

  function snapshotDoc(id, data) {
    return {
      id,
      exists() {
        return data != null;
      },
      data() {
        return data == null ? undefined : reviveValue(clone(data));
      }
    };
  }

  function snapshotQuery(entries) {
    const docs = entries.map(([id, data]) => snapshotDoc(id, data));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach(callback) {
        docs.forEach(callback);
      }
    };
  }

  function normalizeForCompare(value) {
    const revived = reviveValue(value);
    if (revived && typeof revived === "object" && typeof revived.toDate === "function") return revived.toDate().getTime();
    return revived;
  }

  function getFieldValue(obj, field) {
    return field.split(".").reduce((acc, key) => acc?.[key], obj);
  }

  function applyQuery(entries, constraints = []) {
    let result = [...entries];

    for (const c of constraints) {
      if (c.type === "where") {
        result = result.filter(([, data]) => {
          const fieldValue = getFieldValue(data, c.field);
          const left = normalizeForCompare(fieldValue);
          const right = normalizeForCompare(c.value);
          switch (c.op) {
            case "==": return left === right;
            case "!=": return left !== right;
            case ">": return left > right;
            case ">=": return left >= right;
            case "<": return left < right;
            case "<=": return left <= right;
            default: return false;
          }
        });
      }
    }

    const orderConstraint = constraints.find(c => c.type === "orderBy");
    if (orderConstraint) {
      result.sort((a, b) => {
        const av = normalizeForCompare(getFieldValue(a[1], orderConstraint.field));
        const bv = normalizeForCompare(getFieldValue(b[1], orderConstraint.field));
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return orderConstraint.direction === "desc" ? 1 : -1;
        if (av > bv) return orderConstraint.direction === "desc" ? -1 : 1;
        return 0;
      });
    }

    const limitConstraint = constraints.find(c => c.type === "limit");
    if (limitConstraint) result = result.slice(0, limitConstraint.count);

    return result;
  }

  function collection(_db, name) {
    return { __type: "collection", name };
  }

  function doc(_db, collectionName, id) {
    return { __type: "doc", collectionName, id };
  }

  function where(field, op, value) {
    return { type: "where", field, op, value };
  }

  function orderBy(field, direction = "asc") {
    return { type: "orderBy", field, direction };
  }

  function limit(count) {
    return { type: "limit", count };
  }

  function query(ref, ...constraints) {
    return { __type: "query", ref, constraints };
  }

  async function getDocs(ref) {
    const store = readStore();
    if (ref.__type === "collection") {
      const entries = Object.entries(store[ref.name] || {});
      return snapshotQuery(entries);
    }
    if (ref.__type === "query") {
      const collectionName = ref.ref.name;
      const entries = Object.entries(store[collectionName] || {});
      return snapshotQuery(applyQuery(entries, ref.constraints));
    }
    return snapshotQuery([]);
  }

  async function getDoc(ref) {
    const store = readStore();
    const data = store[ref.collectionName]?.[ref.id] ?? null;
    return snapshotDoc(ref.id, data);
  }

  async function setDoc(ref, data) {
    const store = readStore();
    store[ref.collectionName][ref.id] = serializeValue(clone(data));
    writeStore(store);
  }

  async function addDoc(ref, data) {
    const store = readStore();
    const id = makeId(ref.name.slice(0, 3));
    store[ref.name][id] = serializeValue(clone(data));
    writeStore(store);
    return { id };
  }

  async function updateDoc(ref, data) {
    const store = readStore();
    const existing = store[ref.collectionName]?.[ref.id] || {};
    store[ref.collectionName][ref.id] = {
      ...existing,
      ...serializeValue(clone(data))
    };
    writeStore(store);
  }

  async function deleteDoc(ref) {
    const store = readStore();
    delete store[ref.collectionName]?.[ref.id];
    writeStore(store);
  }

  function onSnapshot(ref, callback) {
    getDocs(ref).then(callback);
    return () => {};
  }

  const db = { mode: "local" };
  const auth = { mode: "local" };

  async function signInWithEmailAndPassword() {
    return { user: null };
  }

  async function createUserWithEmailAndPassword() {
    return { user: null };
  }

  async function signOut() {
    return true;
  }

  function onAuthStateChanged(_auth, callback) {
    callback(null);
    return () => {};
  }

  async function updatePassword() {
    return true;
  }

  return {
    mode: "local",
    app: { mode: "local" },
    analytics: null,
    db,
    auth,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp: localServerTimestamp,
    Timestamp: LocalTimestamp,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updatePassword
  };
}

async function initializeBackend() {
  try {
    const [appMod, firestoreMod, authMod, analyticsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js")
    ]);

    const app = appMod.initializeApp(firebaseConfig);
    let analytics = null;
    try {
      analytics = analyticsMod.getAnalytics(app);
    } catch (analyticsError) {
      console.warn("Firebase Analytics unavailable:", analyticsError);
    }

    return {
      mode: "firebase",
      app,
      analytics,
      db: firestoreMod.getFirestore(app),
      auth: authMod.getAuth(app),
      collection: firestoreMod.collection,
      doc: firestoreMod.doc,
      getDoc: firestoreMod.getDoc,
      getDocs: firestoreMod.getDocs,
      setDoc: firestoreMod.setDoc,
      addDoc: firestoreMod.addDoc,
      updateDoc: firestoreMod.updateDoc,
      deleteDoc: firestoreMod.deleteDoc,
      query: firestoreMod.query,
      where: firestoreMod.where,
      orderBy: firestoreMod.orderBy,
      limit: firestoreMod.limit,
      onSnapshot: firestoreMod.onSnapshot,
      serverTimestamp: firestoreMod.serverTimestamp,
      Timestamp: firestoreMod.Timestamp,
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
      signOut: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged,
      updatePassword: authMod.updatePassword
    };
  } catch (error) {
    console.warn("Firebase unavailable. Falling back to local demo mode.", error);
    return createLocalBackend();
  }
}

async function bootstrapSliceInvestBackend() {
  const backend = await initializeBackend();

  // FIX: Use backend's own serverTimestamp & Timestamp (not local fallbacks)
  const api = {
    app: backend.app,
    analytics: backend.analytics,
    db: backend.db,
    auth: backend.auth,
    collection: backend.collection,
    doc: backend.doc,
    getDoc: backend.getDoc,
    getDocs: backend.getDocs,
    setDoc: backend.setDoc,
    addDoc: backend.addDoc,
    updateDoc: backend.updateDoc,
    deleteDoc: backend.deleteDoc,
    query: backend.query,
    where: backend.where,
    orderBy: backend.orderBy,
    limit: backend.limit,
    onSnapshot: backend.onSnapshot,
    serverTimestamp: backend.serverTimestamp,   // ✅ FIXED: was using local fallback
    Timestamp: backend.Timestamp,               // ✅ FIXED: was using local fallback
    signInWithEmailAndPassword: backend.signInWithEmailAndPassword,
    createUserWithEmailAndPassword: backend.createUserWithEmailAndPassword,
    signOut: backend.signOut,
    onAuthStateChanged: backend.onAuthStateChanged,
    updatePassword: backend.updatePassword,
    backendMode: backend.mode
  };

  window.SliceInvestBackend = api;
  return api;
}

window.SliceInvestBackendReady = bootstrapSliceInvestBackend();
