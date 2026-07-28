// mobile.js - Client-Side Controller for Jaya Sri Mobile Operator Dashboard

let selectedMachineId = "";
let selectedMixerCount = 0;

document.addEventListener("DOMContentLoaded", async () => {
  // Set default date
  const today = getTodayDateString();
  document.getElementById("op-date").value = today;

  // Initialize Firebase Cloud Sync if configured
  if (typeof initFirebaseSync === "function") {
    await initFirebaseSync();

    // Listen to real-time workers from cloud
    if (typeof listenCloudWorkers === "function") {
      listenCloudWorkers(async (cloudWorkers) => {
        if (Array.isArray(cloudWorkers) && cloudWorkers.length > 0) {
          for (let w of cloudWorkers) {
            if (w && w.id) {
              await db.workers.put(w);
            }
          }
          await loadOperators();
        }
      });
    }

    // Listen to real-time machine rates / settings from cloud
    if (typeof listenCloudSettings === "function") {
      listenCloudSettings(async (key, value) => {
        if (key && value) {
          await setSetting(key, value);
          if (typeof triggerLiveCalculations === "function") {
            triggerLiveCalculations();
          }
        }
      });
    }
  }

  // Load operators list
  await loadOperators();

  // Render Mixer buttons
  renderMixerButtons();
});

