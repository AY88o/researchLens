/**
 * app.js — ResearchLens frontend logic
 *
 * Responsibilities:
 *  - Health-check polling to update the API status badge
 *  - Drag-and-drop + click-to-upload file handling
 *  - File validation (type, size) on the client side
 *  - POST /api/summarize via Fetch API with FormData
 *  - Populating the four summary cards from the JSON response
 *  - "Copy Markdown" and "Download .txt" utility actions
 *  - Toast notification system
 */

"use strict";

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE        = "";            // Empty string = same origin (port 8000)
const MAX_FILE_BYTES  = 10 * 1024 * 1024;  // 10 MB — mirrors backend limit
const HEALTH_INTERVAL = 30_000;        // Re-check health every 30 s

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const dropZone       = document.getElementById("drop-zone");
const fileInput      = document.getElementById("file-input");
const fileInfo       = document.getElementById("file-info");
const fileNameEl     = document.getElementById("file-name");
const fileSizeEl     = document.getElementById("file-size");
const clearFileBtn   = document.getElementById("clear-file-btn");
const errorBanner    = document.getElementById("error-banner");
const errorMessage   = document.getElementById("error-message");
const dismissErrBtn  = document.getElementById("dismiss-error-btn");
const summariseBtn   = document.getElementById("summarise-btn");
const btnLabel       = document.getElementById("btn-label");
const btnSpinner     = document.getElementById("btn-spinner");
const apiBadge       = document.getElementById("api-status-badge");
const resultsSection = document.getElementById("results-section");
const metaFilename   = document.getElementById("meta-filename");
const metaPages      = document.getElementById("meta-pages");
const metaTime       = document.getElementById("meta-time");
const metaMode       = document.getElementById("meta-mode");
const copyBtn        = document.getElementById("copy-btn");
const downloadBtn    = document.getElementById("download-btn");
const newUploadBtn   = document.getElementById("new-upload-btn");
const toast          = document.getElementById("toast");

// Card body elements
const cardBodies = {
  core_problem : document.getElementById("card-problem-body"),
  methodology  : document.getElementById("card-method-body"),
  key_findings : document.getElementById("card-findings-body"),
  limitations  : document.getElementById("card-limits-body"),
};

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFile   = null;
let lastSummaryData = null;  // SummaryResponse from the API

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format bytes to a human-readable string like "2.4 MB". */
function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Show a brief toast message that auto-dismisses. */
function showToast(message, durationMs = 2800) {
  toast.textContent = message;
  toast.classList.add("toast--visible");
  setTimeout(() => toast.classList.remove("toast--visible"), durationMs);
}

/** Show the error banner with the given message. */
function showError(message) {
  errorMessage.textContent = message;
  errorBanner.hidden = false;
}

/** Hide the error banner. */
function clearError() {
  errorBanner.hidden = true;
  errorMessage.textContent = "";
}

/** Set the Summarise button into loading or idle state. */
function setLoading(isLoading) {
  summariseBtn.disabled  = isLoading || !selectedFile;
  summariseBtn.setAttribute("aria-disabled", String(isLoading || !selectedFile));
  btnLabel.textContent   = isLoading ? "Analysing…" : "Summarise Paper";
  btnSpinner.hidden      = !isLoading;
}

// ── File Handling ─────────────────────────────────────────────────────────────

function handleFile(file) {
  clearError();

  // Client-side validation
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showError("Only PDF files are supported. Please select a .pdf file.");
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    showError(`File is too large (${formatBytes(file.size)}). Maximum allowed size is 10 MB.`);
    return;
  }

  if (file.size === 0) {
    showError("The selected file is empty.");
    return;
  }

  selectedFile = file;

  // Show file info strip
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileInfo.hidden = false;

  // Enable action button
  summariseBtn.disabled = false;
  summariseBtn.removeAttribute("aria-disabled");

  // Hide any previous results
  resultsSection.hidden = true;
  lastSummaryData = null;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  fileInfo.hidden = true;
  fileNameEl.textContent = "";
  fileSizeEl.textContent = "";
  summariseBtn.disabled = true;
  summariseBtn.setAttribute("aria-disabled", "true");
  clearError();
}

// ── Drop Zone Events ──────────────────────────────────────────────────────────

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

dropZone.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", (e) => {
  // Only remove class when leaving the zone itself (not a child element)
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove("drag-over");
  }
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

clearFileBtn.addEventListener("click", clearFile);
dismissErrBtn.addEventListener("click", clearError);

// ── API: Health Check ─────────────────────────────────────────────────────────

