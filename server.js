// ── Promise.withResolvers polyfill (required for pdfjs-dist on Node < v22) ──
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { unlinkSync } from 'fs';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import OpenAI from 'openai';

import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = os.tmpdir();

// ── Helper to check required environment variables ──────────────────────────
function checkEnvVars(res) {
  const missing = [];
  if (!process.env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');
  if (!process.env.PINECONE_API_KEY) missing.push('PINECONE_API_KEY');
  if (!process.env.PINECONE_INDEX_NAME) missing.push('PINECONE_INDEX_NAME');

  if (missing.length > 0) {
    const errorMsg = `Missing environment variable(s): ${missing.join(', ')}. Please set them in Vercel project settings or .env file.`;
    console.error('❌ ' + errorMsg);
    if (res) {
      res.status(500).json({ error: errorMsg });
    }
    return false;
  }
  return true;
}

// Log warning on boot if env vars are missing
checkEnvVars();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Multer config ────────────────────────────────────────────────────────────
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// ── Service getters (lazy initialization to avoid crash when env vars missing) ─────────
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

function getEmbeddings() {
  return new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    model: 'text-embedding-3-small',
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
  });
}

function getPineconeIndex() {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pinecone.Index(process.env.PINECONE_INDEX_NAME);
}

// ── State ────────────────────────────────────────────────────────────────────
// sessions stores CLEAN conversation history (no context blobs).
// Structure: { [sessionId]: { messages: [...], systemPrompt: string } }
const sessions = {};

let docState = {
  filename: null,
  pages: 0,
  chunks: 0,
  indexed: false,
  indexing: false,
};

// ── Check if there's already data in Pinecone from a previous run ───────────
async function ensureDocState() {
  if (docState.indexed || docState.indexing) return docState;
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) return docState;
  try {
    const pineconeIndex = getPineconeIndex();
    const stats = await pineconeIndex.describeIndexStats();
    const totalVectors = stats.totalRecordCount || 0;
    if (totalVectors > 0) {
      docState.indexed = true;
      docState.chunks = totalVectors;
      docState.filename = docState.filename || 'Previous document';
    }
  } catch (err) {
    console.warn('⚠️ Could not check Pinecone index stats:', err.message);
  }
  return docState;
}

ensureDocState().catch(() => {});

// ── Helper: safely delete all vectors (handles 404 on empty index) ───────────
async function safeDeleteAll() {
  try {
    const pineconeIndex = getPineconeIndex();
    await pineconeIndex.deleteAll();
  } catch (err) {
    // Swallow "not found" — means the index is already empty, which is fine.
    if (err.name === 'PineconeNotFoundError') return;
    // For any other error, re-throw so callers can handle it.
    throw err;
  }
}

// ── Upload & Index endpoint ──────────────────────────────────────────────────
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  if (!checkEnvVars(res)) return;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (docState.indexing) return res.status(409).json({ error: 'Indexing already in progress' });

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  // Start indexing
  docState.indexing = true;
  docState.indexed = false;
  docState.filename = originalName;

  try {
    // 1. Load PDF
    const pdfLoader = new PDFLoader(filePath);
    const rawDocs = await pdfLoader.load();
    docState.pages = rawDocs.length;
    console.log(`✅  PDF loaded: ${originalName} (${rawDocs.length} pages)`);

    // 2. Chunk
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitDocuments(rawDocs);
    docState.chunks = chunks.length;
    console.log(`✅  Chunked into ${chunks.length} pieces`);

    // 3. Clear old vectors safely (handles empty index gracefully)
    await safeDeleteAll();
    console.log('✅  Cleared old vectors');

    // 4. Embed & store
    console.log('⏳  Uploading vectors to Pinecone...');
    const embeddings = getEmbeddings();
    const pineconeIndex = getPineconeIndex();
    await PineconeStore.fromDocuments(chunks, embeddings, {
      pineconeIndex,
      maxConcurrency: 5,
    });

    // 5. Clear all chat sessions (old context is gone)
    Object.keys(sessions).forEach(k => delete sessions[k]);

    docState.indexed = true;
    docState.indexing = false;
    console.log(`🎉  "${originalName}" indexed successfully!`);

    res.json({
      status: 'completed',
      filename: originalName,
      pages: docState.pages,
      chunks: docState.chunks,
    });
  } catch (err) {
    docState.indexing = false;
    docState.indexed = false;
    console.error('❌  Indexing failed:', err.message);
    res.status(500).json({ error: 'Indexing failed: ' + err.message });
  } finally {
    // Cleanup uploaded file (always run to prevent tmp leaks)
    try { unlinkSync(filePath); } catch { /* OK */ }
  }
});

