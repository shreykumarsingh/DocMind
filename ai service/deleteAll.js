import * as dotenv from 'dotenv';
dotenv.config();
import { Pinecone } from '@pinecone-database/pinecone';

async function deleteAll() {
  const pinecone = new Pinecone();
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

  await index.deleteAll();

  console.log('All vectors deleted successfully');
}

deleteAll();
