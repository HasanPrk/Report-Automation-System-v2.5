# Smart Report Automation System

> A local, AI-assisted reporting workstation that turns messy spreadsheets into structured, presentation-ready reports in a single end-to-end workflow — from data import and quality profiling to interactive charts, AI-drafted narrative, and PDF / DOCX / HTML / Markdown export.

---

## Badges

![Version](https://img.shields.io/badge/version-2.5.0-2f6fed)
![Python](https://img.shields.io/badge/python-3.8%2B-3776AB?logo=python&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-4A5568)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![Status](https://img.shields.io/badge/status-personal%20project-orange)


---

## Project Overview

**Smart Report Automation System** is a desktop-style web application that consolidates the entire data-reporting workflow into a single, browser-based workstation. Instead of bouncing between Excel, a charting tool, a Word document, and a PDF printer — and repeating that loop for every report — you move through nine connected stages in one place, with the AI acting as a drafting assistant rather than a replacement for human judgment.

The application runs entirely on your own machine. A tiny Python server (standard library only — no `pip install` required) hosts the static frontend and a small local API that handles user accounts and securely proxies AI requests. All data processing happens in the browser; no spreadsheet content ever leaves your computer.

This is a personal project, built to solve a real, recurring pain point in analytics work. It is shared here as a portfolio piece rather than as a commercial product.

---

## The Problem

After every data analysis engagement, the findings need to be packaged into a structured report: KPIs, charts, narrative sections, methodology notes, and recommendations. Doing this by hand is slow and repetitive:

- Open the cleaned dataset in a spreadsheet.
- Build the same set of charts again, export each one as an image, paste it into the document.
- Write the narrative from scratch, retyping the numbers and double-checking they match the data.
- Apply branding (logo, colors, classification label, header/footer).
- Export to PDF and ship.

In practice, this stage routinely consumes **around 60 minutes or more per report**, and most of that time is spent on mechanical, low-value work: re-formatting tables, re-aligning charts, re-typing numbers, and re-applying the same template. The cognitive part — deciding what the data means — gets a fraction of the time it deserves.

---

## The Solution

This project collapses the post-analysis reporting stage into a single guided workflow. You import the data once, the system profiles it and helps you clean it, you build the charts interactively, the AI drafts a first version of the narrative, you edit and finalize it, and you export to your target format — all without leaving the application.

Three design decisions make this different from a generic "AI report generator":

1. **The AI drafts; the human decides.** The system never publishes AI text on its own. Every section is editable, rejectable, and reorderable. A full **manual mode** lets you write everything by hand with the AI completely turned off.
2. **Numbers are never invented.** The AI prompt explicitly instructs the model to use exact figures from the data and to refuse to fabricate numbers. Charts and KPIs are computed from the actual dataset, not from model hallucinations.
3. **Everything is local.** The server binds to `127.0.0.1` only. Your data, your API key, your account database — all stay on your machine. No cloud account, no telemetry, no third-party service requirement.

---

## Key Features

### Data Import & Integration
- Import from **XLSX**, **CSV**, **Google Sheets links**, or pasted text.
- Automatic **multi-sheet and multi-table detection** inside each Excel sheet (tables separated by fully empty rows/columns are recognized as distinct).
- Power Query-style **Append** and **column-picker Join** between tables, with key columns preserved and a live preview of the merged output.

### Data Quality Assessment
- A **10-check profiler** covering structural issues, missing values, type consistency, invalid dates, numeric range and outliers, whitespace and categories, cross-column consistency, duplicates, and an overall summary.
- A **6-stage quality journey** with a transparent quality score, so issues are surfaced before they reach the report.

### Cleaning & Duplicates
- Each cleaning operation goes through **preview → confirm → apply → undoable**, with per-cell manual overrides for any value the rule missed.
- **Applied Steps navigation** (Power Query-style): every operation is a step with a snapshot; jump back to any step, delete it, and continue from there.
- A dedicated **duplicate manager** for grouping, picking a retention policy, and applying it — all undoable.
- Global **Undo/Redo** (up to 30 steps across all sections), with a safety boundary so undo can never cross past the data-import step and silently wipe the active dataset.

### Calculations & KPIs
- A calculation engine supporting **count, distinct, sum, mean, median, min, max, groupSum, groupMean, periodCompare, periodCount, pctFiltered, countFiltered**.
- KPIs can be defined visually or via a JSON spec file (see `samples/custom-template-calcs.json`).

### Interactive Chart Studio
- Built on **Chart.js 4.4.4** (vendored) plus a custom pure-SVG chart library for **infographic, treemap, heatmap, gauge, and textbox** visuals.
- **Slicer engine** for cross-chart filtering (Excel-style) with include/exclude rules per chart.
- **Drill-down** for every categorical chart, with breadcrumb navigation back to the top level.
- **Iran choropleth map** with real province borders (GeoJSON from geoBoundaries) and drill-down to all 478 counties using OSM county centroids — without an internet connection.
- Per-chart settings: title, axis labels, legend position, data label position, color palettes (corporate blue, calm green, modern purple, formal gray, or custom).

### AI-Powered Report Generation
- Three modes:
  - **Demo** — rule-based mock generation for offline preview.
  - **Manual (AI off)** — AI controls disabled; the template skeleton is built immediately so you can write and edit from the start.
  - **Live** — real connection to an OpenAI-compatible or Anthropic-compatible endpoint.
- The AI proxy runs **server-side**, so the request is same-origin with the app and never hits browser CORS restrictions. The API key is never returned to the browser.
- Supports **OpenAI, OpenRouter, Anthropic, AvalAI, Groq, DeepSeek, and local Ollama**. The endpoint is auto-normalized (a base URL like `https://api.openai.com/v1` is completed to `/chat/completions`).
- A **Test Connection** button validates the saved key with a minimal ping request.
- The user retains **full final control**: every AI-drafted section can be edited, regenerated, rejected, reordered, or replaced with manual text.

### Templates & Branding
- Two built-in report templates plus **custom HTML templates** with `{{placeholder}}` syntax and a JSON calc-spec file.
- Reports can be **Persian (RTL) or English (LTR)** with real bidirectional layout.
- Upload a **logo** and **color palette**, set a **classification label** (Public / Internal / Confidential), and define report metadata (title, organization, period, author).

### Preview & Export
- Live preview with a **secondary ribbon** for page size, orientation, margins, page breaks, zoom, and quick export — placed exactly above the preview area, never on top of the report.
- Separate **Persian and English font** selection.
- Export to **PDF** (via the browser's print dialog, with aligned headers/footers), **DOCX** (HTML-in-Word), **standalone HTML**, and **Markdown**.
- Side outputs: cleaned data as **XLSX** or **CSV**, and transfer to **Google Sheets**.

### Accounts & API Key Vault (Optional)
- Local **SQLite account system** with email + password registration, OTP-based email verification, recovery codes, and account lockout after repeated failed logins.
- The AI API key is **encrypted server-side** (HMAC-CTR with encrypt-then-MAC, standard library only) and stored separately from the database. Only a masked hint (e.g. `sk-…1223`) is ever returned to the browser.
- SMTP is **optional** — without it, the OTP is shown transparently in the UI (clearly labeled "local mode"), suitable for a single-user personal system.

### Quality-of-Life
- Light and **dark themes**.
- **Backup** of data and reports.
- **Report history** panel.
- **Global search** across all sections and capabilities.
- Fully **offline-capable** for the core data and charting workflow.

---

## End-to-End Workflow

The application is organized as a single 9-step journey, navigated from one rail on the right (or a horizontal bar on mobile). The old top/bottom navigation bars have been removed to keep the journey unambiguous.

```
1. Import Data      →  XLSX, CSV, Google Sheets, pasted text; multi-sheet/multi-table; Append + Join
2. Quality Check    →  10-check profiler, 6-stage journey, transparent quality score
3. Clean & Dedupe   →  Power Query-style applied steps, per-cell manual edits, undoable
4. Report Template  →  Built-in or custom HTML template; Persian/English with real RTL/LTR
5. Calculations     →  KPIs and grouped/period comparisons; visual or JSON spec
6. Chart Studio     →  Chart.js + custom SVG; Slicer; drill-down; Iran choropleth
7. Generate Report  →  AI draft (or full manual mode); edit, regenerate, reject, reorder
8. Preview          →  Page size, margins, labels, fonts, logo, palette; light/dark
9. Export           →  PDF, DOCX, HTML, Markdown; side outputs: cleaned XLSX/CSV, Google Sheets
```

Each step shows a real status indicator based on actual data state — not just "visited". You can jump between steps freely from the journey rail; the system tracks what's actually complete.

---

## Before vs. After

| Stage | Before (manual) | After (with this tool) |
|---|---|---|
| Data preparation | Spreadsheet, hand-merge, hand-clean | Guided profiler + Power Query-style steps |
| Charts | Build, export image, paste, repeat | Interactive studio, Slicer, drill-down |
| Narrative | Type from scratch, retype numbers | AI draft + full manual override |
| Branding | Apply template per report | Template + logo + palette + label, persistent |
| Export | Manual layout, PDF print | One guided preview, multiple formats |

---

## Reported Productivity Improvement

Based on my initial experience using the tool on my own reporting tasks:

| Metric | Value |
|---|---|
| Time per report — before | ~60 minutes |
| Time per report — after | ~10 minutes |
| Time saved per report | ~50 minutes |
| Relative reduction | ~83.3% |
| Speed multiplier | ~6× |

> ⚠️ **Important context.** These numbers are **My-reported** from personal use, not the result of an independent, controlled benchmark. They are shared to give a concrete sense of the intended impact of the tool, not to make a verifiable performance claim. A formal measurement under controlled conditions was not performed.

No claims are made about financial impact, revenue lift, customer satisfaction, or error-rate reduction — there is no data to support those, and the project does not invent any.

---

## Skills Demonstrated Through This Project


### Data Analytics & Data Preparation

| Skill | Where it shows up |
|---|---|
| Data Import and Integration | `assets/js/30-data-importer.js`, `28-table-detector.js`, `29-join-engine.js` |
| Data Cleaning and Data Quality Assessment | `assets/js/40-data-profiler.js` (10 checks, 6 stages), `50-data-cleaner.js`, `60-duplicate-manager.js` |
| Data Transformation | `29-join-engine.js` (Power Query-style column-picker Join), `50-data-cleaner.js` (applied-steps model with snapshots) |
| Table Appending and Joining | `29-join-engine.js`, with key-column preservation and live preview |
| KPI Calculation | `assets/js/80-calculation-engine.js` (sum, mean, median, groupSum, periodCompare, pctFiltered, …) |
| Data Visualization | `45-chart-builder.js`, `46-custom-charts.js`, `47-iran-map.js` |
| Analytical Workflow Design | `25-workflow-manager.js`, `20-app-state.js` — the 9-step journey with real status tracking |

### AI & Prompt Engineering

| Skill | Where it shows up |
|---|---|
| Prompt Engineering | `assets/js/90-ai-service.js` — explicit system prompt that forbids invented numbers, supports Persian/English, and accepts user customization |
| Using LLMs for structured content generation | Live AI draft → editable sections; rejectable, reorderable, regeneratable |
| Designing AI-assisted report generation workflows | The 3-mode design (demo / manual / live) and the human-in-the-loop editing layer |
| Designing human–AI interaction for content refinement | Per-section regenerate/reject/edit controls; AI never auto-publishes |
| Using Agent Mode during development | The project was built with the **GLM 5.3 Flash Agent Mode** as the development assistant |
| Managing and constraining AI output | Prompt rules (no fabricated numbers, exact-figure adherence), server-side proxy, key vault |

### Software & Workflow Design

| Skill | Where it shows up |
|---|---|
| Workflow Automation | The entire 9-step journey replaces a multi-tool manual process |
| End-to-End Process Design | One repo, one server, one journey — from raw file to exported report |
| User-Centered Design | Light/dark themes, secondary preview ribbon, journey rail, search, undo/redo, transparent "local mode" notice |
| Interactive Wizard Design | Join dialog (`107-ui-join.js`), cleaning operations (preview → confirm → apply), template manager |
| Report Generation Workflow | `70-template-manager.js`, `95-report-renderer.js`, `90-ai-service.js` |
| Export and Document Formatting | `97-pdf-exporter.js` — PDF, DOCX, HTML, Markdown, copy-text |
| Feature Integration | The state layer in `20-app-state.js` ties import → clean → calc → chart → report → preview → export into one reactive flow |

### Product Thinking & Problem Solving

| Skill | Where it shows up |
|---|---|
| Identifying and analyzing a real problem | The 60→10 minute framing above, derived from personal analytics experience |
| Designing solutions based on user need | "AI drafts, human decides" — avoids the failure mode of unsupervised AI text |
| Translating requirements into software features | The 9-step journey mirrors the actual stages a report goes through |
| Reducing manual, repetitive activity | Applied-steps cleaning, template persistence, one-click multi-format export |
| Improving process productivity | The reported ~83% time reduction per report |
| UX design for a multi-step workflow | Journey rail with real status, secondary ribbon for preview-only controls, transparent local mode |

### Technical Skills

The list below distinguishes skills **demonstrated in the project** (verifiable in the code), skills **applied during development** (real but behind the scenes), and skills that are **potential next steps** (suggestions, not claimed experience).

#### Demonstrated in the Project

| Skill | Evidence |
|---|---|
| Vanilla JavaScript (ES2020+, modular IIFE pattern) | All `assets/js/*.js` modules — no framework, no build step |
| Python 3 standard library (`http.server`, `sqlite3`, `hashlib`, `hmac`, `secrets`, `smtplib`) | `run.py`, `appserver.py` — no `pip install` required |
| SQLite schema design and parameterized queries | `appserver.py` (`init_db`, `q()`) — users, sessions, OTPs, API keys |
| Password hashing with scrypt + constant-time compare | `appserver.py` (`hash_password`, `verify_password`) |
| Authenticated encryption (HMAC-CTR, encrypt-then-MAC) | `appserver.py` (`encrypt_secret`, `decrypt_secret`) — stdlib only |
| Session management and CSRF protection | `appserver.py` (token_urlsafe cookies, `X-Requested-With` header, SameSite=Lax) |
| Rate limiting (sliding-window in-memory) | `appserver.py` (`rate_limit`) |
| Chart.js integration and custom SVG charting | `45-chart-builder.js`, `46-custom-charts.js` |
| SheetJS / XLSX parsing | `vendor/xlsx.full.min.js` + `30-data-importer.js` |
| GeoJSON / choropleth rendering | `47-iran-geo-data.js`, `47-iran-map.js` |
| Multi-format document export | `97-pdf-exporter.js` (PDF via print, DOCX via HTML-in-Word, HTML, Markdown) |

#### Applied During Development

| Skill | How it was used |
|---|---|
| Prompt Engineering (development-time) | Used to drive the **GLM 5.3 Flash Agent Mode** that built the modules above |
| AI-assisted development workflow | Iterative, agent-mode code generation, then human review and integration |
| Working without an external dependency manager | The project intentionally uses only Python stdlib and vendored JS — no `pip` or `npm` step |


---

## Technology Stack

### Runtime
- **Python 3.8+** (standard library only — no `pip install` step)
- **Any modern browser** (Chrome, Edge, Firefox, Safari)

### Frontend
- Vanilla JavaScript (ES2020+), modular IIFE pattern, no framework, no bundler
- **Chart.js 4.4.4** (vendored at `vendor/chart.umd.min.js`, with CDN fallback)
- **SheetJS / xlsx 0.18.5** (vendored at `vendor/xlsx.full.min.js`, with CDN fallback)
- Custom pure-SVG chart library (`assets/js/46-custom-charts.js`)
- **Vazirmatn FD** web font (woff2, locally hosted at `assets/fonts/`)
- Hand-written CSS with light and dark themes (`assets/css/styles.css`)

### Backend (local server only)
- Python `http.server.ThreadingHTTPServer` for static files + API
- `sqlite3` for the local account database (`data/app.db`)
- `hashlib.scrypt` for password hashing
- `hmac` + `secrets` for OTP hashing, session tokens, and authenticated encryption
- `smtplib` (optional, environment-configured) for real email OTP delivery
- `urllib.request` for the server-side AI proxy

### AI provider support
- OpenAI-compatible Chat Completions API (OpenAI, OpenRouter, AvalAI, Groq, DeepSeek, local Ollama)
- Anthropic Messages API (auto-detected)
- This project was developed using **GLM 5.3 Flash** in Agent Mode.

### Project metadata
- **Version:** 2.5.0
- **No `package.json`, no `requirements.txt`** — by design. The project is dependency-free at runtime.

---

## System Architecture

```
report-automation-system/
├── index.html                  ← Application entry point
├── run.py                      ← Local server: static files + API (binds 127.0.0.1)
├── appserver.py                ← API layer: SQLite auth + AI proxy (stdlib only)
├── data/                       ← Local database + secrets (gitignored — never publish)
│   ├── app.db                  ← SQLite database (users, sessions, OTPs, API keys)
│   └── secrets/
│       └── master.key          ← Encryption key (file mode 0600, outside the database)
├── assets/
│   ├── css/styles.css          ← Light + dark themes, print styles
│   ├── fonts/                  ← Vazirmatn FD (Regular / Medium / SemiBold / Bold)
│   └── js/                     ← ~30 modules, IIFE pattern, loaded in order
│       ├── 10-utils.js               ← Helpers (escape, deep clone, Jalali today, …)
│       ├── 12-undo-manager.js        ← Global undo/redo (up to 30 steps)
│       ├── 15-ui-kit.js              ← Toast, modal, confirm dialogs
│       ├── 17-filter-engine.js       ← Click-to-filter engine
│       ├── 18-slicer-engine.js       ← Excel-style Slicer (include/exclude per chart)
│       ├── 20-app-state.js           ← Central reactive state (the single source of truth)
│       ├── 25-workflow-manager.js    ← 9-step journey rail + real status
│       ├── 28-table-detector.js      ← Detect multiple tables per sheet
│       ├── 29-join-engine.js         ← Power Query-style Merge/Join with column picker
│       ├── 30-data-importer.js       ← XLSX / CSV / Google Sheets / paste
│       ├── 40-data-profiler.js       ← 10-check profiler, 6-stage journey, quality score
│       ├── 45-chart-builder.js       ← Chart.js integration, palettes, drill-down
│       ├── 46-custom-charts.js       ← Pure-SVG infographic / treemap / heatmap / gauge
│       ├── 47-iran-geo-data.js        ← Real province borders + 478 county centroids
│       ├── 47-iran-map.js             ← Choropleth + drill-down to counties
│       ├── 50-data-cleaner.js        ← Applied-steps cleaning, per-cell manual edits
│       ├── 60-duplicate-manager.js   ← Group, pick retention, apply (undoable)
│       ├── 70-template-manager.js    ← Built-in + custom HTML templates + JSON spec
│       ├── 80-calculation-engine.js   ← KPI and aggregation engine
│       ├── 90-ai-service.js           ← Demo / manual / live AI modes + prompt management
│       ├── 95-report-renderer.js      ← Live preview model, branding, fonts, page settings
│       ├── 97-pdf-exporter.js         ← PDF / DOCX / HTML / Markdown / copy-text
│       ├── 98-backup-manager.js       ← Backup of data and reports
│       ├── 99-ui-main.js              ← Bootstrap / view switching
│       ├── 100-ui-import-quality.js
│       ├── 101-ui-clean.js
│       ├── 102-ui-template-calc.js
│       ├── 103-ui-ai-preview-export.js
│       ├── 104-ui-charts.js
│       ├── 105-ui-shell.js            ← Shell layout, journey rail, header
│       ├── 106-auth.js                ← Local account UI (register, verify, login, key vault)
│       └── 107-ui-join.js             ← Join wizard dialog
├── samples/                    ← Sample data + custom template examples
│   ├── sample-sales-data.csv
│   ├── sample-sales-data.xlsx
│   ├── sample-multi-table.xlsx
│   ├── custom-template-example.html
│   └── custom-template-calcs.json
├── vendor/                     ← Vendored libraries (offline-first)
│   ├── chart.umd.min.js          ← Chart.js 4.4.4
│   └── xlsx.full.min.js          ← SheetJS 0.18.5
├── .gitignore                  ← Excludes data/, *.db, master.key, __pycache__/
├── start.bat                   ← Windows launcher
├── start.sh                    ← Linux/macOS launcher
└── run.py                      ← Server entry point
```

### Request flow

```
Browser (index.html)
   │
   ├── Static assets ────────────►  run.py (ThreadingHTTPServer, 127.0.0.1:8586)
   │                                   └── serves assets/js, assets/css, vendor/, samples/
   │
   ├── /api/auth/* ──────────────►  appserver.py
   │                                   ├── SQLite (users, sessions, OTPs)
   │                                   └── master.key (outside DB, file mode 0600)
   │
   └── /api/ai/chat ─────────────►  appserver.py (AI proxy)
                                        ├── reads encrypted key from vault
                                        ├── decrypts server-side
                                        ├── forwards to OpenAI/Anthropic-compatible endpoint
                                        └── returns content; key never reaches the browser
```

All data processing (import, profiling, cleaning, calculations, charts) happens **in the browser**. The server only handles accounts, the key vault, and the AI proxy.

---

## Screenshots / Demo

> 📌 **Placeholder.** No screenshots or demo recordings are included in this repository yet.
>
> To complete this section, add the following to the repository and update the links below:
>
> - `docs/screenshots/01-import.png` — the data import view with a multi-table Excel file detected.
> - `docs/screenshots/02-quality.png` — the 10-check quality profiler.
> - `docs/screenshots/03-clean.png` — Power Query-style applied-steps navigation.
> - `docs/screenshots/04-charts.png` — the chart studio with a Slicer active.
> - `docs/screenshots/05-iran-map.png` — the Iran choropleth with drill-down to a county.
> - `docs/screenshots/06-ai.png` — AI draft with the editing panel open.
> - `docs/screenshots/07-preview.png` — the preview ribbon with a custom logo and palette.
> - `docs/screenshots/08-export.png` — the export menu.
> - `docs/demo.mp4` — a 60-second end-to-end walkthrough, start to finish.

---

## Installation and Setup

### Prerequisites
- **Python 3.8 or newer** installed on your system. Download from [python.org](https://www.python.org/downloads/) if you don't have it.
- A modern browser (Chrome, Edge, Firefox, or Safari).
- **No package manager step required.** The project uses only the Python standard library and vendored JavaScript files.

### Quick start

1. Clone the repository:
   ```bash
   git clone [https://github.com/HasanPrk/report-automation-system-v2.5]
   cd report-automation-system
   ```

2. Launch the local server using one of the platform-specific scripts:

   | Platform | Command |
   |---|---|
   | Windows | Double-click `start.bat` |
   | Linux / macOS | `./start.sh` |
   | Any platform (manual) | `python run.py` |
   | Custom port | `python run.py --port 8080` |
   | Without auto-opening the browser | `python run.py --no-open` |

3. The application opens automatically in your default browser at `http://127.0.0.1:8586`.

> The default port is **8586**. If that port is busy, the launcher automatically tries the next available port and prints the chosen URL in the terminal.

### Run without the server (limited mode)

You can also double-click `index.html` directly. In this mode:
- All data, cleaning, calculation, and chart features work.
- The local account system, the API key vault, and the server-side AI proxy are **disabled** (the application transparently notifies you of this).
- Live AI mode (without an account) will fall back to direct browser requests, which may fail if the AI provider blocks cross-origin (CORS) requests. For reliable AI access, use `python run.py`.

---

## Configuration and API Key Setup

### Email verification (optional)

By default, the application runs in **local mode**: OTP codes are displayed in the UI, clearly labeled as "local mode". This is fine for a single-user personal system.

To send OTP codes by real email, set the following environment variables before starting the server:

| Variable | Purpose | Default |
|---|---|---|
| `RAS_SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`) | — (unset → local mode) |
| `RAS_SMTP_PORT` | SMTP port | `587` |
| `RAS_SMTP_USER` | SMTP username | — |
| `RAS_SMTP_PASS` | SMTP password or app-specific password | — |
| `RAS_SMTP_FROM` | From address (defaults to `RAS_SMTP_USER`) | — |
| `RAS_SMTP_TLS` | `1` to use STARTTLS (recommended), `0` to skip | `1` |

Example (Linux/macOS):
```bash
RAS_SMTP_HOST=smtp.example.com \
RAS_SMTP_USER=you@example.com \
RAS_SMTP_PASS='your-app-password' \
python run.py
```

### AI provider configuration

The AI provider is configured **inside the application UI** (Step 7 — Generate Report), not via environment variables:

1. Open the app and go to **Account → Settings**.
2. Paste your AI API key. It is encrypted server-side and stored in the local SQLite database. Only a masked hint (e.g. `sk-…1223`) is returned to the browser afterward.
3. In Step 7, choose the AI mode:
   - **Demo** for offline mock generation.
   - **Manual (AI off)** to write everything by hand.
   - **Live** for real AI generation.
4. Enter the **Endpoint** (base URL is fine — e.g. `https://api.openai.com/v1`; the system auto-completes `/chat/completions`) and the **Model** name.
5. Click **Test Connection** to validate the key with a minimal ping request.

Supported providers (any OpenAI-compatible or Anthropic-compatible endpoint):
- OpenAI
- OpenRouter
- Anthropic (auto-detected)
- AvalAI
- Groq
- DeepSeek
- Local Ollama

> The API key is **never** included in browser requests, logs, backups, or API responses. All AI requests are proxied through the local server using the stored, decrypted key.

---

## Usage Guide

A typical end-to-end session looks like this:

1. **Start the server** — `python run.py` (or `start.bat` / `start.sh`).
2. **(Optional) Create an account** — register with email + password, verify with the OTP shown in local mode (or sent by email if SMTP is configured), and store your AI API key in the vault.
3. **Import your data** — drag in an XLSX or CSV file, paste a Google Sheets link, or paste raw text. The system detects sheets and tables; pick the ones you want.
4. **(Optional) Merge tables** — if you have multiple tables, use the Join wizard (Power Query-style column picker) to combine them.
5. **Run the quality profiler** — review the 10 checks across the 6-stage journey. The system shows a transparent quality score.
6. **Clean the data** — apply operations (trim, normalize, fix dates, deduplicate). Each operation is a step in the Applied Steps navigation; you can jump back, delete, or continue from any step.
7. **Pick a template** — choose a built-in template or upload a custom HTML template with `{{placeholders}}` plus a JSON calc spec. Set Persian or English.
8. **Define KPIs** — visually or via the JSON spec.
9. **Build charts** — pick chart types, drag fields, set palettes, enable Slicers, drill down. Save the charts you want to include in the report.
10. **Generate the report** — in Live mode, the AI drafts each section based on the actual data. Edit, regenerate, reject, or rewrite any section. In Manual mode, write everything yourself with the template skeleton ready to go.
11. **Preview** — set page size, orientation, margins, fonts (Persian and English separately), logo, palette, and classification label. Toggle light/dark.
12. **Export** — choose PDF, DOCX, HTML, or Markdown. Optionally export the cleaned dataset as XLSX or CSV, or push it to Google Sheets.

A `samples/` folder is included with a sample sales dataset (both XLSX and CSV), a multi-table XLSX, and example custom-template files, so you can try the full workflow without preparing your own data.

---

## Supported Input and Output Formats

### Input

| Source | Format / Protocol | Notes |
|---|---|---|
| Local file | `.xlsx`, `.xls`, `.csv` | Multi-sheet, multi-table detection |
| Google Sheets | Public link | Imported via the same SheetJS pipeline |
| Pasted text | TSV / CSV | For quick one-off imports |

### Output

| Format | Method | Notes |
|---|---|---|
| PDF | Browser print dialog | Header/footer alignment preserved across pages |
| DOCX | HTML-in-Word | Opens in Word and Google Docs |
| HTML | Standalone file | Self-contained, includes charts as inline SVG/Canvas |
| Markdown | Plain `.md` | Text-focused; charts referenced |
| Cleaned data — XLSX | SheetJS export | Post-cleaning dataset |
| Cleaned data — CSV | SheetJS export | Post-cleaning dataset |
| Google Sheets | Transfer | Per the application's actual transfer capability |

---

## Security and Data Privacy Considerations

This section describes the security posture **as implemented in the code**. It is not an independent security audit.

### What is in place

- **Local-only server.** The server binds to `127.0.0.1` only. It is not reachable from the network.
- **Password hashing.** Passwords are hashed with **scrypt** using a random per-user salt and verified with constant-time comparison. Plaintext passwords are never stored or logged.
- **OTP hashing.** One-time codes are hashed with HMAC-SHA256 using the master key. Plaintext codes are never stored in the database.
- **Session tokens.** Session tokens are 32-byte `token_urlsafe` random values, set in an `HttpOnly` + `SameSite=Lax` cookie, with a 7-day TTL.
- **Account lockout.** After 5 failed logins, the account is locked for 5 minutes. Login responses do not reveal whether the email exists.
- **Rate limiting.** Sliding-window limits on registration, login, OTP verify, OTP resend, password reset, and AI proxy calls.
- **CSRF protection.** All POST endpoints require an `X-Requested-With: XMLHttpRequest` header, in addition to the SameSite=Lax cookie.
- **Parameterized SQL.** All database queries use parameter binding.
- **API key encryption.** API keys are encrypted server-side using an authenticated-encryption scheme (HMAC-CTR with encrypt-then-MAC), implemented with the Python standard library only. The master key is stored in `data/secrets/master.key` with file mode `0600`, **outside** the database.
- **API key never returned to the browser.** Only a masked hint (e.g. `sk-…1223`) is ever included in API responses, the UI, logs, or backups.
- **AI requests are proxied server-side.** The browser never sees the API key in Live mode with a saved key. The request to the AI provider originates from the local server, not the browser, which also eliminates CORS as a failure mode.
- **No third-party services required.** No analytics, no telemetry, no mandatory cloud account. SMTP is the only optional external dependency, and only if you want real email OTP delivery.
- **`.gitignore` protects local data.** `data/`, `*.db`, and `data/secrets/master.key` are gitignored and must never be committed.

### What is **not** claimed

- This project does **not** claim to be "production-grade secure", "audited", "penetration-tested", or "compliance-certified". The security measures above are the ones implemented in the code; they have not been independently reviewed.
- The local mode (without SMTP) shows the OTP in the UI. This is intentional and transparent for single-user personal use, but it is not appropriate for a multi-user deployment.

---

## Limitations and Known Issues

1. **County boundaries on the Iran map.** Province borders are real (GeoJSON from geoBoundaries). County subdivisions inside each province are drawn as **Voronoi cells** from real OSM county centroids, so the lines between counties are approximate, not official administrative boundaries. For official administrative use, replace the geo data with an authoritative source.
2. **Email verification in local mode.** Without `RAS_SMTP_*` environment variables, the OTP is shown in the UI. Set the SMTP environment variables for real email delivery.
3. **PDF export** uses the browser's print dialog. **DOCX** export produces HTML-in-Word (opens correctly in Word and Google Docs, but is not a binary `.docx`).
4. **`file://` mode** disables the account system, the API key vault, and the server-side AI proxy. Use `python run.py` for full functionality.
5. **No automated test suite.** The project is currently tested by manual use, not by automated unit or integration tests. Adding automated tests is on the roadmap.
6. **Single-user design.** The account system is local to a single SQLite database. It is not designed for multi-tenant or shared deployment.
7. **Geo data source.** Province borders: geoBoundaries (gbOpen IRN ADM1), simplified and rounded to 2 decimal places (about 28 KB total). County centroids: OpenStreetMap (`admin_level=5`). For legal-grade boundary work, an authoritative source is required.

---

## Future Roadmap

These are **suggestions for future development**, not current features. They are scoped to ideas that make sense for this project's direction.

- **Automated data quality reports** — generate a standalone quality report alongside the main report.
- **Reusable report templates** — a template gallery that can be shared across reports and projects.
- **Report version comparison** — diff two versions of the same report to see what changed.
- **Automated testing and validation** — unit tests for the calculation engine and join engine; end-to-end tests with Playwright.
- **Enhanced API key management** — multiple keys per user, per-provider labels, key rotation reminders.
- **Reproducible reporting pipelines** — pin a dataset version + template + calc spec + chart config to produce a deterministic report.
- **Additional data source integrations** — SQL databases (PostgreSQL, SQLite), REST APIs, Parquet files.
- **Plugin architecture** — allow third-party chart types and data source connectors.
- **Containerized deployment** — a `Dockerfile` and `docker-compose.yml` for team use.
- **Localization beyond Persian/English** — extend the template system to additional RTL and LTR languages.

---

## What I Learned

- **Turning a recurring pain into a system.** I had spent roughly an hour after every analysis project just packaging the results into a report. The biggest lesson was that the pain wasn't "reporting is hard" — it was "reporting is the same set of mechanical steps every time, and none of them require me to think." Identifying that distinction is what made the system possible: the AI does the part that benefits from a first draft, and the human keeps the part that requires judgment.

- **Designing a workflow, not a feature list.** The 9-step journey is the actual deliverable. Each step had to be self-contained enough to be useful alone, but connected enough that the output of one step is the input of the next. The state layer in `20-app-state.js` ended up being the most important file in the project — everything else is a view onto it.

- **Prompt engineering as a real discipline.** The default prompt in `90-ai-service.js` doesn't just say "write a report". It says: use the exact figures, do not invent numbers, write 3–5 analytical sentences per section, end with prioritized operational recommendations, and respect the language. The constraint "do not invent numbers" is the difference between a useful draft and a dangerous one. I also learned that the prompt alone is not enough — you need an editing layer on top, because the model will still get things wrong, and the user has to be able to fix them.

- **Human-in-the-loop as a design principle.** The three modes (demo / manual / live) and the per-section regenerate/reject/edit controls are not features I added at the end. They are the architecture. The system never auto-publishes AI text. That decision was made early, and it shaped how the AI service, the report renderer, and the state layer interact.

- **Data quality before data visualization.** I spent more time on the profiler and the cleaner than on the chart studio. The reason is simple: a chart built from dirty data is worse than no chart, because it looks authoritative. The 10-check profiler and the Power Query-style applied-steps navigation exist because the chart studio's output is only as trustworthy as its input.

- **Local-first is a feature, not a limitation.** Deciding that the server binds to `127.0.0.1` only, that there is no mandatory cloud account, that the API key is encrypted server-side and never returned to the browser, and that SMTP is optional — these decisions made the project simpler, not harder. They removed entire categories of failure (data leaks, key exposure, vendor lock-in) and the security section practically wrote itself.

- **System thinking over feature stacking.** The most useful skill I practiced was resisting the urge to add "just one more feature." Every feature had to earn its place in the 9-step journey or it didn't ship. The journey rail with real status indicators, the secondary preview ribbon, the transparent "local mode" notice — these are small UX decisions, but they are what make the workflow legible to a new user.

---

## 📬 How to  Contact!

> 
>
> - **Author:** — MohammadHasanPourkabgani
> - **LinkedIn** — [MohammadHasan Pourkabgani](https://www.linkedin.com/in/mohammadhasan-pourkabgani/)
> - **GitHub** — [Hasanprk](https://github.com/Hasanprk)
>  - **Email** — mh.pourkabgani91@gmail.com


I built this project to solve a real problem in my own analytics workflow and to demonstrate end-to-end system design, prompt engineering, and data preparation skills. I'm happy to discuss the architecture, the prompt strategy, or potential collaboration — feel free to open an issue or reach out via the contact details above.

---
