'use strict';
// Generates a tagged stereo FLAC test tone (needs macOS afconvert). Usage: node scripts/make-test-flac.js out.flac
const fs = require('fs');
const { execFileSync } = require('child_process');
const out = process.argv[2] || 'test.flac';
const wav = out.replace(/\.flac$/, '') + '.wav';
const sr = 44100, secs = 8, n = sr * secs;
const buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  const t = i / sr, f = 220 + 660 * (t / secs);
  const v = Math.sin(2 * Math.PI * f * t) * 0.4 + Math.sin(2 * Math.PI * 110 * t) * 0.3;
  const s = Math.round(v * 32767);
  buf.writeInt16LE(s, 44 + i * 4); buf.writeInt16LE(Math.round(s * 0.8), 46 + i * 4);
}
fs.writeFileSync(wav, buf);
execFileSync('afconvert', ['-f', 'flac', '-d', 'flac', wav, out]);
const f = fs.readFileSync(out);
let pos = 4; const blocks = [];
for (;;) { const h = f[pos], last = !!(h & 0x80), type = h & 0x7f, len = (f[pos + 1] << 16) | (f[pos + 2] << 8) | f[pos + 3]; blocks.push({ type, body: f.subarray(pos + 4, pos + 4 + len) }); pos += 4 + len; if (last) break; }
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const tags = ['TITLE=Test Tone Sweep', 'ARTIST=Sine Wave Orchestra', 'ALBUM=FLACCER Test'];
const vendor = Buffer.from('flaccer');
const parts = [u32(vendor.length), vendor, u32(tags.length)];
for (const t of tags) { const b = Buffer.from(t, 'utf8'); parts.push(u32(b.length), b); }
const kept = blocks.filter((b) => b.type !== 4);
kept.splice(1, 0, { type: 4, body: Buffer.concat(parts) });
const outParts = [Buffer.from('fLaC')];
kept.forEach((b, i) => { const h = Buffer.alloc(4); h[0] = (i === kept.length - 1 ? 0x80 : 0) | b.type; h[1] = b.body.length >> 16; h[2] = (b.body.length >> 8) & 255; h[3] = b.body.length & 255; outParts.push(h, b.body); });
outParts.push(f.subarray(pos));
fs.writeFileSync(out, Buffer.concat(outParts));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
