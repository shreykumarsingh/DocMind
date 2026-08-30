# 📄 RAG Project — PDF Chatbot with LangChain + Pinecone + OpenRouter

> A production-ready **Retrieval-Augmented Generation (RAG)** pipeline that lets you chat with any PDF document using AI. Ask questions in plain English and get accurate, context-aware answers — powered by OpenRouter LLMs and Pinecone vector search.

---

## 📑 Table of Contents

- [What is RAG?](#-what-is-rag)
- [Project Overview](#-project-overview)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Environment Variables](#-environment-variables)
- [Installation](#-installation)
- [How to Run](#-how-to-run)
  - [Step 1 — Index the PDF](#step-1--index-the-pdf)
  - [Step 2 — Chat with the PDF](#step-2--chat-with-the-pdf)
  - [Step 3 — Clear the Index (Optional)](#step-3--clear-the-index-optional)
- [Scripts Reference](#-scripts-reference)
- [File Reference](#-file-reference)
- [How It Works (Deep Dive)](#-how-it-works-deep-dive)
- [Sample Output](#-sample-output)
- [Known Limitations](#-known-limitations)
- [Troubleshooting](#-troubleshooting)
- [Future Improvements](#-future-improvements)
- [License](#-license)

---

## 🧠 What is RAG?

**Retrieval-Augmented Generation (RAG)** is an AI technique that combines two things:

1. **Retrieval** — searching a database of your documents for relevant information
2. **Generation** — using a Large Language Model (LLM) to generate a human-like answer using only the retrieved information

This is better than just asking an LLM directly because:
- LLMs have knowledge cutoffs and don't know about *your* documents
- RAG grounds the answers in *your actual data*, reducing hallucinations
- The LLM is told: "Answer ONLY from the provided context"

---

## 🚀 Project Overview

This project implements a complete RAG pipeline for a single PDF document (`result.pdf`). The document contains **hackathon project proposals** covering:

- 🎓 **Admission Management System** — AI-powered college admission document verification
- 🛡️ **Women's Safety & Deepfake Detection** — CNN-based deepfake classifier + SOS escalation app
- ⚖️ **Legal-Tech for Police** — AI assistant for writing accurate FIRs (First Information Reports)

You can ask natural language questions like:
- *"What features does the Admission Management System have?"*
- *"How does deepfake detection work in this project?"*
- *"Explain the 3-level SOS escalation system"*

...and get detailed, accurate answers sourced directly from the PDF.

---

## 🏗️ Architecture

```
┌─────────────────── INDEXING PIPELINE (index.js) ───────────────────┐
│                                                                      │
│  result.pdf  →  PDFLoader  →  TextSplitter  →  OpenAI Embeddings   │
│                                    ↓                                 │
│                             Pinecone Vector Store (index: "rag")    │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────── QUERY PIPELINE (query.js) ──────────────────────┐
│                                                                      │
│  User Question  →  Embed Question  →  Pinecone Similarity Search   │
│                                              ↓                       │
│                              Top 10 Matching Chunks (Context)        │
│                                              ↓                       │
│                    [System Prompt + Context + Question]              │
│                                              ↓                       │
│              OpenRouter LLM (nvidia/nemotron-3-ultra:free)          │
│                                              ↓                       │
│                              Answer printed to terminal              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
RAG-Project-main/
├── .gitignore                    ← Git ignore rules
├── README.md                     ← This file
└── ai service/
    ├── .env                      ← API keys (NOT committed to git)
    ├── index.js                  ← Ingestion script (PDF → Pinecone)
    ├── query.js                  ← Interactive chatbot CLI
    ├── deleteAll.js              ← Utility to wipe Pinecone index
    ├── result.pdf                ← Source document (hackathon proposals)
    ├── package.json              ← Node.js config + npm scripts
    ├── package-lock.json         ← Locked dependency versions
    └── node_modules/             ← Installed packages (not in git)
```

---

## 🛠️ Tech Stack

| Technology | Purpose | Version |
|---|---|---|
| **Node.js** | Runtime | v18+ |
| **LangChain** | RAG orchestration framework | ^1.x |
| `@langchain/community` | PDFLoader for reading PDFs | ^1.1.24 |
| `@langchain/textsplitters` | Split PDF into chunks | ^1.0.1 |
| `@langchain/openai` | OpenAI-compatible embeddings | ^1.3.0 |
| `@langchain/pinecone` | LangChain ↔ Pinecone bridge | ^1.0.1 |
| **Pinecone** | Vector database for similarity search | ^5.1.2 |
| **OpenRouter** | Unified LLM API gateway | — |
| `text-embedding-3-small` | Embedding model (via OpenRouter) | — |
| `nvidia/nemotron-3-ultra:free` | LLM for answer generation (free) | — |
| **dotenv** | Load environment variables | 16.6.1 |
| **readline-sync** | Interactive CLI input | ^1.4.10 |
| **pdf-parse** | PDF parsing engine | 1.1.1 |

---

## ✅ Prerequisites

Before running this project, you need:

1. **Node.js v18+** — [Download](https://nodejs.org)
2. **OpenRouter Account** — [Sign up free](https://openrouter.ai) → Get API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. **Pinecone Account** — [Sign up free](https://app.pinecone.io) → Create an index:
   - Index name: `rag`
   - Dimensions: `1536` (matches `text-embedding-3-small`)
   - Metric: `cosine`
   - Cloud: `AWS`, Region: `us-east-1`

---

## 🔐 Environment Variables

All secrets live in `ai service/.env`. **Never commit this file to git.**

```env
# OpenRouter API Key — get from https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Pinecone API Key — get from https://app.pinecone.io
PINECONE_API_KEY=pcsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Pinecone region (match your index region)
PINECONE_ENVIRONMENT=us-east-1

# Your Pinecone index name
PINECONE_INDEX_NAME=rag

# Optional — not currently used by any script
GOOGLE_API_KEY=your_google_api_key_here
```

> ⚠️ `.env` is listed in `.gitignore` and will never be pushed to GitHub.

---

## 📦 Installation

```bash
# 1. Clone the repo
git clone git@github.com:shreykumarsingh/RAG-Project.git
cd RAG-Project/ai\ service

# 2. Install dependencies
npm install

# 3. Copy and fill in your .env
cp .env.example .env
# Edit .env with your real API keys
```

> **Note:** If you already have `node_modules/`, skip step 2.

---

## ▶️ How to Run

### Step 1 — Index the PDF

This reads `result.pdf`, splits it into chunks, creates vector embeddings, and stores them in Pinecone. **Run this once** (or again whenever you change the PDF).

```bash
npm run index
```

**Expected output:**
```
✅  PDF loaded  (22 pages)
✅  Chunking completed  (55 chunks)
✅  Embedding model configured
✅  Pinecone configured
⏳  Uploading vectors to Pinecone...
🎉  Data stored successfully in Pinecone!
```

---

### Step 2 — Chat with the PDF

Start the interactive chatbot. Type any question about your document.

```bash
npm run query
```

**Expected output:**
```
🚀  RAG Chatbot ready! Type your question or press Ctrl+C to exit.

You ➜  What is the Admission Management System?

🤖  The Admission Management System is a secure, searchable workflow that 
    eliminates chat-based document exchange. Features include bulk Excel upload,
    AI-powered OCR verification, QR code tracking, and missing-document detection.

You ➜  _
```

Press `Ctrl+C` to exit.

---

### Step 3 — Clear the Index (Optional)

Deletes **all** vectors from your Pinecone index. Use this if you want to re-index a new document.

```bash
npm run delete
```

> ⚠️ **Warning:** This is irreversible. All stored vectors will be permanently deleted.

---

## 📜 Scripts Reference

| Command | Script | Description |
|---|---|---|
| `npm run index` | `node index.js` | Index `result.pdf` into Pinecone |
| `npm run query` | `node query.js` | Launch interactive chatbot CLI |
| `npm run delete` | `node deleteAll.js` | Wipe all vectors from Pinecone |

---

## 📂 File Reference

### `index.js` — Document Ingestion

The indexing pipeline does 5 things in sequence:

1. **Validates** all required environment variables are present
2. **Loads** `result.pdf` using LangChain's `PDFLoader`
3. **Splits** the document into 1000-character chunks with 200-character overlap using `RecursiveCharacterTextSplitter`
4. **Embeds** each chunk using OpenRouter's `text-embedding-3-small` model (1536-dimensional vectors)
5. **Stores** all vectors into Pinecone with metadata (original text, page number, etc.)

```
Chunk size:    1000 characters
Chunk overlap: 200  characters
Total chunks:  ~55 (for result.pdf)
Model:         text-embedding-3-small (OpenRouter)
Max parallel:  5 concurrent uploads
```

---

### `query.js` — Interactive Chatbot

The query loop does 5 things for every question:

1. **Validates** environment variables on startup
2. **Embeds** the user's question into a 1536-dimensional vector
3. **Searches** Pinecone for the top 10 most semantically similar chunks
4. **Constructs** a prompt: `[System Instructions] + [Retrieved Context] + [User Question]`
5. **Calls** the LLM and prints the answer

Key design decisions:
- **Conversation history** is maintained in memory — the AI remembers what you asked before
- **System prompt** uses the `system` role (not `user`) for proper instruction following
- **`while(true)` loop** instead of recursion — prevents stack overflow on long sessions
- **Clients created once** at startup, not per-query — faster and more efficient
- **`max_tokens: 1024`** — keeps responses within free tier limits

---

### `deleteAll.js` — Cleanup Utility

Simple utility that connects to Pinecone and calls `index.deleteAll()`. Useful when:
- Switching to a different PDF document
- Re-indexing after making changes to chunking settings
- Clearing test data

---

### `result.pdf` — Source Document

A 22-page PDF containing hackathon project proposals:

| Section | Description |
|---|---|
| Admission Management System | Open-source college admission workflow with AI document verification |
| PixelVerse (Deepfake Detection) | EfficientNet-based CNN classifier with heatmaps and legal PDF reports |
| Secure Reporting Portal | Encrypted uploads with anonymous/confidential modes |
| Evidence Locker | SHA-256 timestamped hashing for legal admissibility |
| SOS App (3-Level Escalation) | Volunteers → Campus Security → Police integration |
| Safe Walk | Live-tracked volunteer escort system |
| Voice Alert / Fake Call | Trigger fake calls to escape unsafe situations |
| Legal-Tech for Police | AI assistant for writing accurate FIRs with section suggestions |

---

## 💬 Sample Output

```
🚀  RAG Chatbot ready! Type your question or press Ctrl+C to exit.

You ➜  What is this document about?

🤖  This document is a compilation of hackathon project ideas across several domains:

    1. Admission Management System – An open-source web app to replace WhatsApp-based 
       document collection for college admissions, with AI-powered OCR verification.

    2. Women's Safety & Deepfake Detection – Multiple concepts including a CNN-based 
       deepfake classifier, encrypted reporting portal, and SOS escalation app.

    3. Legal-Tech for Police – An AI assistant to help officers write accurate FIRs 
       by suggesting relevant sections and landmark case laws.

You ➜  How does the deepfake detection work?

🤖  The deepfake detection engine uses image forensic analysis with:
    - Face warping detection (landmark inconsistency)
    - GAN fingerprint detection (artifact detection)  
    - Inconsistent lighting/shadow analysis (frequency domain)
    
    Models are trained on FaceForensics++ and the DeepFake Detection Challenge Dataset.

You ➜  
```

---

## ⚠️ Known Limitations

| Limitation | Details |
|---|---|
| **Single PDF only** | Currently hardcoded to `result.pdf`. To use a different PDF, change the path in `index.js` and re-run indexing. |
| **In-memory chat history** | Conversation history is lost when you exit (`Ctrl+C`). Not persisted to disk. |
| **Free model rate limits** | Free OpenRouter models have rate limits and may occasionally return 429 errors. Retry after a few seconds. |
| **No web UI** | This is a CLI-only tool. No browser interface. |
| **English only** | The prompts and embedding model are optimized for English text. |
| **Context window** | Only top 10 chunks are retrieved per query. Very long or complex answers may be incomplete. |

---

## 🔧 Troubleshooting

### ❌ `401 Authentication failed`
Your OpenRouter API key is invalid or expired.
→ Get a new key at [https://openrouter.ai/keys](https://openrouter.ai/keys)

### ❌ `404 Pinecone index not found`
The Pinecone index `rag` doesn't exist.
→ Create it at [https://app.pinecone.io](https://app.pinecone.io) with:
- **Dimensions:** `1536`
- **Metric:** `cosine`

### ❌ `402 Insufficient credits`
The LLM model you selected requires paid credits.
→ Use a free model: `nvidia/nemotron-3-ultra-550b-a55b:free`

### ❌ `429 Rate limited`
You've hit the free tier rate limit.
→ Wait 30–60 seconds and try again, or add credits at [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits)

### ❌ `TTY not supported` when running query.js
You're running `query.js` in a non-interactive shell (e.g., piping input).
→ Run it in a real terminal: `npm run query`

### Node modules missing
```bash
npm install
```

---

## 🔮 Future Improvements

- [ ] **Web UI** — Build a React/Next.js frontend with a chat interface
- [ ] **Multi-PDF support** — Index multiple documents and search across all of them
- [ ] **Persistent chat history** — Save conversations to a JSON/SQLite file
- [ ] **Streaming responses** — Stream LLM output token-by-token for faster UX
- [ ] **Source citations** — Show which page/chunk the answer came from
- [ ] **Re-ranking** — Use a cross-encoder to re-rank retrieved chunks for better accuracy
- [ ] **Docker support** — Containerize the app for easy deployment
- [ ] **REST API** — Wrap the query pipeline in an Express.js API server
- [ ] **Upload your own PDF** — Allow users to upload any PDF via CLI or UI

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

Built with ❤️ using **LangChain** · **Pinecone** · **OpenRouter** · **Node.js**

</div>
