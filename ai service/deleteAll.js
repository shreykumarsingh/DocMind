import * as dotenv from 'dotenv';
dotenv.config();
import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_API_KEY) {
  console.error('❌  Missing PINECONE_API_KEY in .env');
  process.exit(1);
}
if (!process.env.PINECONE_INDEX_NAME) {
  console.error('❌  Missing PINECONE_INDEX_NAME in .env');
  process.exit(1);
}

async function deleteAll() {
  try {
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    await index.deleteAll();
    console.log(`✅  All vectors deleted successfully from index: ${process.env.PINECONE_INDEX_NAME}`);
  } catch (err) {
    // PineconeNotFoundError means the index is already empty — not a fatal error.
    // Note: err.status is undefined on this error, so we check err.name.
    if (err.name === 'PineconeNotFoundError') {
      console.log('ℹ️   Index is already empty — nothing to delete.');
    } else {
      console.error('❌  Error deleting vectors:', err.message || err);
      process.exit(1);
    }
  }
}

deleteAll();
