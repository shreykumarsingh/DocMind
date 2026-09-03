# ✦ DocMind — AI Document Assistant

> Upload any PDF and chat with it instantly. Drag & drop your document, and DocMind will index it automatically — then ask questions and get accurate, context-grounded answers rendered in **full Markdown with LaTeX math support**.

### 🚀 Quick Start

```bash
cd "ai service" && npm install && npm start
```
---

## 📑 Table of Contents

- [What is RAG?](#-what-is-rag)
- [Features](#-features)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Environment Variables](#-environment-variables)
- [Installation](#-installation)
- [How to Run](#-how-to-run)
- [Usage](#-usage)
- [CLI Mode](#-cli-mode)
- [API Reference](#-api-reference)
- [Sample Output](#-sample-output)
- [Troubleshooting](#-troubleshooting)
- [Future Improvements](#-future-improvements)
- [License](#-license)

---

## 🧠 What is RAG?

**Retrieval-Augmented Generation (RAG)** is an AI design pattern that addresses two major limitations of Large Language Models (LLMs): **hallucinations** (making up facts) and **knowledge cutoff** (lack of access to your private or fresh documents).

Instead of relying solely on what the LLM learned during its training, a RAG pipeline works in three steps:
1. **Retrieval**: When you ask a question, the system searches an external database (a Vector DB containing your chunked PDF) to fetch only the text segments most relevant to your query.
2. **Augmentation**: The system dynamically combines those retrieved segments with your original question, creating a context-rich prompt.
3. **Generation**: The LLM reads this custom prompt and generates a response. Because it is fed the exact source text, it writes a factual, grounded answer restricted strictly to your document.

---

## ✨ Features

- 📄 **Drag & drop any PDF** — Upload through the web UI, auto-indexed in seconds
- 💬 **Chat with your document** — Ask questions in plain English, get accurate answers
- 🔍 **Semantic search** — Finds the most relevant chunks using vector similarity (top 8)
- 📎 **Source citations** — See which parts of the PDF the answer came from (with similarity %)
- 🧠 **Conversation memory** — AI remembers what you asked before without wasting tokens
- 🔄 **Swap documents** — Upload a new PDF anytime, old vectors are automatically cleared
- 📐 **Markdown + LaTeX rendering** — Responses render headings, tables, code blocks, and math formulas (e.g. $\mu$, $\bar{x}$, $\sigma^2$)
- 🌙 **Dark mode UI** — Clean, minimal interface inspired by modern AI products
- 🆓 **100% free** — Uses free-tier models (OpenRouter + Pinecone Serverless)
- ⚙️ **Configurable port** — Set `PORT` in `.env` to run on any port

---

## 🏗️ Architecture

```
┌─── UPLOAD FLOW ──────────────────────────────────────────────┐
│                                                               │
│  User drops PDF  →  Multer (20MB max, PDF only)  →  PDFLoader│
│       ↓                                                       │
│  RecursiveCharacterTextSplitter (1000 chars, 200 overlap)     │
│       ↓                                                       │
│  OpenAI Embeddings (text-embedding-3-small via OpenRouter)    │
│       ↓                                                       │
│  Pinecone Serverless (old vectors safely cleared first)       │
└───────────────────────────────────────────────────────────────┘

┌─── QUERY FLOW ───────────────────────────────────────────────┐
│                                                               │
│  User question  →  Embed  →  Pinecone search (top 8)         │
│       ↓                                                       │
│  Build messages: [System prompt] + [Clean Q&A history]        │
│                + [Context + Current question]                  │
│       ↓                                                       │
│  LLM (nvidia/nemotron-3-ultra:free)  →  Answer + Sources     │
│       ↓                                                       │
│  Frontend renders: marked.js (Markdown) + KaTeX (LaTeX math) │
└───────────────────────────────────────────────────────────────┘
```

> **Context window strategy:** Previous conversation turns are stored as clean Q&A pairs — context blobs are injected fresh only for the current question. This keeps token usage lean as the conversation grows.

---

## 📁 Project Structure

```
RAG-Project-main/
├── .gitignore
├── README.md
└── ai service/
    ├── .env                      ← API keys (never committed to git)
    ├── server.js                 ← Express server: upload, chat, clear, status APIs
    ├── index.js                  ← CLI ingestion script (indexes result.pdf)
    ├── query.js                  ← CLI interactive chatbot (terminal REPL)
    ├── deleteAll.js              ← Utility to wipe all vectors from Pinecone
    ├── result.pdf                ← Sample document for CLI indexing
    ├── package.json              ← Dependencies + npm scripts + engines
    ├── public/
    │   └── index.html            ← Web UI (drag & drop + markdown chat)
    └── uploads/                  ← Temp folder for PDF uploads (gitignored)
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js ≥ 18** | Runtime |
| **Express 5** | Web server + REST API |
| **Multer** | PDF upload handling (20MB max) |
| **LangChain Community** | PDFLoader, RecursiveCharacterTextSplitter |
| **@langchain/openai** | OpenAI-compatible embedding client |
| **@langchain/pinecone** | Pinecone vector store integration |
| **Pinecone Serverless** | Vector database |
| **OpenRouter** | LLM + embedding API gateway (free tier) |
| `text-embedding-3-small` | 1536-dim embedding model |
| `nvidia/nemotron-3-ultra:free` | LLM for answer generation |
| **marked.js** | GitHub-Flavored Markdown rendering in the browser |
| **KaTeX** | LaTeX math formula rendering in the browser |
| **Vanilla HTML/CSS/JS** | Web UI (zero frontend frameworks) |

---

## ✅ Prerequisites

1. **Node.js v18+** — [Download](https://nodejs.org) *(enforced by `engines` field in package.json)*
2. **OpenRouter Account** — [Sign up free](https://openrouter.ai) → Get API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. **Pinecone Account** — [Sign up free](https://app.pinecone.io) → Create a **Serverless** index:
   - Name: `rag` (or any name — set it in `.env`)
   - Dimensions: `1536`
   - Metric: `cosine`
   - Cloud/Region: `AWS / us-east-1`

---

## 🔐 Environment Variables

Create `ai service/.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PINECONE_API_KEY=pcsk_your-key-here
PINECONE_INDEX_NAME=rag
PORT=3000
```

> ⚠️ `.env` is gitignored and will never be committed.

> ℹ️ `PINECONE_ENVIRONMENT` is no longer needed — the Pinecone v5 SDK resolves the host automatically from the index name.

---

## 📦 Installation

```bash
git clone git@github.com:shreykumarsingh/RAG-PROJECT.git
cd RAG-PROJECT/"ai service"
npm install
```

---

## ▶️ How to Run

### Web UI (recommended)

```bash
npm start
```

Then open **[http://localhost:3000](http://localhost:3000)** and:
1. 📄 Drag & drop any PDF into the sidebar (max 20MB)
2. ⏳ Wait for indexing to complete (~30–60s depending on PDF size)
3. 💬 Start asking questions — responses render with full Markdown and math

### Custom port

```bash
PORT=8080 npm start
# or add PORT=8080 to your .env
```

---

## 📖 Usage

### Uploading a PDF

- **Drag and drop** a PDF onto the upload zone in the sidebar
- Or **click** the upload zone to browse for a file
- Maximum file size: **20MB**
- Only `.pdf` files are accepted — non-PDFs are rejected with a JSON error
- The old document's vectors are automatically wiped when you upload a new one

### Chatting

- Type any question in the input box and press **Enter** (Shift+Enter for a new line)
- The AI answers **only from your document** — grounded in the indexed content
- Source chunks are shown below each answer with similarity scores
- Responses are rendered with full **Markdown** (headings, tables, code, lists) and **LaTeX math**
- Conversation history is maintained within the session (clean — no context bloat)

### Removing a document

- Click **✕ Remove document** in the sidebar to wipe all vectors and reset the session

---

## 🖥️ CLI Mode

You can also use the project entirely from the terminal:

```bash
# Index result.pdf into Pinecone (one-time setup)
npm run index

# Chat interactively in the terminal
npm run query

# Wipe all vectors from Pinecone
npm run delete
```

> **Note:** `npm run index` requires a valid `result.pdf` in the `ai service/` directory. If the file is missing, a clear error message is shown.

---

## 📡 API Reference

### `POST /api/upload`
Upload and index a PDF document. Returns immediately; indexing runs in the background.

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "pdf=@/path/to/document.pdf"
```

**Response:** `{ "status": "indexing", "filename": "document.pdf" }`

Poll `GET /api/status` to detect when indexing is complete.

---

### `GET /api/status`
Check current document state.

**Response:**
```json
{
  "filename": "document.pdf",
  "pages": 22,
  "chunks": 55,
  "indexed": true,
  "indexing": false
}
```

---

### `POST /api/chat`
Ask a question about the indexed document.

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this about?", "sessionId": "abc123"}'
```

**Response:**
```json
{
  "answer": "This document is about...",
  "sources": [
    { "text": "...", "score": 95 }
  ]
}
```

- `sessionId` — any unique string per user/browser tab; creates a new session if unseen
- Returns HTTP 400 if no document is indexed or the question is blank

---

### `POST /api/clear`
Remove the current document and wipe all Pinecone vectors.

```bash
curl -X POST http://localhost:3000/api/clear
```

**Response:** `{ "status": "cleared" }`

---

### `GET /api/health`
Health check — confirms server is up and which Pinecone index is connected.

**Response:** `{ "status": "ok", "index": "rag" }`

---

## 💬 Sample Output

```
📄 research_paper.pdf indexed — 15 pages, 42 chunks ready

You: What methodology was used in the study?

DocMind [AI]:

### Methodology

The study employed a **mixed-methods** approach:

| Method | Sample Size |
|--------|-------------|
| Quantitative surveys | n = 500 |
| Qualitative interviews | n = 30 |

Statistical analysis used **SPSS** for survey data and
thematic analysis for qualitative responses.

Sources:
 📄 "The methodology section outlines a mixed-methods..."  95%
 📄 "Data analysis was performed using thematic..."        89%
 📄 "A total of 500 survey respondents were..."            85%
```

---

## 🔧 Troubleshooting

| Error | Fix |
|---|---|
| `401 Authentication failed` | Get a new key at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `404 Pinecone index not found` | Create index `rag` at [app.pinecone.io](https://app.pinecone.io) — 1536 dims, cosine, serverless |
| `429 Rate limited` | Wait 30–60s and retry (free tier limit) |
| `No document indexed yet` | Upload a PDF first via the web UI or run `npm run index` |
| `Only PDF files are allowed` | The upload accepts `.pdf` files only |
| `File too large` | Maximum upload size is 20MB |
| `PDF file not found` | Place a valid `result.pdf` in the `ai service/` directory before running `npm run index` |
| Math symbols show as `$\mu$` | Hard-refresh the browser (`Cmd+Shift+R`) so KaTeX loads from CDN |
| Port already in use | Kill the old process: `lsof -ti:3000 \| xargs kill -9` |

---

## 🔮 Future Improvements

- [ ] Support `.docx`, `.txt`, and `.csv` files
- [ ] Multi-document search (index multiple PDFs simultaneously)
- [ ] Streaming LLM responses (token-by-token)
- [ ] Persistent chat history (save to disk / localStorage)
- [ ] Page number citations in answers
- [ ] Syntax highlighting in code blocks (highlight.js / Prism)
- [ ] Docker deployment
- [ ] User authentication

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

**Built with ❤️ by Shrey Kumar Singh**

</div>
