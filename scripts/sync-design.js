'use strict';
// Copies the <x-dc> markup out of the Claude Design export into renderer/template.html.
// The player logic lives in renderer/player.js (ported by hand from the design's x-dc script).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'FLACCER v2.dc.html');
const dst = path.join(__dirname, '..', 'renderer', 'template.html');
const html = fs.readFileSync(src, 'utf8');
const m = html.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
if (!m) throw new Error('no <x-dc> block found in ' + src);
fs.writeFileSync(dst, '<!-- Generated from "FLACCER v2.dc.html" by scripts/sync-design.js. Edit the design, not this file. -->\n<x-dc>' + m[1] + '</x-dc>\n');
const s = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
if (s) fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'design-logic.reference.js'), '// Reference copy of the design\'s x-dc script (not loaded by the app). Diff against player.js after a design update.\n' + s[1].trim() + '\n');
console.log('wrote', dst);
