// Builds the single-file app: dist/chord-chemist.html (standalone, fonts inlined for offline use)
// and dist/artifact.html (fragment for the claude.ai artifact viewer, fonts linked).
// Usage: node build.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Limelight&family=Special+Elite&family=VT323&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap';
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

async function inlineFonts() {
  const cache = path.join(__dirname, '.fonts-cache.css');
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  const css = await (await fetch(FONTS_URL, { headers: { 'User-Agent': ua } })).text();
  // Keep only the basic latin subset; other glyphs (♭ ♯) fall back to system fonts anyway.
  const blocks = css.split(/(?=\/\* )/).filter((b) => b.startsWith('/* latin */'));
  let out = '';
  for (const b of blocks) {
    const url = /url\((https:[^)]+)\)/.exec(b)[1];
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    out += b.replace(url, 'data:font/woff2;base64,' + buf.toString('base64'));
  }
  fs.writeFileSync(cache, out);
  return out;
}

// Jazz guitar samples (one MP3 per MIDI note) embedded as base64, so the app works offline.
function samplesScript() {
  const dir = path.join(__dirname, 'samples', 'jazz-guitar');
  const notes = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mp3'))) {
    notes[parseInt(f, 10)] = fs.readFileSync(path.join(dir, f)).toString('base64');
  }
  return `<script>window.CCSamples = ${JSON.stringify({ name: 'FluidR3 GM jazz guitar (CC BY 3.0)', notes })};</script>`;
}

(async () => {
  const scripts = [samplesScript()].concat(['theory.js', 'voicings.js', 'audio.js', 'app.js']
    .map((f) => `<script>\n${read(f)}</script>`)).join('\n');
  const png = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, f)).toString('base64');
  const page = read('index.html').replace('<!--STYLE-->', `<style>\n${read('style.css')}</style>`)
    .replace('<!--SPLASH-->', png('splash-light.png'))
    .replace('<!--SCRIPTS-->', scripts);
  fs.mkdirSync(DIST, { recursive: true });

  let fontCss = '';
  try { fontCss = await inlineFonts(); } catch (e) { console.warn('Fonts not inlined (offline?):', e.message); }
  const standalone = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    page.replace('<!--FONTS-->', fontCss ? `<style>\n${fontCss}</style>` : `<link rel="stylesheet" href="${FONTS_URL}">`) + '</html>\n';
  fs.writeFileSync(path.join(DIST, 'chord-chemist.html'), standalone);

  const artifact = page.replace('<!--FONTS-->',
    `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="${FONTS_URL}" media="print" onload="this.media='all'">`);
  fs.writeFileSync(path.join(DIST, 'artifact.html'), artifact);
  console.log('Built dist/chord-chemist.html (%d KB) and dist/artifact.html (%d KB)',
    Math.round(standalone.length / 1024), Math.round(artifact.length / 1024));
})();