// ── Document status ──────────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  res.json(await ensureDocState());
});

// ── Clear document ───────────────────────────────────────────────────────────
app.post('/api/clear', async (req, res) => {
  if (!checkEnvVars(res)) return;
  if (docState.indexing) return res.status(409).json({ error: 'Indexing in progress, please wait' });
  try {
    await safeDeleteAll();
    Object.keys(sessions).forEach(k => delete sessions[k]);
    docState = { filename: null, pages: 0, chunks: 0, indexed: false, indexing: false };
    console.log('🗑️  Document cleared');
    res.json({ status: 'cleared' });
  } catch (err) {
    console.error('❌  Clear failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Chat endpoint ────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  if (!checkEnvVars(res)) return;
  const { question, sessionId } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: 'No question provided' });

  await ensureDocState();
  if (!docState.indexed) return res.status(400).json({ error: 'No document indexed yet. Please upload a PDF first.' });

  // Initialise a clean session — only the system prompt is stored here.
  // We do NOT store context blobs in history to avoid context window pollution.
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      systemPrompt: `You are a helpful assistant.
Answer the user's question based ONLY on the provided context.
If the answer is not in the context, say "I could not find the answer in the provided document."
Keep your answers clear, concise, and educational.`,
      // Clean Q&A pairs: [{ question: string, answer: string }, ...]
      turns: [],
    };
  }

  try {
    const embeddings = getEmbeddings();
    const pineconeIndex = getPineconeIndex();
    const openai = getOpenAI();

    // 1. Embed the question and retrieve context
    const queryVector = await embeddings.embedQuery(question);
    const searchResults = await pineconeIndex.query({
      topK: 8,
      vector: queryVector,
      includeMetadata: true,
    });

    const sources = searchResults.matches
      .filter((m) => m.metadata && typeof m.metadata.text === 'string')
      .map((m) => ({
        text: m.metadata.text,
        score: Math.round(m.score * 100),
      }));

    const context = sources.map((s) => s.text).join('\n\n---\n\n');

    // 2. Build the messages array fresh each turn.
    //    - System prompt first.
    //    - Previous clean Q&A turns (no context blobs — saves tokens).
    //    - Current turn's user message WITH context injected.
    const session = sessions[sessionId];
    const messages = [
      { role: 'system', content: session.systemPrompt },
      // Replay previous turns as clean Q&A so the model remembers the conversation
      ...session.turns.flatMap(turn => [
        { role: 'user', content: turn.question },
        { role: 'assistant', content: turn.answer },
      ]),
      // Current turn: inject fresh context only for this question
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ];

    // 3. Call LLM
    const response = await openai.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      max_tokens: 1024,
      messages,
    });

    const answer = response.choices?.[0]?.message?.content || 'No answer generated by the model.';

    // 4. Save the clean Q&A pair (NOT the context blob) to history
    session.turns.push({ question, answer });

    res.json({ answer, sources: sources.slice(0, 3) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message || 'Something went wrong' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  const isEnvConfigured = Boolean(process.env.OPENROUTER_API_KEY && process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME);
  res.json({
    status: isEnvConfigured ? 'ok' : 'misconfigured',
    index: process.env.PINECONE_INDEX_NAME || null,
    envConfigured: isEnvConfigured
  });
});

// ── Global error handler ───────────────────────────────────────────────────
// IMPORTANT: This MUST be registered BEFORE the catch-all fallback below,
// otherwise Express error-forwarding (e.g. Multer fileFilter rejections)
// gets swallowed by the catch-all and serves index.html instead of JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌  Unhandled error:', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── API 404 guard ────────────────────────────────────────────────────────────
// Unknown /api/* routes should return JSON 404, not the HTML page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── Fallback route (serves index.html for root and SPA routes) ───────────────
app.use((req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀  DocMind running at → http://localhost:${PORT}\n`);
  });
}

export default app;
