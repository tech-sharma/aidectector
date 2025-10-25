// simple local dashboard persistence
const STORAGE_KEY = "detector_dashboard_v1";
let dashboard = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"emails":[],"media":[]}');

function saveDashboard() { localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboard)); }
function formatTime(ts) { return new Date(ts).toLocaleString(); }

// ---------------- Email (AI + heuristic) ----------------
async function analyzeEmailAI(text) {
  const res = await fetch("/api/analyze-email-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  return res.json();
}

async function analyzeEmailHeuristic(text) {
  const res = await fetch("/api/analyze-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  return res.json();
}

document.getElementById("checkEmail").addEventListener("click", async () => {
  const text = document.getElementById("emailInput").value.trim();
  if (!text) return alert("Please enter email text!");

  const resultDiv = document.getElementById("emailResult");
  resultDiv.textContent = "Analyzing…";

  try {
    const data = await analyzeEmailAI(text);
    if (data.error) {
      // fallback to heuristic
      const h = await analyzeEmailHeuristic(text);
      showEmailResult(h, "heuristic");
      storeEmail(h);
    } else {
      showEmailResult(data, "ai");
      storeEmail(data);
    }
  } catch (err) {
    console.error("Email analysis error:", err);
    const h = await analyzeEmailHeuristic(text);
    showEmailResult(h, "heuristic");
    storeEmail(h);
  }
});

document.getElementById("checkEmailHeu").addEventListener("click", async () => {
  const text = document.getElementById("emailInput").value.trim();
  if (!text) return alert("Please enter email text!");
  const h = await analyzeEmailHeuristic(text);
  showEmailResult(h, "heuristic");
  storeEmail(h);
});

function showEmailResult(data, method) {
  const resultDiv = document.getElementById("emailResult");
  const confidence = data.riskScore != null ? data.riskScore : data.confidence != null ? data.confidence : (data.confidence ? data.confidence : null);

  if (confidence !== null && confidence > 50) {
    resultDiv.className = "result danger";
    resultDiv.innerHTML = `<strong>⚠️ Phishing Likely!</strong><br>
      Confidence: ${confidence}%<br>
      Explanation: ${escapeHtml(data.explanation || data.raw || "")}<br>
      Labels: ${(data.labels || data.suspiciousWords || []).join(", ") || "None"}`;
  } else {
    resultDiv.className = "result safe";
    const confShow = confidence !== null ? `${100 - confidence}%` : "N/A";
    resultDiv.innerHTML = `<strong>✅ Safe Email</strong><br>Confidence: ${confShow}<br>
      Explanation: ${escapeHtml(data.explanation || "")}`;
  }
}

function storeEmail(entry) {
  const normalized = {
    timestamp: Date.now(),
    riskScore: entry.riskScore != null ? entry.riskScore : (entry.confidence != null ? entry.confidence : null),
    labels: entry.labels || entry.suspiciousWords || [],
    meta: entry
  };
  dashboard.emails.unshift(normalized);
  if (dashboard.emails.length > 200) dashboard.emails.pop();
  saveDashboard();
  updateDashboardUI();
}

// ---------------- Media (AI + heuristic) ----------------
async function analyzeMediaAI(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/analyze-media-ai", { method: "POST", body: fd });
  return res.json();
}
async function analyzeMediaHeu(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/analyze-media", { method: "POST", body: fd });
  return res.json();
}

document.getElementById("checkMedia").addEventListener("click", async () => {
  const fi = document.getElementById("mediaInput");
  const file = fi.files[0];
  if (!file) return alert("Please upload a media file.");

  const resultDiv = document.getElementById("mediaResult");
  resultDiv.textContent = "Analyzing…";

  try {
    const data = await analyzeMediaAI(file);
    if (data.error) {
      const h = await analyzeMediaHeu(file);
      showMediaResult(h, "heuristic");
      storeMedia(h);
    } else {
      showMediaResult(data, "ai");
      storeMedia(data);
    }
  } catch (err) {
    console.error("Media AI error:", err);
    const h = await analyzeMediaHeu(file);
    showMediaResult(h, "heuristic");
    storeMedia(h);
  }
});

document.getElementById("checkMediaHeu").addEventListener("click", async () => {
  const fi = document.getElementById("mediaInput");
  const file = fi.files[0];
  if (!file) return alert("Please upload a media file.");
  const h = await analyzeMediaHeu(file);
  showMediaResult(h, "heuristic");
  storeMedia(h);
});

function showMediaResult(data, method) {
  const resultDiv = document.getElementById("mediaResult");
  const conf = data.fakeConfidence != null ? data.fakeConfidence : null;
  if (conf !== null && conf > 50) {
    resultDiv.className = "result danger";
    resultDiv.innerHTML = `<strong>⚠️ Possible Deepfake!</strong><br>
      Confidence: ${conf}%<br>
      File: ${escapeHtml(data.fileName || "")}<br>
      Explanation: ${escapeHtml(data.explanation || "")}`;
  } else {
    resultDiv.className = "result safe";
    const confShow = conf !== null ? `${(100 - conf).toFixed(1)}%` : "N/A";
    resultDiv.innerHTML = `<strong>✅ Media Seems Authentic</strong><br>
      Confidence: ${confShow}<br>
      File: ${escapeHtml(data.fileName || "")}<br>
      Explanation: ${escapeHtml(data.explanation || "")}`;
  }
}

function storeMedia(entry) {
  const normalized = {
    timestamp: Date.now(),
    fakeConfidence: entry.fakeConfidence != null ? entry.fakeConfidence : null,
    fileName: entry.fileName || entry.meta?.fileName,
    meta: entry
  };
  dashboard.media.unshift(normalized);
  if (dashboard.media.length > 200) dashboard.media.pop();
  saveDashboard();
  updateDashboardUI();
}

// ---------------- UI helpers ----------------
document.getElementById("clearEmail").addEventListener("click", () => {
  document.getElementById("emailInput").value = "";
  document.getElementById("emailResult").textContent = "";
});
document.getElementById("clearMedia").addEventListener("click", () => {
  document.getElementById("mediaInput").value = "";
  document.getElementById("mediaResult").textContent = "";
});

// theme toggle
const THEME_KEY = "detector_theme_v1";
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
    document.getElementById("toggleTheme").textContent = "☀️ Light";
  } else {
    document.body.classList.remove("dark");
    document.getElementById("toggleTheme").textContent = "🌙 Dark";
  }
  localStorage.setItem(THEME_KEY, theme);
}
document.getElementById("toggleTheme").addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  applyTheme(isDark ? "dark" : "light");
});
applyTheme(localStorage.getItem(THEME_KEY) || "light");

