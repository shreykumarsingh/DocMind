import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR);

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

// ── Shared clients ───────────────────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  model: 'text-embedding-3-small',
  configuration: { baseURL: 'https://openrouter.ai/api/v1' },
});

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

// ── State ────────────────────────────────────────────────────────────────────
const sessions = {};
let docState = {
  filename: null,
  pages: 0,
  chunks: 0,
  indexed: false,
  indexing: false,
};

// Check if there's already data in Pinecone from a previous run
(async () => {
  try {
    const stats = await pineconeIndex.describeIndexStats();
    const totalVectors = stats.totalRecordCount || 0;
    if (totalVectors > 0) {
      docState.indexed = true;
      docState.chunks = totalVectors;
      docState.filename = 'result.pdf';
      docState.pages = 22;
      console.log(`📄  Found ${totalVectors} existing vectors in Pinecone`);
    }
  } catch { /* ignore */ }
})();

// ── Upload & Index endpoint ──────────────────────────────────────────────────
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (docState.indexing) return res.status(409).json({ error: 'Indexing already in progress' });

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  // Start indexing
  docState.indexing = true;
  docState.indexed = false;
  docState.filename = originalName;

  // Respond immediately — indexing happens in background
  res.json({ status: 'indexing', filename: originalName });

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

    // 3. Clear old vectors
    try { await pineconeIndex.deleteAll(); } catch { /* OK if empty */ }
    console.log('✅  Cleared old vectors');

    // 4. Embed & store
    console.log('⏳  Uploading vectors to Pinecone...');
    await PineconeStore.fromDocuments(chunks, embeddings, {
      pineconeIndex,
      maxConcurrency: 5,
    });

    // 5. Clear all chat sessions (old context is gone)
    Object.keys(sessions).forEach(k => delete sessions[k]);

    docState.indexed = true;
    docState.indexing = false;
    console.log(`🎉  "${originalName}" indexed successfully!`);
  } catch (err) {
    docState.indexing = false;
    console.error('❌  Indexing failed:', err.message);
  }

  // Cleanup uploaded file
  try { unlinkSync(filePath); } catch { /* OK */ }
});

// ── Document status ──────────────────────────────────────────────────────────
app.get('/api/status', (_, res) => res.json(docState));

// ── Chat endpoint ────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { question, sessionId } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: 'No question provided' });
  if (!docState.indexed) return res.status(400).json({ error: 'No document indexed yet. Please upload a PDF first.' });

  if (!sessions[sessionId]) {
    sessions[sessionId] = [
      {
        role: 'system',
        content: `You are a helpful assistant.
Answer the user's question based ONLY on the provided context.
If the answer is not in the context, say "I could not find the answer in the provided document."
Keep your answers clear, concise, and educational.`,
      },
    ];
  }

  try {
    const queryVector = await embeddings.embedQuery(question);
    const searchResults = await pineconeIndex.query({
      topK: 8,
      vector: queryVector,
      includeMetadata: true,
    });

    const sources = searchResults.matches.map((m) => ({
      text: m.metadata.text,
      score: Math.round(m.score * 100),
    }));

    const context = sources.map((s) => s.text).join('\n\n---\n\n');

    sessions[sessionId].push({
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    });

    const response = await openai.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      max_tokens: 1024,
      messages: sessions[sessionId],
    });

    const answer = response.choices[0].message.content;
    sessions[sessionId].push({ role: 'assistant', content: answer });

    res.json({ answer, sources: sources.slice(0, 3) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message || 'Something went wrong' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', index: process.env.PINECONE_INDEX_NAME }));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  DocMind running at → http://localhost:${PORT}\n`);
});
