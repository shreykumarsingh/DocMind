import * as dotenv from 'dotenv';
dotenv.config();
import readlineSync from 'readline-sync';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});
const History = [];

async function chatting(question) {
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    model: 'text-embedding-3-small',
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
  });

  const queryVector = await embeddings.embedQuery(question);

  const pinecone = new Pinecone();
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

  const searchResults = await pineconeIndex.query({
    topK: 10,
    vector: queryVector,
    includeMetadata: true,
  });

  const context = searchResults.matches
    .map(match => match.metadata.text)
    .join("\n\n---\n\n");

  History.push({
    role: 'user',
    content: `You are a helpful assistant.
    You will be given a context of relevant information and a user question.
    Your task is to answer the user's question based ONLY on the provided context.
    If the answer is not in the context, you must say "I could not find the answer in the provided document."
    Keep your answers clear, concise, and educational.
      
      Context: ${context}
      
      Question: ${question}`
  });

  const response = await openai.chat.completions.create({
    model: 'google/gemini-2.0-flash-001',
    messages: History,
  });

  const responseText = response.choices[0].message.content;
  History.push({
    role: 'assistant',
    content: responseText
  });

  console.log("\n");
  console.log(responseText);
}

async function main() {
  const userProblem = readlineSync.question("Ask me anything--> ");
  await chatting(userProblem);
  main();
}

main();
