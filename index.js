// Index a file into Pinecone: npm run index [-- path/to/file.pdf|.docx|.txt|.csv]
import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import { requireEnv, indexFile } from './rag.js';

requireEnv();

const file = process.argv[2] || './result.pdf';
if (!existsSync(file)) {
  console.error(`❌  File not found: ${file}`);
  process.exit(1);
}

try {
  console.log(`⏳  Indexing ${file}...`);
  const doc = await indexFile(readFileSync(file), basename(file));
  console.log(`🎉  Indexed "${doc.filename}" — ${doc.chunks} chunk${doc.chunks === 1 ? '' : 's'} (id ${doc.id})`);
} catch (err) {
  if (err.status === 401) console.error('❌  OPENROUTER_API_KEY is invalid or expired. Get a new key at https://openrouter.ai/keys');
  else console.error('❌  Error:', err.message || err);
  process.exit(1);
}
