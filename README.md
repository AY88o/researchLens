# ResearchLens: AI-Powered Text Summarizer for Research Papers

A decoupled, lightweight web application designed to automatically parse, clean, and generate structured four-section abstractive summaries from academic research papers in PDF format.

Built to run efficiently on standard consumer hardware (4 GB+ RAM, no GPU required) using a Python FastAPI backend and a responsive Vanilla JavaScript dashboard.

---

## 📌 Features

- **Document-Aware PDF Sanitization**: Automatically strips repetitive page headers, publisher footers, standalone page numbering, line-wrap hyphens, and extensive bibliography/reference lists using rule-based algorithms.
- **Deterministic 4-Section Output**: Enforces structured extraction validated against strict Pydantic schemas:
  1. **Core Problem**: The primary challenge addressed by the authors.
  2. **Methodology**: Technical approach, architecture, or formulation.
  3. **Key Findings**: Empirical results, benchmark metrics, and observations.
  4. **Limitations**: Stated constraints, edge cases, and missing evaluations.
- **Decoupled Architecture**: Fully separated REST API (`FastAPI`) and lightweight static frontend (`HTML5/CSS3/Vanilla JS`).
- **Interactive API Documentation**: Built-in Swagger UI explorer available at `/docs`.
- **Export Utilities**: One-click clipboard copy and formatted `.txt` download.
- **Graceful Error Handling & Fallback**: Handles unreadable/scanned PDFs, empty files, size restrictions, and network timeouts defensively.

---

## 📂 Project Structure

```text
researchLens/
├── backend/
│   ├── __init__.py
│   ├── config.py         # Configuration constants & environment loader
│   ├── llm_client.py     # Asynchronous HTTP client & prompt engineering
│   ├── main.py           # FastAPI server, route definitions & static mount
│   ├── parser.py         # PDF text extraction and rule-based cleaning
│   └── schemas.py        # Pydantic data validation models
├── frontend/
│   ├── app.js            # Upload listeners, API fetch, card rendering & export
│   ├── index.html        # Clean semantic dashboard layout
│   └── style.css         # Modern, responsive styling (grid/flexbox)
├── .env.example          # Environment variable template
├── .gitignore
├── requirements.txt      # Python package dependencies
└── README.md
```

---

## ⚙️ Prerequisites

- **Python**: Version `3.10` or higher (`3.10` – `3.12` recommended)
- **Package Manager**: `pip`
- **Modern Web Browser**: Google Chrome, Mozilla Firefox, Microsoft Edge, or Safari
- **API Key**: An API key from an OpenAI-compatible hosted provider (e.g., [GroqCloud](https://console.groq.com/) for fast free-tier inference, or OpenAI).

---

## 🚀 Quick Start Guide

### 1. Clone or Extract the Project
Open a terminal in the folder where the project is stored:
```bash
cd researchLens
```

### 2. Set Up a Python Virtual Environment
Always create a clean, local virtual environment to avoid OS package manager restrictions (PEP 668):

- **Linux / macOS:**
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

- **Windows (Command Prompt):**
  ```cmd
  python -m venv venv
  venv\Scripts\activate.bat
  ```

- **Windows (PowerShell):**
  ```powershell
  python -m venv venv
  .\venv\Scripts\Activate.ps1
  ```
*(Note: In PowerShell, if execution is restricted, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` once).*

### 3. Install Dependencies
Install all required dependencies inside the active virtual environment:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a `.env` file in the project root directory:

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in your model provider details:
```ini
# LLM Inference Configuration
API_URL=https://api.groq.com/openai/v1/chat/completions
API_KEY=gsk_your_groq_api_key_here
MODEL=llama-3.1-8b-instant
```

---

## 🖥️ Running the Application

### Option A: From the Project Root (Recommended)

Run Uvicorn with the `backend` directory included in the Python module search path:

- **Linux / macOS:**
  ```bash
  PYTHONPATH=backend uvicorn backend.main:app --reload --port 8000
  ```

- **Windows (PowerShell):**
  ```powershell
  $env:PYTHONPATH="backend"; uvicorn backend.main:app --reload --port 8000
  ```

- **Windows (CMD):**
  ```cmd
  set PYTHONPATH=backend && uvicorn backend.main:app --reload --port 8000
  ```

### Option B: From Inside the `backend/` Folder

Alternatively, navigate into `backend/` and run Uvicorn directly:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

---

## 🌐 Accessing the Application

Once the server prints `Application startup complete`:

- **Web Dashboard**: Open your browser to [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive API Documentation**: Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health Check Endpoint**: Test status via [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

## 📡 API Specification

| Method | Endpoint | Description | Content-Type |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Verifies server operational status | `application/json` |
| `POST` | `/api/summarize` | Uploads a PDF, sanitizes text, and generates summary | `multipart/form-data` |
| `GET` | `/docs` | OpenAPI / Swagger interactive documentation | `text/html` |

### Sample `POST /api/summarize` Request (cURL)
```bash
curl -X POST "http://127.0.0.1:8000/api/summarize" \
     -H "accept: application/json" \
     -F "file=@sample_paper.pdf;type=application/pdf"
```

### Sample Successful Response (JSON)
```json
{
  "filename": "sample_paper.pdf",
  "pages": 11,
  "summary": {
    "core_problem": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
    "methodology": "The proposed Transformer model relies entirely on an attention mechanism to draw global dependencies between input and output...",
    "key_findings": "On the WMT 2014 English-to-German translation task, the model achieves 28.4 BLEU, outperforming existing models by over 2 BLEU...",
    "limitations": "The self-attention complexity scales quadratically with sequence length, making training on extremely long contexts computationally costly."
  },
  "processing_time_s": 3.82
}
```

---

## 🔧 Common Troubleshooting & FAQ

#### 1. `bad interpreter: No such file or directory`
This occurs if the project directory was moved or renamed after creating `venv`. Virtual environments have fixed paths.
**Fix**:
```bash
deactivate
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 2. `error: externally-managed-environment` (Arch Linux / Debian 12+)
This occurs when running `pip install` against system Python rather than an active virtual environment.
**Fix**: Ensure your virtual environment is active (your prompt will show `(venv)`) before running `pip install`.

#### 3. HTTP 422: "No readable text found (scanned PDF?)"
The document does not have an embedded text layer (e.g., scanned image or photograph of a book). The system uses `pypdf` which extracts digital text layers and does not perform OCR.

#### 4. Frontend shows CORS errors during local development
If you open `frontend/index.html` via `file://` or a separate port (like Live Server on port 5500), CORS middleware is enabled by default in `main.py` (`allow_origins=["*"]`). For the best experience, access the frontend through `http://127.0.0.1:8000/` as mounted by FastAPI.

---

## 📄 License & Attribution

Developed as an academic Mini Project for **B.Tech Computer Science & Engineering (AIML)**, Lloyd Institute of Engineering & Technology (Affiliated with Dr. A.P.J. Abdul Kalam Technical University, Lucknow).