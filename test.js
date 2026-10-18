// Offline check of file loading + citation metadata (no API keys needed): npm test
import assert from 'assert';
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { loadChunks } from './rag.js';

// Smallest valid .docx: content types, root rels, one paragraph.
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Quarterly revenue grew 12%.</w:t></w:r></w:p></w:body></w:document>');
const docx = await zip.generateAsync({ type: 'nodebuffer' });

const pdf = await loadChunks(readFileSync('result.pdf'), 'result.pdf');
assert(pdf[0].metadata.pages > 0, 'pdf has page count');
assert(pdf.every((c) => /^p\. \d+$/.test(c.metadata.loc)), 'every pdf chunk cites a page');
assert.equal(pdf[0].metadata.chunks, pdf.length);

const csv = await loadChunks(Buffer.from('name,price\nApple,"1,20"\nPear,2'), 'fruit.csv');
assert.deepEqual(csv.map((c) => [c.pageContent, c.metadata.loc]), [['name: Apple\nprice: 1,20', 'row 1'], ['name: Pear\nprice: 2', 'row 2']]);

const txt = await loadChunks(Buffer.from('hello world'), 'notes.TXT');
assert.deepEqual(txt[0].metadata, { filename: 'notes.TXT', chunks: 1 });

const word = await loadChunks(docx, 'report.docx');
assert.equal(word[0].pageContent, 'Quarterly revenue grew 12%.');

await assert.rejects(loadChunks(Buffer.from('x'), 'virus.exe'), { status: 400 });
await assert.rejects(loadChunks(Buffer.from('   '), 'empty.txt'), /No text found/);
await assert.rejects(loadChunks(Buffer.from('not a pdf'), 'bad.pdf'), { status: 400, message: /Could not read bad\.pdf/ });
await assert.rejects(loadChunks(Buffer.from('not a zip'), 'bad.docx'), { status: 400, message: /Could not read bad\.docx/ });

console.log(`✅  loaders ok — pdf: ${pdf.length} chunks over ${pdf[0].metadata.pages} pages; csv, txt, docx, rejects`);
