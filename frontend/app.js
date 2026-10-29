/**
 * app.js — ResearchLens frontend logic
 *
 * Responsibilities:
 *  - Health-check polling to update the API status badge
 *  - Drag-and-drop + click-to-upload file handling
 *  - File validation (type, size) on the client side
 *  - POST /api/summarize via Fetch API with FormData
 *  - Populating the four summary node cards from the JSON response
 *  - Drawing animated SVG arrows between node cards
 *  - Upload-zone transitions to bottom strip when results appear
 *  - "Copy Markdown" and "Download .txt" utility actions
 *  - Toast notification system
 */

"use strict";

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE        = "";               // same origin
const MAX_FILE_BYTES  = 10 * 1024 * 1024; // 10 MB
const HEALTH_INTERVAL = 30_000;           // 30 s

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
const nodeSvg        = document.getElementById("node-svg");
const nodeGrid       = document.getElementById("node-grid");
const toast          = document.getElementById("toast");

// Card body elements — IDs match the HTML
const cardBodies = {
  core_problem : document.getElementById("card-problem-body"),
  methodology  : document.getElementById("card-method-body"),
  key_findings : document.getElementById("card-findings-body"),
  limitations  : document.getElementById("card-limits-body"),
};

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFile    = null;
let lastSummaryData = null;

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Format bytes → human-readable string. */
function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Brief toast that auto-dismisses. */
function showToast(message, ms = 2800) {
  toast.textContent = message;
  toast.classList.add("toast--visible");
  setTimeout(() => toast.classList.remove("toast--visible"), ms);
}

/** Show the error banner. */
function showError(message) {
  errorMessage.textContent = message;
  errorBanner.hidden = false;
}

/** Hide the error banner. */
function clearError() {
  errorBanner.hidden = true;
  errorMessage.textContent = "";
}

/** Toggle loading state on the summarise button. */
function setLoading(isLoading) {
  summariseBtn.disabled = isLoading || !selectedFile;
  summariseBtn.setAttribute("aria-disabled", String(isLoading || !selectedFile));
  btnLabel.textContent = isLoading ? "Analysing…" : "Summarise Paper";
  btnSpinner.hidden    = !isLoading;
}

// ── File Handling ─────────────────────────────────────────────────────────────

function handleFile(file) {
  clearError();

  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showError("Only PDF files are accepted. Please select a .pdf file.");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showError(`File too large (${formatBytes(file.size)}). Maximum is 10 MB.`);
    return;
  }
  if (file.size === 0) {
    showError("The selected file appears to be empty.");
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileInfo.hidden = false;

  summariseBtn.disabled = false;
  summariseBtn.removeAttribute("aria-disabled");
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
  if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
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
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
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
      const detail = data.detail || `Server error (HTTP ${resp.status})`;
      showError(detail);
      return;
    }

    renderResults(data);

  } catch (err) {
    showError("Unable to reach the analysis server. Ensure the backend is running.");
    console.error("Summarise error:", err);
  } finally {
    setLoading(false);
  }
}

summariseBtn.addEventListener("click", doSummarise);

// ── Render Results ────────────────────────────────────────────────────────────

function renderResults(data) {
  lastSummaryData = data;

  // Populate meta pills
  metaFilename.textContent = `📄 ${data.filename}`;
  metaPages.textContent    = `${data.pages} page${data.pages !== 1 ? "s" : ""}`;
  metaTime.textContent     = `⏱ ${data.processing_time_s.toFixed(2)} s`;

  const isMock = data.processing_time_s < 0.5;
  metaMode.className   = isMock ? "rpill rpill--mode-mock" : "rpill rpill--mode-live";
  metaMode.textContent = isMock ? "⚠ Demo Mode" : "✓ Live";

  // Populate node card bodies
  cardBodies.core_problem.textContent = data.summary.core_problem;
  cardBodies.methodology.textContent  = data.summary.methodology;
  cardBodies.key_findings.textContent = data.summary.key_findings;
  cardBodies.limitations.textContent  = data.summary.limitations;

  // Show results section — CSS flex handles layout shift
  resultsSection.hidden = false;

  // Transition upload zone to bottom strip
  document.body.classList.add("has-results");

  // Draw animated node arrows after layout settles
  requestAnimationFrame(() => requestAnimationFrame(drawNodeArrows));
}

// ── Node Arrow Drawing ────────────────────────────────────────────────────────
/**
 * Draws animated bezier-curve arrows between the four node cards in the SVG
 * overlay. Called after results are rendered and DOM has laid out.
 *
 * Flow:
 *   Core Problem (01) ──→ Methodology   (02)
 *        │                     │
 *        ↓                     ↓
 *   Key Findings (03) ──→ Limitations  (04)
 */
