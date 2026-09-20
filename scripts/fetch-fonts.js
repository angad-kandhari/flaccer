'use strict';
// Downloads the Google Fonts used by the design (VT323, Silkscreen) so the app works offline.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'renderer', 'fonts');
const CSS = 'https://fonts.googleapis.com/css2?family=VT323&family=Silkscreen:wght@400;700&display=swap';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  let css = await (await fetch(CSS, { headers: { 'user-agent': UA } })).text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  let i = 0;
  for (const u of urls) {
    const name = 'f' + (i++) + '.woff2';
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    fs.writeFileSync(path.join(dir, name), buf);
    css = css.split(u).join(name);
  }
  fs.writeFileSync(path.join(dir, 'fonts.css'), css);
  console.log('saved', urls.length, 'font files');
})();
