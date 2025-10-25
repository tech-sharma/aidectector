// server.js (CommonJS, Express 5 compatible, Port 5000)
require("dotenv").config();
const express = require("express");
const path = require("path");
const fileUpload = require("express-fileupload");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";

// -------- Middleware
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));

// -------- Heuristic keywords (same as frontend)
const suspiciousWords = [
  "urgent", "verify", "password", "bank", "click", "update", "account", "login", "limited"
];

// -------- Gemini config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";

// Using generateContent (newer) endpoint. If your key/model require a different path, adjust the URL.
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;

// ---- Helper: call Gemini with text-only prompt, return best-effort text
async function callGeminiPrompt(promptText, maxOutputTokens = 512) {
  if (!GEMINI_API_KEY) throw new Error("No Gemini API key configured.");

  const body = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: { maxOutputTokens }
  };

  const resp = await axios.post(GEMINI_ENDPOINT, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 30_000
  });

  // Try to find text in the standard place; fall back to stringifying data.
  const text =
    resp?.data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    JSON.stringify(resp.data);

  return { raw: resp.data, text: String(text) };
}

// ----------------- Heuristic Email analysis -----------------
app.post("/api/analyze-email", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing 'text' in request body" });
  }

  const lower = text.toLowerCase();
  const links = lower.match(/https?:\/\/[^\s]+/g) || [];

  let riskScore = 0;
  const found = [];

  suspiciousWords.forEach(word => {
    if (lower.includes(word)) {
      riskScore += 10;
      found.push(word);
    }
  });

  riskScore += links.length * 10;
  if (riskScore > 100) riskScore = 100;

  res.json({
    type: "email",
    method: "heuristic",
    riskScore,
    safe: riskScore <= 50,
    links,
    suspiciousWords: found,
    analyzedAt: new Date().toISOString()
  });
});

// ----------------- Gemini Email analysis -----------------
app.post("/api/analyze-email-ai", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "AI analysis not available: GEMINI_API_KEY not configured on server." });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing 'text' in request body" });
  }

  const prompt = `
You are an assistant that assesses whether an email is a phishing attempt.
Return a JSON object ONLY with keys: "riskScore" (0-100 integer), "labels" (array of detected issues), and "explanation" (short text).
Email content:
"""${text}"""
Rules:
- Provide riskScore as integer 0-100 (higher = more likely phishing).
- In labels include suspicious keywords like "urgent", "verify", "password", "bank", "click", etc., and if there are links include "has_links".
- Keep "explanation" short (1-2 sentences).
Return only JSON.
`;

  try {
    const ai = await callGeminiPrompt(prompt, 300);
    const textOut = ai.text.trim();

    let parsed = null;
    try {
      parsed = JSON.parse(textOut);
    } catch {
      const jsonMatch = textOut.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
      }
    }

    if (!parsed) {
      const match = textOut.match(/([0-9]{1,3})\s*(%?)/);
      const score = match ? Math.min(100, parseInt(match[1], 10)) : null;
      return res.json({
        type: "email",
        method: "gemini",
        riskScore: score,
        safe: score !== null ? score <= 50 : null,
        explanation: textOut,
        raw: ai.raw
      });
    }

    const riskScore = parsed.riskScore != null ? Number(parsed.riskScore) :
                      parsed.score != null ? Number(parsed.score) : null;
    const labels = Array.isArray(parsed.labels) ? parsed.labels : (parsed.labels ? [parsed.labels] : []);
    const explanation = parsed.explanation || parsed.explain || parsed.reason || "";

    res.json({
      type: "email",
      method: "gemini",
      riskScore: riskScore !== null ? Math.max(0, Math.min(100, Math.round(riskScore))) : null,
      safe: riskScore !== null ? (riskScore <= 50) : null,
      labels,
      explanation,
      raw: ai.raw
    });
  } catch (err) {
    console.error("Gemini (email) error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "AI analysis failed", detail: err?.message || String(err) });
  }
});

// ----------------- Heuristic Media analysis -----------------
app.post("/api/analyze-media", (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: "No file uploaded (field name 'file')" });
  }
  const file = req.files.file;
  const sizeMB = file.size / (1024 * 1024);
  const fakeConfidence = Math.min(sizeMB * 10, 100);

  res.json({
    type: "media",
    method: "heuristic",
    fileName: file.name,
    sizeMB: Number(sizeMB.toFixed(2)),
    fakeConfidence: Number(fakeConfidence.toFixed(1)),
    safe: fakeConfidence <= 50,
    analyzedAt: new Date().toISOString()
  });
});

// ----------------- Gemini Media analysis -----------------
app.post("/api/analyze-media-ai", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "AI analysis not available: GEMINI_API_KEY not configured on server." });
  }
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: "No file uploaded (field name 'file')" });
  }

  const file = req.files.file;
  const sizeMB = file.size / (1024 * 1024);

  const prompt = `
You are a helpful assistant that judges whether a media file (image or video) might be a deepfake based on metadata and file characteristics alone.
Return a JSON object ONLY with keys:
- "fakeConfidence" (0-100 integer, higher means more likely fake),
- "explanation" (short text).

Metadata:
- fileName: "${file.name}"
- sizeMB: ${sizeMB.toFixed(2)}
- mimeType: "${file.mimetype}"

If unsure, provide a mid confidence (40-60) and say so.
Return only JSON.
`;

  try {
    const ai = await callGeminiPrompt(prompt, 200);
    const textOut = ai.text.trim();

    let parsed = null;
    try { parsed = JSON.parse(textOut); } catch {
      const jsonMatch = textOut.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
      }
    }

    if (!parsed) {
      const match = textOut.match(/([0-9]{1,3})/);
      const fc = match ? Math.min(100, Number(match[1])) : null;
      return res.json({
        type: "media",
        method: "gemini",
        fileName: file.name,
        sizeMB: Number(sizeMB.toFixed(2)),
        fakeConfidence: fc,
        explanation: textOut,
        raw: ai.raw
      });
    }

    const fakeConfidence = parsed.fakeConfidence != null ? Number(parsed.fakeConfidence) : null;
    const explanation = parsed.explanation || parsed.reason || "";

    res.json({
      type: "media",
      method: "gemini",
      fileName: file.name,
      sizeMB: Number(sizeMB.toFixed(2)),
      fakeConfidence: fakeConfidence !== null ? Math.max(0, Math.min(100, Math.round(fakeConfidence))) : null,
      explanation,
      raw: ai.raw
    });
  } catch (err) {
    console.error("Gemini (media) error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "AI media analysis failed", detail: err?.message || String(err) });
  }
});

// ----------------- Health-check
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    environment: ENV,
    aiAvailable: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });
});

// ----------------- Catch-all for SPA (NO wildcard string → avoids path-to-regexp)
app.use((req, res, next) => {
  // Only handle GETs that are NOT /api/* and accept HTML
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ----------------- Start server
app.listen(PORT, () => {
  console.log(`✅ Server running in ${ENV} at http://localhost:${PORT}`);
  console.log(`   Gemini AI available: ${Boolean(GEMINI_API_KEY)} (model: ${GEMINI_MODEL})`);
});