// Helper: Get Today's Date String in exact Sri Lanka Local Time (Asia/Colombo YYYY-MM-DD)
function getTodayDateString() {
  const d = new Date();
  const options = { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" };
  const parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(d);
  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${year}-${month}-${day}`;
}

// Load Machine Operators into selection
async function loadOperators() {
  const select = document.getElementById("op-worker-id");
  select.innerHTML = '<option value="">Choose your name...</option>';

  let operators = await db.workers.where("group").equals("machine_operator").toArray();
  if (operators.length === 0) {
    // Fallback: show all registered workers
    operators = await db.workers.toArray();
  }
  
  if (operators.length === 0) {
    select.innerHTML = '<option value="">No Operators Registered (Register on PC POS)</option>';
    return;
  }

  operators.forEach(op => {
    const opt = document.createElement("option");
    opt.value = op.id;
    opt.textContent = op.name + (op.group === "machine_operator" ? "" : " (" + op.group + ")");
    select.appendChild(opt);
  });
}

// Render Mixer Buttons 1 to 7
function renderMixerButtons() {
  const grid = document.getElementById("mixers-grid");
  grid.innerHTML = "";

  for (let m = 1; m <= 7; m++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = `btn-mixer-${m}`;
    btn.className = "py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-700 font-extrabold text-sm btn-animate flex items-center justify-center";
    btn.textContent = m;
    btn.onclick = () => selectMixer(m);
    grid.appendChild(btn);
  }
}

// Select Machine
function selectMachine(machineId) {
  selectedMachineId = machineId;
  
  // Highlight card
  const ids = ["machine_01", "machine_02", "machine_03"];
  ids.forEach(id => {
    const label = document.getElementById(`label-mach-${id.substring(8)}`);
    if (id === machineId) {
      label.className = "border-2 border-brand-500 bg-brand-50/30 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition select-none text-brand-700 font-bold";
    } else {
      label.className = "border-2 border-slate-200 hover:border-brand-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition select-none bg-slate-50 text-slate-700";
    }
  });

  triggerLiveCalculations();
}

// Select Mixer
function selectMixer(count) {
  selectedMixerCount = count;
  document.getElementById("op-mixers").value = count;

  // Highlight active button
  for (let m = 1; m <= 7; m++) {
    const btn = document.getElementById(`btn-mixer-${m}`);
    if (m === count) {
      btn.className = "py-3 bg-brand-600 border border-brand-500 rounded-xl text-white font-extrabold text-sm btn-animate flex items-center justify-center shadow-md shadow-brand-500/25";
    } else {
      btn.className = "py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-700 font-extrabold text-sm btn-animate flex items-center justify-center";
    }
  }

  triggerLiveCalculations();
}

// Increment/Decrement Boxes
function adjustBoxes(val) {
  const input = document.getElementById("op-boxes");
  let currentVal = parseInt(input.value) || 0;
  currentVal = Math.max(1, currentVal + val);
  input.value = currentVal;
  
  triggerLiveCalculations();
}

// Real-time wage estimate
async function triggerLiveCalculations() {
  const boxes = parseInt(document.getElementById("op-boxes").value);
  const previewPanel = document.getElementById("live-wage-preview");
  const previewAmount = document.getElementById("live-wage-amount");
  const previewInfo = document.getElementById("live-wage-info");

  if (!selectedMachineId || isNaN(boxes) || boxes <= 0 || selectedMixerCount === 0) {
    previewPanel.classList.add("hidden");
    return;
  }

  const calc = await calculateMachineWage(selectedMachineId, boxes, selectedMixerCount);
  previewPanel.classList.remove("hidden");

  if (calc.error) {
    previewAmount.textContent = "Rate not defined!";
    previewAmount.className = "text-md font-extrabold text-red-600";
    previewInfo.textContent = calc.error;
    previewInfo.className = "text-3xs text-red-500 block";
  } else {
    previewAmount.textContent = `${calc.wage.toLocaleString()} LKR`;
    previewAmount.className = "text-xl font-extrabold text-blue-900";
    
    // Add multiplier descriptions
    let desc = `Base rate lookup applied`;
    if (selectedMixerCount === 2) desc = `Mixer multiplier × 2 applied`;
    else if (selectedMixerCount === 3) desc = `Mixer multiplier × 3 applied`;
    else if (selectedMixerCount === 4) desc = `Mixer 4 fixed rate table applied`;
    else if (selectedMixerCount === 5) desc = `Mixer 4 rate + 1,000 LKR bonus applied`;
    else if (selectedMixerCount === 6) desc = `Mixer 4 rate + 2,000 LKR bonus applied`;
    else if (selectedMixerCount === 7) desc = `Mixer 4 rate + 3,000 LKR bonus applied`;

    previewInfo.textContent = desc;
    previewInfo.className = "text-3xs text-blue-500 block";
  }
}

// Form Submit Operator Log
async function submitOperatorLog(e) {
  e.preventDefault();
  const workerId = parseInt(document.getElementById("op-worker-id").value);
  const date = document.getElementById("op-date").value;
  const boxes = parseInt(document.getElementById("op-boxes").value);

  if (isNaN(workerId) || !date || !selectedMachineId || isNaN(boxes) || selectedMixerCount === 0) {
    showStatusBanner("Please fill all form inputs!", "error");
    return;
  }

  const calc = await calculateMachineWage(selectedMachineId, boxes, selectedMixerCount);
  if (calc.error) {
    showStatusBanner(calc.error, "error");
    return;
  }

  // Save entry locally and sync to cloud
  try {
    const entryData = {
      workerId,
      date,
      machineId: selectedMachineId,
      boxCount: boxes,
      mixerCount: selectedMixerCount,
      wage: calc.wage
    };

    const entryId = await db.machineEntries.add(entryData);
    entryData.id = entryId;

    // Sync to Firebase Cloud if connected
    if (typeof syncProductionToCloud === "function") {
      await syncProductionToCloud(entryData);
    }

    showStatusBanner(`Log Saved! Earned: ${calc.wage} LKR`, "success");

    // Clear inputs (except worker name and date for ease of multiple entries)
    document.getElementById("op-boxes").value = "";
    
    // Reset selections
    selectedMachineId = "";
    selectedMixerCount = 0;
    document.getElementById("op-mixers").value = "";

    // Reset machine radios
    const radios = document.getElementsByName("machineId");
    radios.forEach(r => r.checked = false);

    // Reset machine labels UI
    const ids = ["machine_01", "machine_02", "machine_03"];
    ids.forEach(id => {
      const label = document.getElementById(`label-mach-${id.substring(8)}`);
      label.className = "border-2 border-slate-200 hover:border-brand-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition select-none bg-slate-50 text-slate-700";
    });

    // Reset mixer buttons UI
    for (let m = 1; m <= 7; m++) {
      const btn = document.getElementById(`btn-mixer-${m}`);
      btn.className = "py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-700 font-extrabold text-sm btn-animate flex items-center justify-center";
    }

    // Hide wage preview
    document.getElementById("live-wage-preview").classList.add("hidden");

  } catch (error) {
    showStatusBanner("Database save failed: " + error.message, "error");
  }
}

// Banner feedback
function showStatusBanner(message, type) {
  const banner = document.getElementById("op-banner");
  banner.textContent = message;
  banner.classList.remove("hidden", "bg-emerald-500", "text-white", "bg-red-500");

  if (type === "success") {
    banner.classList.add("bg-emerald-500", "text-white");
  } else {
    banner.classList.add("bg-red-500", "text-white");
  }
  banner.classList.remove("hidden");

  // Auto hide in 4s
  setTimeout(() => {
    banner.classList.add("hidden");
  }, 4000);
}

// Backup file from Mobile (Option A sync tool)
async function exportMobileData() {
  try {
    const jsonStr = await exportDatabaseToJSON();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `JayaSriMobile_Dump_${getTodayDateString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert("Export failed: " + error.message);
  }
}
