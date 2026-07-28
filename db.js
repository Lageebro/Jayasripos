// db.js - Dexie.js Database Wrapper for Jaya Sri POS System

// Initialize Dexie
const db = new Dexie("JayaSriPOSDatabase");

// Define Schemas
db.version(1).stores({
  workers: "++id, name, group, joinDate, pinCode", // group: 'packaging' | 'machine_operator'
  attendanceEntries: "++id, workerId, date, clockIn, clockOut, hoursWorked, wage", // Packaging group
  machineEntries: "++id, workerId, date, machineId, boxCount, mixerCount, wage", // Machine operators
  advances: "++id, workerId, date, amount, note",
  paysheets: "++id, workerId, periodStart, periodEnd, totalWage, totalAdvances, netPay, generatedDate",
  settings: "key" // key, value
});

// Default configurations
const defaultPackagingRates = {
  1: 100, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600, 7: 700, 8: 800,
  9: 1000, 10: 1200, 11: 1320, 12: 1500, 13: 1660, 14: 1840,
  15: 2040, 16: 2260, 17: 2500, 18: 2760, 19: 3040, 20: 3340,
  21: 3660, 22: 4000, 23: 4360, 24: 5000
};

const defaultMachineRates = {
  machine_01: {
    name: "Jaya Sri 1.48",
    mixer1: {
      32: 500, 33: 550, 34: 600, 35: 650, 36: 700, 37: 750, 38: 800, 39: 850, 40: 900, 41: 950, 42: 1000, 43: 1050, 44: 1100, 45: 1150
    },
    mixer4: {
      32: 600, 33: 650, 34: 700, 35: 750, 36: 800, 37: 850, 38: 900, 39: 950, 40: 1000, 41: 1050, 42: 1100, 43: 1150, 44: 1200, 45: 1250 // corrected typo in source: 1150 -> 1250, editable in UI
    }
  },
  machine_02: {
    name: "Jaya Sri 2.60",
    mixer1: {
      32: 500, 33: 550, 34: 600, 35: 650, 36: 700, 37: 750, 38: 800, 39: 850, 40: 900, 41: 950, 42: 1000, 43: 1050, 44: 1100, 45: 1150
    },
    mixer4: {
      32: 600, 33: 650, 34: 700, 35: 750, 36: 800, 37: 850, 38: 900, 39: 950, 40: 1000, 41: 1050, 42: 1100, 43: 1150, 44: 1200, 45: 1250
    }
  },
  machine_03: {
    name: "MRW 3.44",
    mixer1: {
      27: 500, 28: 550, 29: 600, 30: 650, 31: 700, 32: 750, 33: 800, 34: 850, 35: 900, 36: 950, 37: 1000
    },
    mixer4: {
      27: 600, 28: 650, 29: 700, 30: 750, 31: 800, 32: 850, 33: 900, 34: 950, 35: 1000, 36: 1050, 37: 1100
    }
  }
};

// Populate default settings upon creation
db.on("populate", async () => {
  await db.settings.bulkAdd([
    { key: "packaging_rates", value: defaultPackagingRates },
    { key: "machine_rates", value: defaultMachineRates },
    { key: "hourly_rounding", value: "interpolate" }, // interpolate | round_down | round_up | nearest
    { key: "firebase_config", value: {
      apiKey: "AIzaSyB8n-lOuvEZMcursYcvQMgWxZFAB5eQLLQ",
      authDomain: "jayasrisystem-6c73c.firebaseapp.com",
      projectId: "jayasrisystem-6c73c",
      storageBucket: "jayasrisystem-6c73c.firebasestorage.app",
      messagingSenderId: "616485465407",
      appId: "1:616485465407:web:132e8a97be3ed86504b78a"
    } }
  ]);
});

