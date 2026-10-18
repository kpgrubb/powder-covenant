// Generates a silent 16-bit mono WAV for every key in src/data/sounds.json.
// Run: node scripts/gen-silent-audio.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sounds = JSON.parse(readFileSync(join(root, 'src/data/sounds.json'), 'utf8'));

const sampleRate = 22050;
const samples = 2205; // 0.1 s
const dataBytes = samples * 2;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(sampleRate * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);

let n = 0;
for (const [key, rel] of Object.entries(sounds)) {
  if (key.startsWith('_')) continue;
  const out = join(root, 'public', rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  n++;
}
console.log(`wrote ${n} silent wav files`);
