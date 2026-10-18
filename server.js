import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import {
  missingEnv, SUPPORTED, MODELS, indexFile, listDocs, deleteDoc,
  retrieve, label, buildMessages, streamAnswer,
} from './rag.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Log warning on boot if env vars are missing
if (missingEnv().length) console.error(`❌  Missing environment variable(s): ${missingEnv().join(', ')}`);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Multer config (in memory — no temp files to clean up) ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // browsers send UTF-8 filenames; multer defaults to latin1 (mojibake)
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_, file, cb) => {
    if (SUPPORTED.includes(extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error(`Supported file types: ${SUPPORTED.join(', ')}`), { status: 400 }));
  },
});

// ── Every API route except /health needs the keys ───────────────────────────
app.use('/api', (req, res, next) => {
  const missing = missingEnv();
  if (req.path === '/health' || !missing.length) return next();
  res.status(500).json({
    error: `Missing environment variable(s): ${missing.join(', ')}. Please set them in Vercel project settings or .env file.`,
  });
});

// ── Documents ───────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const doc = await indexFile(req.file.buffer, req.file.originalname);
  console.log(`🎉  "${doc.filename}" indexed (${doc.chunks} chunks)`);
  res.json(doc);
});

app.get('/api/docs', async (req, res) => {
  res.json(await listDocs());
});

// id is a query param because docs indexed by older versions live in the "" namespace
app.delete('/api/docs', async (req, res) => {
  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });
  await deleteDoc(id);
  res.json({ status: 'deleted' });
});

// ── Chat (streams NDJSON: {sources} first, then {delta}…, or {error}) ───────
// The client owns chat history; accept only the last 10 plain user/assistant turns.
const cleanHistory = (history) => (Array.isArray(history) ? history : [])
  .filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string')
  .slice(-10)
  .map(({ role, content }) => ({ role, content }));

app.post('/api/chat', async (req, res) => {
  const { question, history } = req.body ?? {}; // undefined when the request isn't JSON
  if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'No question provided' });

  const sources = await retrieve(question);
  if (!sources.length) return res.status(400).json({ error: 'No documents indexed yet. Please upload a file first.' });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (event) => res.write(JSON.stringify(event) + '\n');

  // One source per citation label (best-scoring chunk), with a short preview.
  const seen = new Set();
  send({
    sources: sources
      .filter((s) => !seen.has(label(s)) && seen.add(label(s)))
      .map((s) => ({ ...s, text: s.text.slice(0, 200) })),
  });

  // Stop generating (and spending rate limit) if the browser goes away mid-answer.
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  try {
    const messages = buildMessages(question, sources, cleanHistory(history));
    for await (const delta of streamAnswer(messages, abort.signal)) send({ delta });
  } catch (err) {
    if (abort.signal.aborted) return;
    console.error('❌  Chat failed:', err.message);
    send({ error: err.message || 'Something went wrong' });
  }
  res.end();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  const envConfigured = !missingEnv().length;
  res.json({
    status: envConfigured ? 'ok' : 'misconfigured',
    index: process.env.PINECONE_INDEX_NAME || null,
    models: MODELS,
    envConfigured,
  });
});

// ── Global error handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌  Unhandled error:', err.message);
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── API 404 guard ────────────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── Fallback route (serves index.html for root and SPA routes) ───────────────
app.use((req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  const initialPort = parseInt(process.env.PORT || '3000', 10);
  const startServer = (port) => {
    const server = app.listen(port, () => {
      console.log(`\n🚀  DocMind running at → http://localhost:${port}\n`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Port ${port} is in use, trying port ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('❌  Server error:', err.message);
      }
    });
  };
  startServer(initialPort);
}

export default app;