// Helper: Get Setting (IndexedDB with LocalStorage Fallback)
async function getSetting(key, defaultValue = null) {
  const setting = await db.settings.get(key);
  if (setting && setting.value !== undefined) {
    return setting.value;
  }
  
  // Try localStorage fallback
  try {
    const cached = localStorage.getItem("jayasri_setting_" + key);
    if (cached !== null) {
      const parsed = JSON.parse(cached);
      await db.settings.put({ key, value: parsed });
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to load setting from localStorage:", e);
  }

  return defaultValue;
}

// Helper: Set Setting (IndexedDB + LocalStorage Dual-Layer Persistence)
async function setSetting(key, value) {
  await db.settings.put({ key, value });
  try {
    localStorage.setItem("jayasri_setting_" + key, JSON.stringify(value));
  } catch (e) {
    console.warn("Failed to cache setting to localStorage:", e);
  }
}

// Helper: Workers Backup & Restore for Permanent Persistence
async function backupWorkersToLocalStorage() {
  try {
    const workers = await db.workers.toArray();
    localStorage.setItem("jayasri_workers_backup", JSON.stringify(workers));
  } catch (e) {
    console.warn("Failed to backup workers to localStorage:", e);
  }
}

async function restoreWorkersFromLocalStorage() {
  try {
    const backupStr = localStorage.getItem("jayasri_workers_backup");
    if (!backupStr) return false;
    const workers = JSON.parse(backupStr);
    if (Array.isArray(workers) && workers.length > 0) {
      for (let w of workers) {
        await db.workers.put(w);
      }
      return true;
    }
  } catch (e) {
    console.warn("Failed to restore workers from localStorage:", e);
  }
  return false;
}

// Helper: Wage Calculations

/**
 * Calculates wage for Packaging Group based on hours worked
 * @param {number} hours 
 * @returns {Promise<number>}
 */
async function calculatePackagingWage(hours) {
  if (hours <= 0) return 0;
  const rates = await getSetting("packaging_rates", defaultPackagingRates);
  const rounding = await getSetting("hourly_rounding", "interpolate");

  if (rounding === "round_down") {
    const hr = Math.floor(hours);
    if (hr === 0) return rates[1] * hours; // prorate if less than an hour
    return rates[hr] || (hr > 24 ? rates[24] : 0);
  } else if (rounding === "round_up") {
    const hr = Math.ceil(hours);
    return rates[hr] || (hr > 24 ? rates[24] : 0);
  } else if (rounding === "nearest") {
    const hr = Math.round(hours);
    if (hr === 0) return rates[1] * hours;
    return rates[hr] || (hr > 24 ? rates[24] : 0);
  } else {
    // Interpolate
    const lowerHour = Math.floor(hours);
    const upperHour = Math.ceil(hours);

    if (lowerHour === upperHour) {
      return rates[lowerHour] || (lowerHour > 24 ? rates[24] : 0);
    }
    
    // Boundary check
    if (lowerHour >= 24) return rates[24];
    if (lowerHour < 1) {
      // Scale from 0 to 1 hour rate
      const rate1 = rates[1] || 100;
      return rate1 * hours;
    }

    const rateLower = rates[lowerHour] || 0;
    const rateUpper = rates[upperHour] || 0;
    
    const fraction = hours - lowerHour;
    return Math.round(rateLower + (rateUpper - rateLower) * fraction);
  }
}

/**
 * Calculates wage for Machine Operators
 * @param {string} machineId 
 * @param {number} boxCount 
 * @param {number} mixerCount 
 * @returns {Promise<{wage: number, error: string|null}>}
 */
async function calculateMachineWage(machineId, boxCount, mixerCount) {
  const machineRates = await getSetting("machine_rates", defaultMachineRates);
  const machine = machineRates[machineId];
  if (!machine) {
    return { wage: 0, error: `Invalid Machine Selection: ${machineId}` };
  }

  // Support 1 to 7 mixers
  if (mixerCount < 1 || mixerCount > 7) {
    return { wage: 0, error: `Invalid Mixer Count: ${mixerCount}. Must be between 1 and 7.` };
  }

  // Determine base wage or table wage depending on mixer count
  // Mixer 1, 2, 3 use table "mixer1"
  // Mixer 4, 5, 6, 7 use table "mixer4"
  const isMixer4Based = mixerCount >= 4;
  const activeTable = isMixer4Based ? machine.mixer4 : machine.mixer1;
  const baseWage = activeTable[boxCount];

  if (baseWage === undefined) {
    return { wage: 0, error: `Rate not defined for ${boxCount} boxes on ${machine.name} (Mixer ${isMixer4Based ? '4' : '1'})` };
  }

  let finalWage = 0;
  if (mixerCount === 1) {
    finalWage = baseWage;
  } else if (mixerCount === 2) {
    finalWage = baseWage * 2;
  } else if (mixerCount === 3) {
    finalWage = baseWage * 3;
  } else if (mixerCount === 4) {
    finalWage = baseWage;
  } else if (mixerCount === 5) {
    finalWage = baseWage + 1000;
  } else if (mixerCount === 6) {
    finalWage = baseWage + 2000;
  } else if (mixerCount === 7) {
    finalWage = baseWage + 3000;
  }

  return { wage: finalWage, error: null };
}

// Backup & Restore Utilities
async function exportDatabaseToJSON() {
  const workers = await db.workers.toArray();
  const attendance = await db.attendanceEntries.toArray();
  const machineEntries = await db.machineEntries.toArray();
  const advances = await db.advances.toArray();
  const paysheets = await db.paysheets.toArray();
  const settings = await db.settings.toArray();

  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      workers,
      attendanceEntries: attendance,
      machineEntries,
      advances,
      paysheets,
      settings
    }
  }, null, 2);
}

async function importDatabaseFromJSON(jsonString) {
  try {
    const backup = JSON.parse(jsonString);
    if (!backup.data) throw new Error("Invalid backup format: missing 'data' object.");
    
    await db.transaction("rw", [db.workers, db.attendanceEntries, db.machineEntries, db.advances, db.paysheets, db.settings], async () => {
      // Clear tables
      await db.workers.clear();
      await db.attendanceEntries.clear();
      await db.machineEntries.clear();
      await db.advances.clear();
      await db.paysheets.clear();
      await db.settings.clear();

      // Repopulate
      if (backup.data.workers) await db.workers.bulkAdd(backup.data.workers);
      if (backup.data.attendanceEntries) await db.attendanceEntries.bulkAdd(backup.data.attendanceEntries);
      if (backup.data.machineEntries) await db.machineEntries.bulkAdd(backup.data.machineEntries);
      if (backup.data.advances) await db.advances.bulkAdd(backup.data.advances);
      if (backup.data.paysheets) await db.paysheets.bulkAdd(backup.data.paysheets);
      if (backup.data.settings) await db.settings.bulkAdd(backup.data.settings);
    });
    return true;
  } catch (error) {
    console.error("Failed to import database:", error);
    throw error;
  }
}
