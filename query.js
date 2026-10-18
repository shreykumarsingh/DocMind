// Terminal chatbot over every indexed document: npm run query
import { createInterface } from 'readline';
import { requireEnv, retrieve, buildMessages, streamAnswer } from './rag.js';

requireEnv();

const history = []; // clean Q&A turns, no context blobs
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'You ➜  ' });

console.log('\n🚀  RAG Chatbot ready! Type your question or press Ctrl+C to exit.\n');
rl.prompt();
for await (const question of rl) {
  if (!question.trim()) { rl.prompt(); continue; }
  try {
    const sources = await retrieve(question);
    if (!sources.length) {
      console.log('\nℹ️   No documents indexed yet. Run `npm run index` first.\n');
      continue;
    }
    let answer = '';
    process.stdout.write('\n🤖  ');
    for await (const delta of streamAnswer(buildMessages(question, sources, history.slice(-10)))) {
      process.stdout.write(delta);
      answer += delta;
    }
    process.stdout.write('\n\n');
    history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
  } catch (err) {
    if (err.status === 401) console.error('\n❌  OPENROUTER_API_KEY is invalid or expired. Get a new key at https://openrouter.ai/keys\n');
    else console.error('\n❌  Error:', err.message || err, '\n');
  } finally {
    rl.prompt();
  }
}
