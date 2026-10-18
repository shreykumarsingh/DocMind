// Wipe every document (namespace) from the Pinecone index: npm run delete
import { requireEnv, listNamespaces, deleteDoc } from './rag.js';

requireEnv();

try {
  const namespaces = await listNamespaces();
  for (const ns of namespaces) await deleteDoc(ns);
  console.log(`✅  Deleted ${namespaces.length} document(s) from index: ${process.env.PINECONE_INDEX_NAME}`);
} catch (err) {
  console.error('❌  Error deleting vectors:', err.message || err);
  process.exit(1);
}