// dashboard open/close & UI
const dashEl = document.getElementById("dashboard");
document.getElementById("openDashboard").addEventListener("click", () => { dashEl.classList.remove("hidden"); updateDashboardUI(); });
document.getElementById("closeDashboard").addEventListener("click", () => { dashEl.classList.add("hidden"); });

document.getElementById("clearHistory").addEventListener("click", () => {
  if (!confirm("Clear history?")) return;
  dashboard = { emails: [], media: [] };
  saveDashboard();
  updateDashboardUI();
});

function updateDashboardUI() {
  document.getElementById("totalEmails").textContent = dashboard.emails.length;
  document.getElementById("totalMedia").textContent = dashboard.media.length;

  const avgPhish = dashboard.emails.length === 0 ? 0 : Math.round(dashboard.emails.reduce((s,e)=>s+(e.riskScore||0),0)/dashboard.emails.length);
  const avgFake = dashboard.media.length === 0 ? 0 : Math.round(dashboard.media.reduce((s,m)=>s+(m.fakeConfidence||0),0)/dashboard.media.length);
  document.getElementById("avgPhish").textContent = `${avgPhish}%`;
  document.getElementById("avgFake").textContent = `${avgFake}%`;

  const list = document.getElementById("historyList");
  list.innerHTML = "";
  const combined = [];
  dashboard.emails.forEach(e => combined.push({type:"email",ts:e.timestamp,data:e}));
  dashboard.media.forEach(m => combined.push({type:"media",ts:m.timestamp,data:m}));
  combined.sort((a,b)=>b.ts-a.ts);
  const recent = combined.slice(0,20);
  if (recent.length===0) {
    const li = document.createElement("li");
    li.textContent = "No analysis yet — try analyzing an email or media file.";
    list.appendChild(li);
    return;
  }
  recent.forEach(item => {
    const li = document.createElement("li");
    if (item.type==="email") {
      li.innerHTML = `<strong>📧 Email</strong> — ${formatTime(item.data.timestamp)}<br>
        Risk: ${item.data.riskScore ?? "N/A"} — Labels: ${(item.data.labels||[]).join(", ") || "None"}`;
    } else {
      li.innerHTML = `<strong>🎥 Media</strong> — ${formatTime(item.data.timestamp)}<br>
        ${escapeHtml(item.data.fileName || "unknown")} — Fake%: ${item.data.fakeConfidence ?? "N/A"}`;
    }
    list.appendChild(li);
  });
}

// small helper to sanitize text into HTML-safe strings
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// initialize dashboard UI
updateDashboardUI();
