'use strict';
// Minimal FLAC metadata reader: STREAMINFO (sample rate, channels, bit depth,
// duration) and VORBIS_COMMENT (title/artist/album/...). No dependencies.
const fs = require('fs');

function readFlacMeta(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const magic = Buffer.alloc(4);
    if (fs.readSync(fd, magic, 0, 4, 0) < 4 || magic.toString('latin1') !== 'fLaC') return null;
    let pos = 4;
    const out = { tags: {} };
    for (let i = 0; i < 64; i++) {
      const h = Buffer.alloc(4);
      if (fs.readSync(fd, h, 0, 4, pos) < 4) break;
      const last = !!(h[0] & 0x80);
      const type = h[0] & 0x7f;
      const len = (h[1] << 16) | (h[2] << 8) | h[3];
      pos += 4;
      if (type === 0 && len >= 34) {
        const b = Buffer.alloc(34);
        fs.readSync(fd, b, 0, 34, pos);
        const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
        const channels = ((b[12] >> 1) & 7) + 1;
        const bitsPerSample = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
        const totalSamples = (b[13] & 0x0f) * 2 ** 32 + b.readUInt32BE(14);
        out.sampleRate = sampleRate;
        out.channels = channels;
        out.bitsPerSample = bitsPerSample;
        out.totalSamples = totalSamples;
        out.duration = sampleRate ? totalSamples / sampleRate : 0;
      } else if (type === 4 && len < 16 * 1024 * 1024) {
        const b = Buffer.alloc(len);
        fs.readSync(fd, b, 0, len, pos);
        let p = 0;
        if (len >= 8) {
          const vl = b.readUInt32LE(p); p += 4 + vl;
          if (p + 4 <= len) {
            const n = b.readUInt32LE(p); p += 4;
            for (let k = 0; k < n && p + 4 <= len; k++) {
              const l = b.readUInt32LE(p); p += 4;
              if (p + l > len) break;
              const s = b.toString('utf8', p, p + l); p += l;
              const eq = s.indexOf('=');
              if (eq > 0) {
                const key = s.slice(0, eq).toLowerCase();
                if (!(key in out.tags)) out.tags[key] = s.slice(eq + 1);
              }
            }
          }
        }
      }
      pos += len;
      if (last) break;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { readFlacMeta };
