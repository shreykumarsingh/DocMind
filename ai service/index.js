import * as dotenv from 'dotenv';
dotenv.config();

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';

// ── Startup checks ──────────────────────────────────────────────────────────
if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌  Missing OPENROUTER_API_KEY in .env');
  process.exit(1);
}
if (!process.env.PINECONE_API_KEY) {
  console.error('❌  Missing PINECONE_API_KEY in .env');
  process.exit(1);
}
if (!process.env.PINECONE_INDEX_NAME) {
  console.error('❌  Missing PINECONE_INDEX_NAME in .env');
  process.exit(1);
}

async function indexDocument() {
  try {
    // 1. Load PDF
    const PDF_PATH = './result.pdf';
    const pdfLoader = new PDFLoader(PDF_PATH);
    const rawDocs = await pdfLoader.load();
    console.log(`✅  PDF loaded  (${rawDocs.length} pages)`);

    // 2. Split into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
    console.log(`✅  Chunking completed  (${chunkedDocs.length} chunks)`);

    // 3. Embeddings via OpenRouter
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      model: 'text-embedding-3-small',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
    });
    console.log('✅  Embedding model configured');

    // 4. Pinecone setup
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    console.log('✅  Pinecone configured');

    // 5. Store vectors
    console.log('⏳  Uploading vectors to Pinecone...');
    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
      pineconeIndex,
      maxConcurrency: 5,
    });

    console.log('🎉  Data stored successfully in Pinecone!');
  } catch (err) {
    if (err.status === 401) {
      console.error('❌  Authentication failed — your OPENROUTER_API_KEY is invalid or expired.');
      console.error('    Get a new key at: https://openrouter.ai/keys');
    } else if (err.status === 404) {
      console.error(`❌  Pinecone index "${process.env.PINECONE_INDEX_NAME}" not found.`);
      console.error('    Create it at: https://app.pinecone.io');
    } else {
      console.error('❌  Error:', err.message || err);
    }
    process.exit(1);
  }
}

indexDocument();
