import * as dotenv from 'dotenv';
dotenv.config();

import readlineSync from 'readline-sync';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

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

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// ── Conversation history ────────────────────────────────────────────────────
const History = [
  {
    role: 'system',
    content: `You are a helpful assistant.
You will be given a context of relevant information and a user question.
Your task is to answer the user's question based ONLY on the provided context.
If the answer is not in the context, say "I could not find the answer in the provided document."
Keep your answers clear, concise, and educational.`,
  },
];

// ── Embedding + Pinecone client (created once, reused each query) ──────────
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  model: 'text-embedding-3-small',
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1',
  },
});

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

// ── Core RAG function ───────────────────────────────────────────────────────
async function chatting(question) {
  try {
    // 1. Embed the question
    const queryVector = await embeddings.embedQuery(question);

    // 2. Semantic search in Pinecone
    const searchResults = await pineconeIndex.query({
      topK: 10,
      vector: queryVector,
      includeMetadata: true,
    });

    const context = searchResults.matches
      .map((match) => match.metadata.text)
      .join('\n\n---\n\n');

    // 3. Add user message with context injected
    History.push({
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    });

    // 4. Call LLM
    const response = await openai.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      max_tokens: 1024,
      messages: History,
    });

    const responseText = response.choices[0].message.content;

    // 5. Save assistant reply to history
    History.push({
      role: 'assistant',
      content: responseText,
    });

    console.log('\n🤖  ' + responseText + '\n');
  } catch (err) {
    if (err.status === 401) {
      console.error('\n❌  Authentication failed — your OPENROUTER_API_KEY is invalid or expired.');
      console.error('    Get a new key at: https://openrouter.ai/keys\n');
    } else {
      console.error('\n❌  Error:', err.message || err, '\n');
    }
  }
}

// ── Main loop (while loop avoids stack overflow) ────────────────────────────
async function main() {
  console.log('\n🚀  RAG Chatbot ready! Type your question or press Ctrl+C to exit.\n');
  while (true) {
    const userQuestion = readlineSync.question('You ➜  ');
    if (!userQuestion.trim()) continue;
    await chatting(userQuestion);
  }
}

main();