async function checkHealth() {
  try {
    const resp = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
    if (resp.ok) {
      apiBadge.className = "badge badge--ok";
      apiBadge.innerHTML = `<span class="badge-dot"></span> API Online`;
    } else {
      throw new Error(`HTTP ${resp.status}`);
    }
  } catch {
    apiBadge.className = "badge badge--error";
    apiBadge.innerHTML = `<span class="badge-dot"></span> API Offline`;
  }
}

// Run immediately, then on a timer.
checkHealth();
setInterval(checkHealth, HEALTH_INTERVAL);

// ── API: Summarise ────────────────────────────────────────────────────────────

async function doSummarise() {
  if (!selectedFile) return;

  clearError();
  setLoading(true);

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const resp = await fetch(`${API_BASE}/api/summarize`, {
      method : "POST",
      body   : formData,
    });

    const data = await resp.json();

    if (!resp.ok) {
      // FastAPI returns { "detail": "..." } for 4xx / 5xx errors.
      const detail = data.detail || `Server error (HTTP ${resp.status})`;
      showError(detail);
      return;
    }

    // Success — render results.
    renderResults(data);

  } catch (err) {
    showError(
      "Could not connect to the API server. " +
      "Make sure the backend is running on http://127.0.0.1:8000."
    );
    console.error("Summarise fetch error:", err);
  } finally {
    setLoading(false);
  }
}

summariseBtn.addEventListener("click", doSummarise);

// ── Render Results ────────────────────────────────────────────────────────────

function renderResults(data) {
  lastSummaryData = data;

  // Meta pills
  metaFilename.textContent = `📄 ${data.filename}`;
  metaPages.textContent    = `${data.pages} page${data.pages !== 1 ? "s" : ""}`;
  metaTime.textContent     = `⏱ ${data.processing_time_s.toFixed(2)} s`;

  // Determine if we got a real LLM response or a mock.
  // The backend doesn't explicitly flag this, so we infer from timing: real
  // LLM calls take > ~1 s, mocks are instant.  We add a soft heuristic.
  const isMock = data.processing_time_s < 0.5;
  if (isMock) {
    metaMode.className    = "pill pill--mode-mock";
    metaMode.textContent  = "⚠ Demo Mode (mock)";
  } else {
    metaMode.className    = "pill pill--mode-live";
    metaMode.textContent  = "✓ Live LLM";
  }

  // Populate the four summary cards
  cardBodies.core_problem.textContent = data.summary.core_problem;
  cardBodies.methodology.textContent  = data.summary.methodology;
  cardBodies.key_findings.textContent = data.summary.key_findings;
  cardBodies.limitations.textContent  = data.summary.limitations;

  // Reveal results section
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── New Upload ────────────────────────────────────────────────────────────────

newUploadBtn.addEventListener("click", () => {
  clearFile();
  resultsSection.hidden = true;
  lastSummaryData = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ── Copy Markdown ─────────────────────────────────────────────────────────────

function buildMarkdown(data) {
  const s = data.summary;
  return [
    `# Summary: ${data.filename}`,
    ``,
    `**Pages:** ${data.pages} | **Processing time:** ${data.processing_time_s.toFixed(2)} s`,
    ``,
    `---`,
    ``,
    `## 🔍 Core Problem`,
    ``,
    s.core_problem,
    ``,
    `## ⚙ Methodology`,
    ``,
    s.methodology,
    ``,
    `## ✨ Key Findings`,
    ``,
    s.key_findings,
    ``,
    `## ⚑ Limitations`,
    ``,
    s.limitations,
    ``,
    `---`,
    `*Generated by ResearchLens AI Paper Summarizer*`,
  ].join("\n");
}

copyBtn.addEventListener("click", async () => {
  if (!lastSummaryData) return;

  const md = buildMarkdown(lastSummaryData);
  try {
    await navigator.clipboard.writeText(md);
    showToast("✓ Copied to clipboard!");
  } catch {
    // Clipboard API not available in non-secure context — fallback.
    const ta = document.createElement("textarea");
    ta.value = md;
    ta.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("✓ Copied to clipboard!");
  }
});

// ── Download .txt ─────────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", () => {
  if (!lastSummaryData) return;

  const content = buildMarkdown(lastSummaryData);
  const blob    = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url     = URL.createObjectURL(blob);

  // Derive a sensible filename from the original PDF name.
  const baseName = lastSummaryData.filename.replace(/\.pdf$/i, "");
  const outName  = `${baseName}_summary.txt`;

  const anchor = document.createElement("a");
  anchor.href     = url;
  anchor.download = outName;
  anchor.click();

  // Clean up the object URL after a short delay.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast(`↓ Downloading "${outName}"`);
});
