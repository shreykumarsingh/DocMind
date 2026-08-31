# ✦ DocMind — AI Document Assistant

> Upload any PDF and chat with it instantly. Drag & drop your document, and DocMind will index it automatically — then ask questions and get accurate, context-grounded answers.

### 🚀 Quick Start

```bash
cd "ai service" && npm start
```

🌐 **Open the app →** [**http://localhost:3000**](http://localhost:3000)

📦 **GitHub →** [**github.com/shreykumarsingh/RAG-PROJECT**](https://github.com/shreykumarsingh/RAG-PROJECT)

---

## 📑 Table of Contents

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

## ✨ Features

- 📄 **Drag & drop any PDF** — Upload through the web UI, auto-indexed in seconds
- 💬 **Chat with your document** — Ask questions in plain English, get accurate answers
- 🔍 **Semantic search** — Finds the most relevant chunks using vector similarity
- 📎 **Source citations** — See which parts of the PDF the answer came from (with similarity %)
- 🧠 **Conversation memory** — AI remembers what you asked before in the session
- 🔄 **Swap documents** — Upload a new PDF anytime, old data is automatically cleared
- 🌙 **Dark mode UI** — Clean, minimal interface inspired by modern AI products
- 🆓 **100% free** — Uses free-tier models (OpenRouter + Pinecone)

---

## 🏗️ Architecture

```
┌─── UPLOAD FLOW ──────────────────────────────────────────┐
│                                                            │
│  User drops PDF  →  Multer saves file  →  PDFLoader       │
│       ↓                                                    │
│  RecursiveCharacterTextSplitter (1000 chars, 200 overlap) │
│       ↓                                                    │
│  OpenAI Embeddings (text-embedding-3-small via OpenRouter)│
│       ↓                                                    │
│  Pinecone Vector Store (auto-clears old data first)       │
└────────────────────────────────────────────────────────────┘

┌─── QUERY FLOW ───────────────────────────────────────────┐
│                                                            │
│  User question  →  Embed  →  Pinecone search (top 8)     │
│       ↓                                                    │
│  [System prompt + Context + Question]                     │
│       ↓                                                    │
│  LLM (nvidia/nemotron-3-ultra:free)  →  Answer + Sources │
└────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
RAG-Project-main/
├── .gitignore
├── README.md
└── ai service/
    ├── .env                      ← API keys (not in git)
    ├── server.js                 ← Express server + upload + chat API
    ├── index.js                  ← CLI ingestion script (index a PDF)
    ├── query.js                  ← CLI interactive chatbot
    ├── deleteAll.js              ← Utility to wipe Pinecone index
    ├── result.pdf                ← Default sample document
    ├── package.json              ← Dependencies + npm scripts
    ├── public/
    │   └── index.html            ← Web UI (drag & drop + chat)
    └── uploads/                  ← Temp folder for uploaded PDFs (gitignored)
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** | Runtime |
| **Express** | Web server + API |
| **Multer** | File upload handling |
| **LangChain** | PDF loading, chunking, embeddings |
| **Pinecone** | Vector database |
| **OpenRouter** | LLM + embedding API gateway |
| `text-embedding-3-small` | Embedding model |
| `nvidia/nemotron-3-ultra:free` | LLM for answer generation |
| **Vanilla HTML/CSS/JS** | Web UI (no framework needed) |

---

## ✅ Prerequisites

1. **Node.js v18+** — [Download](https://nodejs.org)
2. **OpenRouter Account** — [Sign up free](https://openrouter.ai) → Get API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. **Pinecone Account** — [Sign up free](https://app.pinecone.io) → Create an index:
   - Name: `rag`
   - Dimensions: `1536`
   - Metric: `cosine`
   - Region: `us-east-1`

---

## 🔐 Environment Variables

Create `ai service/.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PINECONE_API_KEY=pcsk_your-key-here
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=rag
```

> ⚠️ `.env` is gitignored and will never be committed.

---

## 📦 Installation

```bash
git clone git@github.com:shreykumarsingh/RAG-PROJECT.git
cd RAG-PROJECT/ai\ service
npm install
```

---

## ▶️ How to Run

### Web UI (recommended)

```bash
npm start
```

Then open **[http://localhost:3000](http://localhost:3000)** and:
1. 📄 Drag & drop any PDF into the sidebar
2. ⏳ Wait for indexing to complete (~30s)
3. 💬 Start asking questions!

---

## 📖 Usage

### Uploading a PDF

- **Drag and drop** a PDF onto the upload zone in the sidebar
- Or **click** the upload zone to browse for a file
- Max file size: **20MB**
- The old document is automatically replaced when you upload a new one

### Chatting

- Type any question in the input box and press Enter
- The AI answers **only from your document** — no hallucination
- Source chunks are shown below each answer with similarity scores
- Conversation history is maintained within the session

---

## 🖥️ CLI Mode

You can also use the project from the command line:

```bash
# Index a specific PDF (one-time)
npm run index          # indexes result.pdf

# Chat interactively in terminal
npm run query          # starts CLI chatbot

# Clear all vectors
npm run delete         # wipes Pinecone index
```

---

## 📡 API Reference

### `POST /api/upload`
Upload and index a PDF document.

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "pdf=@/path/to/document.pdf"
```

**Response:** `{ "status": "indexing", "filename": "document.pdf" }`

---

### `GET /api/status`
Check current document status.

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

---

### `GET /api/health`
Health check.

**Response:** `{ "status": "ok", "index": "rag" }`

---

## 💬 Sample Output

```
📄 research_paper.pdf indexed — 15 pages, 42 chunks ready

You: What methodology was used in the study?

DocMind [AI]: Based on the document, the study employed a mixed-methods
approach combining quantitative surveys (n=500) with qualitative
semi-structured interviews (n=30). The data was analyzed using
thematic analysis for qualitative data and SPSS for statistical
analysis of the survey responses.

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
| `404 Pinecone index not found` | Create index `rag` at [app.pinecone.io](https://app.pinecone.io) (1536 dims, cosine) |
| `429 Rate limited` | Wait 30–60s and try again (free tier limit) |
| `No document indexed yet` | Upload a PDF first via the web UI |
| `Only PDF files are allowed` | The upload only accepts `.pdf` files |
| `File too large` | Maximum upload size is 20MB |

---

## 🔮 Future Improvements

- [ ] Support `.docx`, `.txt`, and `.csv` files
- [ ] Multi-document search (index multiple PDFs)
- [ ] Streaming LLM responses (token by token)
- [ ] Persistent chat history (save to disk)
- [ ] Page number citations in answers
- [ ] Docker deployment
- [ ] User authentication

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

**Built with ❤️ by Shrey Kumar Singh**

</div>
