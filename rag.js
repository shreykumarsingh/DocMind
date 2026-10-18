// Shared RAG core used by server.js and the CLI scripts.
// Each uploaded document lives in its own Pinecone namespace (namespace = doc id).
import 'dotenv/config';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Document } from '@langchain/core/documents';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import OpenAI from 'openai';

const BASE_URL = 'https://openrouter.ai/api/v1';
// Free models are often overloaded, so OpenRouter falls back down this list on errors.
// They also get retired (an unknown ID fails every request): override with
// OPENROUTER_MODELS=model-a,model-b in .env — current free IDs: https://openrouter.ai/models?q=free
export const MODELS = (process.env.OPENROUTER_MODELS
  || 'nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free')
  .split(',').map((m) => m.trim()).filter(Boolean);
const TOP_K = 8;

const SYSTEM_PROMPT = `You are a helpful assistant.
Answer the user's question based ONLY on the provided context.
Each context passage starts with a label like [report.pdf, p. 3]. Cite the passages you use inline with that exact label.
If the answer is not in the context, say "I could not find the answer in the provided documents."
Keep your answers clear, concise, and educational.`;

// ── Env + clients (lazy, so the server can boot and report missing keys) ─────
export const missingEnv = () =>
  ['OPENROUTER_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX_NAME'].filter((k) => !process.env[k]);

export function requireEnv() {
  const missing = missingEnv();
  if (missing.length) {
    console.error(`❌  Missing ${missing.join(', ')} in .env`);
    process.exit(1);
  }
}

const index = () => new Pinecone({ apiKey: process.env.PINECONE_API_KEY }).Index(process.env.PINECONE_INDEX_NAME);
const openai = () => new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: BASE_URL });
const embeddings = () => new OpenAIEmbeddings({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'text-embedding-3-small',
  configuration: { baseURL: BASE_URL },
});

// ── Loading ─────────────────────────────────────────────────────────────────
const LOADERS = {
  '.pdf': (blob) => new PDFLoader(blob).load(),   // one Document per page
  '.docx': (blob) => new DocxLoader(blob).load(),
  '.csv': (blob) => new CSVLoader(blob).load(),   // one Document per row
  '.txt': async (blob) => [new Document({ pageContent: await blob.text() })],
};
export const SUPPORTED = Object.keys(LOADERS);

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

// Load + chunk a file. Every chunk gets flat metadata: filename, chunk count,
// page count (PDF) and `loc`, the citation label ("p. 3" for PDF, "row 12" for CSV).
export async function loadChunks(buffer, filename) {
  const ext = extname(filename).toLowerCase();
  if (!LOADERS[ext]) throw badRequest(`Unsupported file type "${ext}". Supported: ${SUPPORTED.join(', ')}`);

  let raw;
  try {
    raw = await LOADERS[ext](new Blob([buffer]));
  } catch (err) {
    throw badRequest(`Could not read ${filename}: ${err.message}`); // corrupt / mislabeled file
  }
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const chunks = await splitter.splitDocuments(raw);
  if (!chunks.length) throw badRequest(`No text found in ${filename}`);

  const docMeta = { filename, chunks: chunks.length };
  if (ext === '.pdf') docMeta.pages = raw.length;
  for (const chunk of chunks) {
    const { loc, line } = chunk.metadata;
    chunk.metadata = { ...docMeta };
    if (loc?.pageNumber) chunk.metadata.loc = `p. ${loc.pageNumber}`;
    else if (line) chunk.metadata.loc = `row ${line}`;
  }
  return chunks;
}

// ── Documents ───────────────────────────────────────────────────────────────
export async function indexFile(buffer, filename) {
  const chunks = await loadChunks(buffer, filename);
  const id = randomUUID();
  try {
    // ponytail: one embedding per chunk/CSV row; very large CSVs will be slow — batch rows if that bites
    await new PineconeStore(embeddings(), { pineconeIndex: index(), maxConcurrency: 5 })
      .addDocuments(chunks, { ids: chunks.map((_, i) => String(i)), namespace: id });
    await waitUntilSearchable(id);
  } catch (err) {
    await deleteDoc(id).catch(() => {}); // don't leave a half-indexed document behind
    throw err;
  }
  const { loc, ...doc } = chunks[0].metadata;
  return { id, ...doc };
}

export const listNamespaces = async () => Object.keys((await index().describeIndexStats()).namespaces || {});

// Pinecone serverless is eventually consistent: new vectors take ~2–15s to show up in
// index stats (which retrieve() uses to find documents) and in queries. Wait for both so
// "indexed" means "answerable". Gives up after ~30s; the doc then becomes searchable shortly.
async function waitUntilSearchable(ns) {
  const idx = index();
  for (let i = 0; i < 30; i++) {
    const [namespaces, { matches = [] }] = await Promise.all([
      listNamespaces(),
      idx.namespace(ns).query({ id: '0', topK: 1 }),
    ]);
    if (namespaces.includes(ns) && matches.length) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function listDocs() {
  const idx = index();
  const { namespaces = {} } = await idx.describeIndexStats();
  return Promise.all(Object.entries(namespaces).map(async ([id, { recordCount }]) => {
    // Chunk "0" carries the doc-level metadata; vectors from older versions have none.
    const { records } = await idx.namespace(id).fetch(['0']);
    const { filename = 'Untitled', pages, chunks = recordCount } = records['0']?.metadata || {};
    return { id, filename, pages, chunks };
  }));
}

export async function deleteDoc(id) {
  try {
    await index().namespace(id).deleteAll();
  } catch (err) {
    if (err.name !== 'PineconeNotFoundError') throw err; // already empty
  }
}

// ── Retrieval + generation ──────────────────────────────────────────────────
export const label = (s) => (s.loc ? `${s.filename}, ${s.loc}` : s.filename);

// Search every document and keep the global top K.
// ponytail: one query per namespace; move to a single namespace + docId filter past ~50 docs
export async function retrieve(question) {
  const idx = index();
  const [vector, namespaces] = await Promise.all([embeddings().embedQuery(question), listNamespaces()]);
  const results = await Promise.all(namespaces.map((ns) =>
    idx.namespace(ns).query({ topK: TOP_K, vector, includeMetadata: true })));
  return results
    .flatMap((r) => r.matches ?? [])
    .filter((m) => typeof m.metadata?.text === 'string')
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map(({ metadata: m, score }) => ({
      text: m.text,
      filename: m.filename || 'Untitled',
      loc: m.loc,
      score: Math.round(score * 100),
    }));
}

// history: clean [{ role, content }] Q&A turns — context is injected only for the current question.
export function buildMessages(question, sources, history = []) {
  const context = sources.map((s) => `[${label(s)}]\n${s.text}`).join('\n\n---\n\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
  ];
}

// Yields answer text token by token. Aborting `signal` stops the upstream request.
export async function* streamAnswer(messages, signal) {
  const stream = await openai().chat.completions.create(
    { model: MODELS[0], models: MODELS, max_tokens: 1024, messages, stream: true },
    { signal },
  );
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
