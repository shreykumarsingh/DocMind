# ✦ DocMind — AI Document Assistant

> Upload PDF, Word, text or CSV files and chat with all of them at once. Answers stream in token by token, cite the file and page they came from, and render in **full Markdown with syntax-highlighted code and LaTeX math**.

### 🚀 Quick Start

```bash
npm install
cp .env.example .env      # then put your OpenRouter + Pinecone keys in .env
npm start                 # → http://localhost:3000
```

That's all you need — Docker is optional (see [Docker](#-docker) if you want to run it on a server).

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
- [Docker](#-docker)
- [Deploying to Vercel](#-deploying-to-vercel)
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
1. **Retrieval**: When you ask a question, the system searches an external database (a Vector DB containing your chunked documents) to fetch only the text segments most relevant to your query.
2. **Augmentation**: The system dynamically combines those retrieved segments with your original question, creating a context-rich prompt.
3. **Generation**: The LLM reads this custom prompt and generates a response. Because it is fed the exact source text, it writes a factual, grounded answer restricted strictly to your documents.

---

## ✨ Features

- 📄 **PDF, DOCX, TXT and CSV** — Drag & drop one or many files; each is indexed in parallel
- 📚 **Multi-document search** — Every question searches all indexed files and keeps the best 8 chunks overall
- ⚡ **Streaming answers** — Responses appear token by token
- 📎 **Page citations** — Answers cite `[file.pdf, p. 3]` (PDF pages) or `[file.csv, row 12]` (CSV rows), shown as chips; snippet cards under each answer show the same file, page/row and similarity score
- 💾 **Persistent chat history** — Saved in your browser (localStorage), survives reloads; **Clear Chat** resets it
- 🧠 **Conversation memory** — The last 10 turns are replayed as clean Q&A, without old context blobs
- 🔁 **Automatic model fallback** — If the free model is overloaded, OpenRouter retries with the next one in the list
- 🎨 **Syntax highlighting** — Code blocks highlighted with highlight.js
- 📐 **Markdown + LaTeX rendering** — Headings, tables, code blocks, and math in `$…$`, `$$…$$`, `\(…\)` or `\[…\]` (prices like "$5 and $10" stay plain text)
- 🛡️ **Sanitized output** — Model output is passed through DOMPurify, so HTML hidden in a document can't run in your browser
- 📱 **Works on phones** — The sidebar stacks above the chat on small screens
- ✨ **Clean light UI** — Indigo-accented cards with citation chips, retrieved-snippet cards (similarity scores, page/row), and one-click **Copy** / **Export Markdown**
- 🐳 **Optional Docker deployment** — For running on a server; not needed locally
- 🆓 **100% free** — Uses free-tier models (OpenRouter + Pinecone Serverless)

---

## 🏗️ Architecture

```
┌─── UPLOAD FLOW ───────────────────────────────────────────────┐
│                                                                │
│  User drops files → Multer (in memory, 20MB, pdf/docx/txt/csv) │
│       ↓                                                        │
│  Loader: PDFLoader (per page) · DocxLoader · CSVLoader (per    │
│          row) · plain text                                     │
│       ↓                                                        │
│  RecursiveCharacterTextSplitter (1000 chars, 200 overlap)      │
│       ↓                                                        │
│  OpenAI Embeddings (text-embedding-3-small via OpenRouter)     │
│       ↓                                                        │
│  Pinecone — one namespace per document                         │
│  (each chunk stores filename + page/row label)                 │
│       ↓                                                        │
│  Wait until Pinecone can search it → "indexed"                 │
└────────────────────────────────────────────────────────────────┘

┌─── QUERY FLOW ────────────────────────────────────────────────┐
│                                                                │
│  Question → Embed → query every namespace → global top 8       │
│       ↓                                                        │
│  Messages: [System prompt] + [last 10 Q&A sent by the browser] │
│          + [Labeled context "[file, p. N]" + question]         │
│       ↓                                                        │
│  OpenRouter, streamed, with fallback:                          │
│  Nemotron 3 Ultra → Nemotron 3 Super → Gemma 4 (all free)      │
│       ↓  NDJSON: {sources} then {delta} {delta} …              │
│  Browser: marked + KaTeX + DOMPurify while streaming,          │
│           highlight.js when done, saved to localStorage        │
└────────────────────────────────────────────────────────────────┘
```

> **Stateless server:** documents live in Pinecone and chat history lives in the browser, so the server holds no state. It behaves the same locally, in Docker, and on Vercel.

---

## 📁 Project Structure

```
DocMind/
├── .env.example         ← Template for your keys (copy to .env)
├── .env                 ← Your API keys (gitignored, never committed)
├── server.js            ← Express API: upload, docs, streaming chat, health
├── rag.js               ← Shared core: loaders, chunking, Pinecone, retrieval, LLM
├── index.js             ← CLI: index a file
├── query.js             ← CLI: streaming terminal chatbot
├── deleteAll.js         ← CLI: wipe every document from Pinecone
├── test.js              ← Offline check of the file loaders (npm test)
├── result.pdf           ← Sample document for CLI indexing
├── public/
│   └── index.html       ← Web UI (upload, document list, chat)
├── Dockerfile
├── .dockerignore
├── vercel.json
└── package.json
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js ≥ 20** | Runtime |
| **Express 5** | Web server + REST API |
| **Multer** | File upload handling (20MB max, in memory) |
| **LangChain Community** | PDFLoader, DocxLoader, CSVLoader |
| **mammoth** / **d3-dsv** | DOCX text extraction / CSV parsing |
| **@langchain/textsplitters** | RecursiveCharacterTextSplitter |
| **@langchain/openai** | OpenAI-compatible embedding client |
| **@langchain/pinecone** | Pinecone vector store integration |
| **Pinecone Serverless** | Vector database |
| **OpenRouter** | LLM + embedding API gateway (free tier) |
| `text-embedding-3-small` | 1536-dim embedding model |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | Main answer model (falls back to `nemotron-3-super-120b-a12b:free`, then `google/gemma-4-31b-it:free`) |
| **marked.js** + **DOMPurify** | Markdown rendering, sanitized |
| **KaTeX** | LaTeX math rendering |
| **highlight.js** | Code block syntax highlighting |
| **Vanilla HTML/CSS/JS** | Web UI (zero frontend frameworks) |

---

## ✅ Prerequisites

1. **Node.js v20+** — [Download](https://nodejs.org) *(or just Docker)*
2. **OpenRouter Account** — [Sign up free](https://openrouter.ai) → Get API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. **Pinecone Account** — [Sign up free](https://app.pinecone.io) → Create a **Serverless** index:
   - Name: `rag` (or any name — set it in `.env`)
   - Dimensions: `1536`
   - Metric: `cosine`
   - Cloud/Region: `AWS / us-east-1`

---

## 🔐 Environment Variables

Copy the template and fill in your keys:

```bash
cp .env.example .env          
```

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | OpenRouter key, used for the chat model and embeddings |
| `PINECONE_API_KEY` | ✅ | Pinecone key |
| `PINECONE_INDEX_NAME` | ✅ | Your Pinecone index (Serverless, 1536 dims, cosine) |
| `PINECONE_ENVIRONMENT` | — | Index region (`us-east-1`). Not read by the code — the Pinecone SDK finds the index from its name |
| `GOOGLE_API_KEY` | — | Placeholder, not used by DocMind |
| `PORT` | — | Web server port (default `3000`) |
| `OPENROUTER_MODELS` | — | Comma-separated chat models, tried in order when one is overloaded. Defaults to the three free models above |

> ⚠️ `.env` is gitignored and excluded from the Docker image. Never put real keys in `.env.example` — it gets committed.

---

## 📦 Installation

```bash
git clone git@github.com:shreykumarsingh/RAG-PROJECT.git
cd RAG-PROJECT
npm install
cp .env.example .env          # then add your keys
```

---

## ▶️ How to Run

```bash
npm start
```

Then open **[http://localhost:3000](http://localhost:3000)** and:
1. 📄 Drag & drop one or more PDF, DOCX, TXT or CSV files into the sidebar (max 20MB each)
2. ⏳ Wait for each file to show up under **Indexed Documents** with a green dot (usually 5–20 seconds)
3. 💬 Start asking questions — answers stream in with citations

Custom port: `PORT=8080 npm start` (or set `PORT` in `.env`).

---

## 🐳 Docker

**Optional.** DocMind runs locally with `npm start` — Docker isn't needed for that. Use it to run DocMind on a server or a machine without Node.js:

```bash
docker build -t docmind .
docker run --env-file .env -p 3000:3000 docmind
```

- The image is a **snapshot** of the code at build time — after changing any file, run `docker build` again
- If `npm start` is already using port 3000, map another one: `-p 3001:3000` → [http://localhost:3001](http://localhost:3001)
- The image runs as the non-root `node` user and holds no state, so you can restart or scale it freely
- To remove it: `docker rmi docmind`

---

## ▲ Deploying to Vercel

The repo includes a `vercel.json`, so it deploys as-is:

1. Import the repository in [Vercel](https://vercel.com/new)
2. Add `OPENROUTER_API_KEY`, `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` under **Settings → Environment Variables**
3. Deploy

Limits to know:
- Vercel caps request bodies at **4.5MB**, so larger files fail before reaching the app
- An upload can take 20+ seconds (embedding + waiting for Pinecone), so the function needs a timeout above that — the default on current Vercel plans is enough, older projects limited to 10s are not

For big documents, use Docker or a regular server instead.

---

## 📖 Usage

### Uploading documents

- **Drag and drop** files onto the upload zone, **click** it (or focus it and press Enter), or use the **📎** button next to the chat box; you can select several at once
- Supported: `.pdf`, `.docx`, `.txt`, `.csv`, max **20MB** each
- A file shows as indexed (green dot) only once it is searchable, so you can ask about it right away
- Each file is indexed separately and listed under **Indexed Documents**; uploading a new file never removes existing ones
- Hover a document and click **✕** to remove it; **↻** reloads the list

### Chatting

- Type a question and press **Enter** (Shift+Enter for a new line), or click one of the **Suggested queries**
- Every question searches **all** indexed documents
- Each answer shows:
  - a header with the **top match %** and how long retrieval took
  - inline **citation chips**, e.g. `🔗 report.pdf · p. 4`
  - **Retrieved Context Snippets** — one card per source with its similarity score (`Sim: 0.94`) and page/row; **Collapse Chunks** hides them
  - **Copy** (answer to clipboard) and **Export Markdown** (answer + sources as a `.md` file)
- Chat history is saved in your browser and restored on reload; click **Clear Chat** to start over

---

## 🖥️ CLI Mode

```bash
npm run index                    # index result.pdf
npm run index -- notes.docx      # index any supported file
npm run query                    # streaming chat in the terminal
npm run delete                   # wipe every document from Pinecone
npm test                         # offline loader check (no API keys needed)
```

---

## 📡 API Reference

### `POST /api/upload`
Upload and index one file (multipart field `file`). Responds once the file is indexed **and searchable** (usually 5–20 seconds).

```bash
curl -X POST http://localhost:3000/api/upload -F "file=@/path/to/report.pdf"
```

**Response:** `{ "id": "3f2a…", "filename": "report.pdf", "pages": 22, "chunks": 55 }` (`pages` only for PDFs)

Returns HTTP 400 for unsupported types, files over 20MB, corrupt files, or files with no extractable text.

---

### `GET /api/docs`
List indexed documents.

**Response:** `[{ "id": "3f2a…", "filename": "report.pdf", "pages": 22, "chunks": 55 }]`

---

### `DELETE /api/docs?id=<id>`
Remove one document from the index.

**Response:** `{ "status": "deleted" }`

---

### `POST /api/chat`
Ask a question across all indexed documents. The answer is streamed as **NDJSON** (one JSON object per line).

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this about?", "history": []}'
```

**Stream:**
```
{"sources":[{"text":"…","filename":"report.pdf","loc":"p. 3","score":91}]}
{"delta":"This report "}
{"delta":"covers… [report.pdf, p. 3]"}
```

- `history` — optional previous turns `[{ "role": "user" | "assistant", "content": "…" }]`; only the last 10 are used
- If generation fails mid-stream, the last line is `{"error":"…"}`
- If the client disconnects, generation stops (no wasted rate limit)
- Returns HTTP 400 JSON if the body isn't JSON, the question is blank, or no documents are indexed

---

### `GET /api/health`
Health check — confirms the server is up and which Pinecone index is configured.

**Response:** `{ "status": "ok", "index": "rag", "models": ["nvidia/nemotron-3-ultra-550b-a55b:free", "…"], "envConfigured": true }`

---

## 💬 Sample Output

```
📄 research_paper.pdf indexed — 42 chunks · 15 pages

You: What methodology was used in the study?
                                                            Today 10:42 AM

✦  ● 95% top match   Retrieved 3 context snippets in 312ms
   ─────────────────────────────────────────────────────────
   ### Methodology

   The study employed a **mixed-methods** approach 🔗 research_paper.pdf · p. 4

   | Method                 | Sample Size |
   |------------------------|-------------|
   | Quantitative surveys   | n = 500     |
   | Qualitative interviews | n = 30      |

   RETRIEVED CONTEXT SNIPPETS (3)                        Collapse Chunks ⌃
   ┌ research_paper.pdf   Sim: 0.95 ┐ ┌ research_paper.pdf   Sim: 0.89 ┐ ┌ survey_results.csv   Sim: 0.85 ┐
   │ "…The methodology section     │ │ "…Data analysis was performed │ │ "…respondent: 112 …"          │
   │ outlines a mixed-methods…"    │ │ using thematic analysis…"     │ │                               │
   └ Page 4                        ┘ └ Page 5                        ┘ └ Row 12                        ┘

   ⧉ Copy   ⤓ Export Markdown
```

---

## 🔧 Troubleshooting

| Error | Fix |
|---|---|
| `Missing environment variable(s): …` | Create `.env` from `.env.example` and fill in the keys |
| `401 Authentication failed` | Get a new key at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `The API key you provided was rejected` | Check `PINECONE_API_KEY` at [app.pinecone.io](https://app.pinecone.io) |
| `Pinecone index not found` | Create the index at [app.pinecone.io](https://app.pinecone.io) — Serverless, 1536 dims, cosine — and match `PINECONE_INDEX_NAME` |
| `429 Rate limited` / `Service temporarily overloaded` | Free models are busy; DocMind already falls back to other models — wait 30–60s and retry |
| `… is not a valid model ID` | A free model was retired. Set `OPENROUTER_MODELS=model-a,model-b` in `.env` using current IDs from [openrouter.ai/models?q=free](https://openrouter.ai/models?q=free) |
| `No documents indexed yet` | Upload a file via the web UI or run `npm run index` |
| `Supported file types: …` | Only `.pdf`, `.docx`, `.txt`, `.csv` are accepted |
| `File too large` | Maximum upload size is 20MB (4.5MB on Vercel) |
| `Could not read …` | The file is corrupt or not really that type (e.g. a renamed `.txt`) |
| `No text found in …` | The file has no extractable text (e.g. a scanned PDF without OCR) |
| A document called **Untitled** appears | Vectors indexed by an older DocMind version — remove it with ✕ or `npm run delete` |
| Math shows as raw `$\mu$` | KaTeX didn't load from the CDN — hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) |
| Port already in use | macOS/Linux: `lsof -ti:3000 \| xargs kill -9` · Windows: `netstat -ano \| findstr :3000`, then `taskkill /PID <pid> /F` — or set another `PORT` |


---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

**Built with ❤️ by Shrey Kumar Singh**

</div>
