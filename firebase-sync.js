// firebase-sync.js - Firebase Real-Time Cloud Sync Engine for Jaya Sri POS & Mobile Dashboard

let firebaseApp = null;
let firestoreDb = null;
let isCloudActive = false;

const defaultFirebaseConfig = {
  apiKey: "AIzaSyB8n-lOuvEZMcursYcvQMgWxZFAB5eQLLQ",
  authDomain: "jayasrisystem-6c73c.firebaseapp.com",
  projectId: "jayasrisystem-6c73c",
  storageBucket: "jayasrisystem-6c73c.firebasestorage.app",
  messagingSenderId: "616485465407",
  appId: "1:616485465407:web:132e8a97be3ed86504b78a"
};

/**
 * Initializes Firebase App and Firestore if configuration exists in db.settings or localStorage.
 */
async function initFirebaseSync() {
  try {
    let config = null;

    // 1. Try fetching config from IndexedDB or LocalStorage fallback
    if (typeof getSetting === "function") {
      config = await getSetting("firebase_config", defaultFirebaseConfig);
    }

    if (!config) {
      try {
        const cached = localStorage.getItem("jayasri_setting_firebase_config");
        if (cached) config = JSON.parse(cached);
      } catch (e) {
        console.warn("Failed to parse cached firebase_config:", e);
      }
    }

    // Fallback to embedded system Firebase config
    if (!config || !config.apiKey || !config.projectId) {
      config = defaultFirebaseConfig;
      if (typeof setSetting === "function") {
        await setSetting("firebase_config", config);
      }
    }

    // Initialize Firebase if not already initialized
    if (typeof firebase === "undefined") {
      console.warn("Firebase SDK not loaded on window object.");
      isCloudActive = false;
      updateCloudStatusUI(false);
      return false;
    }

    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(config);
    } else {
      firebaseApp = firebase.app();
    }

    firestoreDb = firebase.firestore();
    isCloudActive = true;
    console.log("Firebase Cloud Sync connected successfully to project:", config.projectId);
    updateCloudStatusUI(true);
    return true;

  } catch (error) {
    console.warn("Firebase initialization error:", error);
    isCloudActive = false;
    updateCloudStatusUI(false);
    return false;
  }
}

/**
 * Checks whether Firebase cloud sync is currently connected.
 */
function isFirebaseConnected() {
  return isCloudActive && firestoreDb !== null;
}

/**
 * Updates UI status badges in PC POS header and Mobile footer.
 */
function updateCloudStatusUI(connected) {
  // PC POS Header Status Indicator
  const posBadge = document.getElementById("cloud-sync-status");
  if (posBadge) {
    if (connected) {
      posBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span> <span class="text-xs font-bold text-slate-700">Cloud Syncing</span>`;
      posBadge.title = "Firebase Cloud Real-Time Sync Active";
    } else {
      posBadge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> <span class="text-xs font-bold text-slate-500">Local Mode</span>`;
      posBadge.title = "Local Offline Database Mode. Configure Firebase in Settings to enable Cloud Sync.";
    }
  }

  // Mobile Footer Sync Indicator
  const mobileIndicator = document.getElementById("mobile-sync-status");
  if (mobileIndicator) {
    if (connected) {
      mobileIndicator.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
        <span class="text-emerald-600 font-bold">Firebase Cloud Active</span>
      `;
    } else {
      mobileIndicator.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
        <span>Local Database Ready</span>
      `;
    }
  }
}

/**
 * Syncs a worker record to Firebase Firestore.
 */
async function syncWorkerToCloud(worker) {
  if (!isFirebaseConnected()) return;
  try {
    const docId = worker.id ? String(worker.id) : String(Date.now());
    await firestoreDb.collection("workers").doc(docId).set({
      id: worker.id || Date.now(),
      name: worker.name,
      group: worker.group,
      joinDate: worker.joinDate,
      pinCode: worker.pinCode || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log("Worker synced to Firebase Cloud:", worker.name);
  } catch (err) {
    console.warn("Failed to sync worker to Cloud:", err);
  }
}

/**
 * Syncs a machine production log entry to Firebase Firestore.
 */
async function syncProductionToCloud(entry) {
  if (!isFirebaseConnected()) return;
  try {
    // Generate unique document ID to prevent mobile entries from overwriting each other
    const docId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await firestoreDb.collection("machine_entries").doc(docId).set({
      cloudId: docId,
      workerId: Number(entry.workerId),
      date: String(entry.date),
      machineId: String(entry.machineId),
      boxCount: Number(entry.boxCount),
      mixerCount: Number(entry.mixerCount),
      wage: Number(entry.wage),
      createdAt: Date.now()
    }, { merge: true });
    console.log("Machine entry synced to Firebase Cloud successfully with unique cloudId:", docId);
  } catch (err) {
    console.warn("Failed to sync machine entry to Cloud:", err);
  }
}

/**
 * Real-time listener for Workers list from Cloud (used by Mobile Dashboard).
 */
function listenCloudWorkers(onWorkersUpdated) {
  if (!isFirebaseConnected()) return null;
  try {
    return firestoreDb.collection("workers").onSnapshot(snapshot => {
      const cloudWorkers = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        cloudWorkers.push(data);
      });
      console.log("Real-time Workers updated from Cloud:", cloudWorkers.length);
      if (typeof onWorkersUpdated === "function") {
        onWorkersUpdated(cloudWorkers);
      }
    }, err => {
      console.warn("Workers Cloud listener error:", err);
    });
  } catch (e) {
    console.warn("Failed to attach Workers Cloud listener:", e);
    return null;
  }
}

/**
 * Real-time listener for Production entries from Cloud (used by PC POS Dashboard).
 */
function listenCloudProductionLogs(onProductionUpdated) {
  if (!isFirebaseConnected()) return null;
  try {
    return firestoreDb.collection("machine_entries").onSnapshot(snapshot => {
      const logs = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        data.cloudId = doc.id;
        logs.push(data);
      });
      console.log("Real-time Machine Entries received from Cloud:", logs.length);
      if (typeof onProductionUpdated === "function") {
        onProductionUpdated(logs);
      }
    }, err => {
      console.warn("Production Logs Cloud listener error:", err);
    });
  } catch (e) {
    console.warn("Failed to attach Production Logs Cloud listener:", e);
    return null;
  }
}

/**
 * Syncs settings/rates to Firebase Cloud.
 */
async function syncSettingsToCloud(key, value) {
  if (!isFirebaseConnected()) return;
  try {
    await firestoreDb.collection("settings").doc(key).set({
      value: value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Setting '${key}' synced to Firebase Cloud.`);
  } catch (err) {
    console.warn(`Failed to sync setting '${key}' to Cloud:`, err);
  }
}

/**
 * Real-time listener for Settings/Rates from Cloud (used by Mobile Dashboard).
 */
function listenCloudSettings(onSettingsUpdated) {
  if (!isFirebaseConnected()) return null;
  try {
    return firestoreDb.collection("settings").onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const key = doc.id;
        const data = doc.data();
        if (data && data.value !== undefined) {
          console.log(`Real-time setting '${key}' received from Cloud.`);
          if (typeof onSettingsUpdated === "function") {
            onSettingsUpdated(key, data.value);
          }
        }
      });
    }, err => {
      console.warn("Settings Cloud listener error:", err);
    });
  } catch (e) {
    console.warn("Failed to attach Settings Cloud listener:", e);
    return null;
  }
}