function drawNodeArrows() {
  if (!nodeSvg || !nodeGrid) return;

  nodeSvg.innerHTML = ""; // clear previous

  const gridRect = nodeGrid.getBoundingClientRect();
  if (gridRect.width === 0) return; // not yet laid out

  // viewBox matches grid's pixel dimensions
  nodeSvg.setAttribute("viewBox", `0 0 ${gridRect.width} ${gridRect.height}`);

  /** Returns card edges relative to nodeGrid's top-left. */
  function rel(el) {
    const r = el.getBoundingClientRect();
    return {
      top   : r.top    - gridRect.top,
      left  : r.left   - gridRect.left,
      right : r.right  - gridRect.left,
      bottom: r.bottom - gridRect.top,
      cx    : (r.left  + r.right)  / 2 - gridRect.left,
      cy    : (r.top   + r.bottom) / 2 - gridRect.top,
    };
  }

  const p = rel(document.getElementById("card-problem"));
  const m = rel(document.getElementById("card-method"));
  const f = rel(document.getElementById("card-findings"));
  const l = rel(document.getElementById("card-limits"));

  // ── SVG defs: two arrowhead markers ──────────────────────────
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="ah-air" markerWidth="9" markerHeight="7"
            refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#508AA8" />
    </marker>
    <marker id="ah-baby" markerWidth="9" markerHeight="7"
            refX="8" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#9DD1F1" />
    </marker>
  `;
  nodeSvg.appendChild(defs);

  // Connection definitions
  // Each: { x1, y1, x2, y2, dir:'h'|'v', color, markerId }
  const GAP = 6; // px buffer so arrow doesn't overlap card border
  const connections = [
    // Core Problem → Methodology  (horizontal, top row)
    {
      x1: p.right + GAP, y1: p.cy,
      x2: m.left  - GAP, y2: m.cy,
      dir: "h", color: "#508AA8", marker: "ah-air",
    },
    // Core Problem → Key Findings (vertical, left col)
    {
      x1: p.cx, y1: p.bottom + GAP,
      x2: f.cx, y2: f.top    - GAP,
      dir: "v", color: "#9DD1F1", marker: "ah-baby",
    },
    // Methodology → Limitations   (vertical, right col)
    {
      x1: m.cx, y1: m.bottom + GAP,
      x2: l.cx, y2: l.top    - GAP,
      dir: "v", color: "#508AA8", marker: "ah-air",
    },
    // Key Findings → Limitations  (horizontal, bottom row)
    {
      x1: f.right + GAP, y1: f.cy,
      x2: l.left  - GAP, y2: l.cy,
      dir: "h", color: "#9DD1F1", marker: "ah-baby",
    },
  ];

  connections.forEach((c, i) => {
    const mx = (c.x1 + c.x2) / 2;
    const my = (c.y1 + c.y2) / 2;

    // Cubic bezier — curves gently through the gap
    const d = c.dir === "h"
      ? `M ${c.x1} ${c.y1} C ${mx} ${c.y1}, ${mx} ${c.y2}, ${c.x2} ${c.y2}`
      : `M ${c.x1} ${c.y1} C ${c.x1} ${my}, ${c.x2} ${my}, ${c.x2} ${c.y2}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", c.color);
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("marker-end", `url(#${c.marker})`);
    path.setAttribute("opacity", "0.65");
    path.classList.add("node-path");

    // Append first so getTotalLength() is available
    nodeSvg.appendChild(path);

    // Draw-on animation via stroke-dasharray/offset
    const len = path.getTotalLength();
    path.style.strokeDasharray  = len;
    path.style.strokeDashoffset = len;
    path.style.transition = `stroke-dashoffset 0.55s cubic-bezier(0.16,1,0.3,1) ${0.35 + i * 0.18}s,
                              opacity 0.3s ease ${0.35 + i * 0.18}s`;
    // Trigger the transition on next frame
    requestAnimationFrame(() => {
      path.style.strokeDashoffset = "0";
    });
  });
}

// ── New Upload ────────────────────────────────────────────────────────────────

newUploadBtn.addEventListener("click", () => {
  clearFile();
  resultsSection.hidden = true;
  lastSummaryData = null;
  document.body.classList.remove("has-results");

  // Wipe arrows
  if (nodeSvg) nodeSvg.innerHTML = "";

  // Clear card bodies
  Object.values(cardBodies).forEach(el => { el.textContent = ""; });
  metaFilename.textContent = "";
  metaPages.textContent    = "";
  metaTime.textContent     = "";
  metaMode.textContent     = "";
});

// ── Copy Markdown ─────────────────────────────────────────────────────────────

function buildMarkdown(data) {
  const s = data.summary;
  return [
    `# ResearchLens Analysis: ${data.filename}`,
    ``,
    `**Pages:** ${data.pages} | **Processing time:** ${data.processing_time_s.toFixed(2)} s`,
    ``,
    `---`,
    ``,
    `## 01 — Core Problem`,
    ``,
    s.core_problem,
    ``,
    `## 02 — Methodology`,
    ``,
    s.methodology,
    ``,
    `## 03 — Key Findings`,
    ``,
    s.key_findings,
    ``,
    `## 04 — Limitations`,
    ``,
    s.limitations,
    ``,
    `---`,
    `*Generated by ResearchLens*`,
  ].join("\n");
}

copyBtn.addEventListener("click", async () => {
  if (!lastSummaryData) return;
  const md = buildMarkdown(lastSummaryData);
  try {
    await navigator.clipboard.writeText(md);
    showToast("✓ Copied to clipboard");
  } catch {
    // Fallback for non-secure contexts
    const ta = document.createElement("textarea");
    ta.value = md;
    ta.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("✓ Copied to clipboard");
  }
});

// ── Download .txt ─────────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", () => {
  if (!lastSummaryData) return;

  const content  = buildMarkdown(lastSummaryData);
  const blob     = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url      = URL.createObjectURL(blob);
  const baseName = lastSummaryData.filename.replace(/\.pdf$/i, "");
  const outName  = `${baseName}_analysis.txt`;

  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = outName; anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast(`↓ Downloading "${outName}"`);
});
