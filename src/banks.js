/* Chord Chemist — backing-track banks.
 *
 * The chart can be stored in one of four banks (A–D), each with its own tempo and repeat
 * count. A bank, or the whole set in order, plays in the app or exports as a WAV with an
 * optional count-in and metronome: a mini backing track to solo over outside the app.
 */
(function () {
  'use strict';
  const T = window.CCTheory, V = window.CCVoicings, A = window.CCAudio, App = window.CCApp, Store = window.CCStore;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STORE = 'chord-chemist-banks-v1';
  const LETTERS = ['A', 'B', 'C', 'D'];
  const MAX_REPEATS = 8, MAX_SET = 8, MIN_TEMPO = 40, MAX_TEMPO = 240;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+n) || lo));

  const MP3_KBPS = 160;
  const banks = { slots: [null, null, null, null], set: 1, countIn: 1, metro: false, format: 'mp3' };
  let playing = null;    // { bank, k }: which bank chord is sounding
  let exporting = false; // while the export dialog is open

  // ---------- persistence ----------

  function save() {
    Store.set(STORE, JSON.stringify(banks));
  }
  function valid(b) {
    return !!(b && T.TEMPLATE[b.tpl] && Array.isArray(b.bars) && b.bars.length === T.TEMPLATE[b.tpl].slots.length &&
      b.bars.every((x) => x && x.main));
  }
  function load() {
    try {
      const d = JSON.parse(Store.get(STORE) || 'null');
      if (!d) return;
      banks.slots = LETTERS.map((_, i) => (valid(d.slots && d.slots[i]) ? d.slots[i] : null));
      banks.set = clamp(d.set || 1, 1, MAX_SET);
      banks.countIn = clamp(d.countIn ?? 1, 0, 1); // none, or one bar
      banks.metro = !!d.metro;
      banks.format = d.format === 'wav' ? 'wav' : 'mp3';
    } catch (e) { /* ignore a broken store */ }
  }

  // ---------- a bank's music ----------

  const keyOf = (b) => T.keyForStart(T.TEMPLATE[b.tpl], b.start);
  const bankName = (b) => `${T.TEMPLATE[b.tpl].name} · ${T.pretty(keyOf(b).tonic)} ${keyOf(b).mode}`;

  /** The chords of a bank in playing order: [{ chord, v, beats, fn, rule, bar, part }]. */
  function chordsOf(b) {
    const out = [];
    const pick = (spec, vi) => {
      const chord = T.makeChord(spec[0], spec[1]);
      const list = V.voicings(chord);
      return { chord, v: list[vi] || list[0] };
    };
    b.bars.forEach((bar, i) => {
      out.push({ ...pick(bar.main, bar.mainV), beats: bar.split ? b.beats / 2 : b.beats, fn: bar.mainFn, rule: bar.mainRule, bar: i, part: 'main' });
      if (bar.split) out.push({ ...pick(bar.split, bar.splitV), beats: b.beats / 2, fn: bar.splitFn, rule: bar.splitRule, bar: i, part: 'split' });
    });
    return out;
  }
  const sheetText = (b) => b.bars.map((bar) => T.makeChord(bar.main[0], bar.main[1]).sym +
    (bar.split ? ' ' + T.makeChord(bar.split[0], bar.split[1]).sym : '')).join(' | ');

  /** Playback events for a bank played `repeats` times (see CCAudio.playSequence). */
  function eventsFor(b, bankIndex, repeats) {
    const list = chordsOf(b), evs = [];
    for (let r = 0; r < repeats; r++) {
      list.forEach((c, k) => evs.push({ midis: c.v.midi, beats: c.beats, tempo: b.tempo, style: b.style, bar: c.part === 'main', bank: bankIndex, k, c }));
    }
    return evs;
  }
  /** Every filled bank in order, each repeated its own number of times, the whole set `banks.set` times. */
  function setEvents() {
    const evs = [];
    for (let s = 0; s < banks.set; s++) banks.slots.forEach((b, i) => { if (b) evs.push(...eventsFor(b, i, b.repeats)); });
    return evs;
  }
  function countInEvents(bars, b) {
    const evs = [];
    for (let i = 0; i < bars; i++) evs.push({ midis: [], beats: b.beats, tempo: b.tempo, bar: true, count: true });
    return evs;
  }
  const filled = () => banks.slots.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const setLabel = () => filled().map((i) => `${LETTERS[i]} ×${banks.slots[i].repeats}`).join(' → ') + (banks.set > 1 ? `, ${banks.set} times` : '');

  // ---------- playback ----------

  /** Highlight the sounding bank and chord in place (no re-render, so a tempo being typed keeps its focus). */
  function markPlaying() {
    document.querySelectorAll('#bankRow .bank').forEach((art) => {
      const on = !!playing && playing.bank === +art.dataset.bank;
      art.classList.toggle('playing', on);
      art.querySelectorAll('.bc').forEach((el, k) => el.classList.toggle('now', on && playing.k === k));
    });
  }
  function play(evs, label) {
    if (!evs.length) return;
    evs.forEach((ev) => {
      ev.onStart = () => {
        playing = { bank: ev.bank, k: ev.k };
        markPlaying();
        App.show(ev.c.chord, ev.c.v, ev.c.fn, ev.c.rule, keyOf(banks.slots[ev.bank]));
      };
    });
    A.playSequence(evs, { onDone: () => { playing = null; markPlaying(); } });
    App.say(label);
  }
  // Anything that stops the sound (the Stop button, auditioning a chord, the chart playing) clears the highlight.
  A.onStop(() => { if (playing) { playing = null; markPlaying(); } });

  // ---------- rendering ----------

  function renderBank(b, i) {
    const L = LETTERS[i];
    const canStore = App.complete();
    if (!b) {
      return `<article class="bank empty" data-bank="${i}">
        <header class="bank-head"><span class="bank-letter">${L}</span><span class="bank-name">empty</span></header>
        <button class="bank-store" type="button" data-act="store" ${canStore ? '' : 'disabled'}>⤓ Store the chart here
          <small>${canStore ? 'keeps its chords, voicings, beats and strum' : 'fill every bar of the chart first'}</small></button>
      </article>`;
    }
    const list = chordsOf(b);
    const isNow = playing && playing.bank === i;
    let sheet = '';
    list.forEach((c, k) => {
      if (c.part === 'main') sheet += '<span class="bl">|</span>';
      sheet += `<span class="bc${c.part === 'split' ? ' pc' : ''}${isNow && playing.k === k ? ' now' : ''}">${esc(c.chord.sym)}</span>`;
    });
    sheet += '<span class="bl">|</span>';
    const bars = b.bars.length;
    return `<article class="bank filled${isNow ? ' playing' : ''}" data-bank="${i}">
      <header class="bank-head">
        <span class="bank-letter">${L}</span>
        <span class="bank-name" title="${esc(bankName(b))}">${esc(bankName(b))}</span>
        <span class="bank-actions">
          <button type="button" data-act="replace" title="Replace with the chart" aria-label="Replace bank ${L} with the chart" ${canStore ? '' : 'disabled'}>↻</button>
          <button type="button" data-act="clear" title="Clear this bank" aria-label="Clear bank ${L}">×</button>
        </span>
      </header>
      <div class="bank-sheet" aria-label="${esc(sheetText(b))}">${sheet}</div>
      <div class="bank-meta">${bars} bar${bars === 1 ? '' : 's'} · ${b.beats}/4 · ${b.style === 'four' ? 'four to the bar' : 'let ring'}</div>
      <div class="bank-knobs">
        <label>Tempo <span class="stepper"><button type="button" data-act="tempo" data-d="-4" aria-label="Slower">−</button><input type="number" min="${MIN_TEMPO}" max="${MAX_TEMPO}" value="${b.tempo}" aria-label="Tempo of bank ${L}, beats per minute"><button type="button" data-act="tempo" data-d="4" aria-label="Faster">+</button></span></label>
        <label>Play <span class="stepper"><button type="button" data-act="rep" data-d="-1" aria-label="Fewer repeats" ${b.repeats <= 1 ? 'disabled' : ''}>−</button><b>×${b.repeats}</b><button type="button" data-act="rep" data-d="1" aria-label="More repeats" ${b.repeats >= MAX_REPEATS ? 'disabled' : ''}>+</button></span></label>
        <span class="bank-time" title="Length when played ×${b.repeats}">${clock(A.seconds(eventsFor(b, i, b.repeats)))}</span>
      </div>
      <div class="bank-buttons">
        <button class="btn btn-play" type="button" data-act="play">▶ Play</button>
        <button class="btn" type="button" data-act="open" title="Load this bank into the chart to edit it">Open in chart</button>
      </div>
    </article>`;
  }

  function renderBanks() {
    $('bankRow').innerHTML = banks.slots.map(renderBank).join('');
    const idx = filled();
    $('setPlay').disabled = !idx.length;
    $('setExport').disabled = !idx.length;
    $('setCount').textContent = `×${banks.set}`;
    $('setInfo').textContent = idx.length ? `${setLabel()} · ${clock(A.seconds(setEvents()))}` : 'Store a chart in a bank to begin.';
  }

  // ---------- interactions ----------

  $('bankRow').addEventListener('click', (e) => {
    const art = e.target.closest('.bank');
    const btn = e.target.closest('[data-act]');
    if (!art || !btn) return;
    const i = +art.dataset.bank, b = banks.slots[i], L = LETTERS[i];
    const act = btn.dataset.act;
    if (act === 'store' || act === 'replace') {
      if (!App.complete()) return;
      banks.slots[i] = { ...App.snapshot(), repeats: b ? b.repeats : 4 };
      save();
      renderBanks();
      App.say(`${act === 'store' ? 'Chart stored in' : 'Chart replaced'} bank ${L}: ${sheetText(banks.slots[i])}. Set its tempo and repeats, then play or export it.`);
      return;
    }
    if (!b) return;
    if (act === 'clear') {
      if (playing && playing.bank === i) A.stopAll();
      banks.slots[i] = null;
      save();
      renderBanks();
      App.say(`Bank ${L} cleared.`);
    } else if (act === 'tempo') {
      b.tempo = clamp(b.tempo + +btn.dataset.d, MIN_TEMPO, MAX_TEMPO);
      save();
      renderBanks();
    } else if (act === 'rep') {
      b.repeats = clamp(b.repeats + +btn.dataset.d, 1, MAX_REPEATS);
      save();
      renderBanks();
    } else if (act === 'play') {
      play(eventsFor(b, i, b.repeats), `Playing bank ${L} ×${b.repeats} at ${b.tempo} bpm: ${sheetText(b)}`);
    } else if (act === 'open') {
      App.open(b);
      App.say(`Bank ${L} is in the chart. Edit it there, then press ↻ on the bank to store the new version.`);
    }
  });
  $('bankRow').addEventListener('change', (e) => {
    if (e.target.type !== 'number') return;
    const b = banks.slots[+e.target.closest('.bank').dataset.bank];
    if (!b) return;
    b.tempo = clamp(e.target.value, MIN_TEMPO, MAX_TEMPO);
    save();
    renderBanks();
  });

  $('setPlay').addEventListener('click', () => play(setEvents(), `Playing the set: ${setLabel()}.`));
  $('setExport').addEventListener('click', openExport);
  $('setReps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    banks.set = clamp(banks.set + +b.dataset.d, 1, MAX_SET);
    save();
    renderBanks();
  });

  // ---------- export: the whole set, as MP3 or WAV ----------

  const dlg = $('exportDlg');

  const setMusic = () => ({ first: banks.slots[filled()[0]], events: setEvents() });
  function fileName() {
    const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');
    return safe(`Chord Chemist - Set ${filled().map((i) => LETTERS[i]).join('')}${banks.set > 1 ? ' x' + banks.set : ''}.${banks.format}`);
  }
  function markSeg(id, choice) {
    $(id).querySelectorAll('[data-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.choice === choice)));
  }
  function status(msg, bad) {
    const el = $('exportStatus');
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
  }
  function describeExport() {
    const { first, events } = setMusic();
    const music = A.seconds(events);
    const total = music + banks.countIn * first.beats * 60 / first.tempo + 2.5; // + the ring-out
    $('exportWhat').textContent = `${setLabel()} · ${clock(music)}`;
    markSeg('format', banks.format);
    markSeg('countIn', String(banks.countIn));
    markSeg('metro', banks.metro ? 'on' : 'off');
    $('exportName').textContent = fileName();
    const mp3 = banks.format === 'mp3';
    const mb = (mp3 ? total * MP3_KBPS * 125 : total * A.sampleRate() * 4) / 1048576;
    const sound = $('voice').value === 'synth' ? 'plucked synth' : 'jazz guitar';
    $('exportSize').textContent = `${mp3 ? `MP3, ${MP3_KBPS} kbps stereo` : '16-bit stereo WAV'}, ${sound} · about ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
    $('exportGo').textContent = `⤓ Download ${banks.format.toUpperCase()}`;
  }
  function openExport() {
    if (!filled().length) return;
    exporting = true;
    A.ensure();
    describeExport();
    status('');
    $('exportGo').disabled = false;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  $('countIn').addEventListener('click', (e) => {
    const b = e.target.closest('[data-choice]');
    if (!b || !exporting) return;
    banks.countIn = +b.dataset.choice;
    save();
    describeExport();
  });
  $('metro').addEventListener('click', (e) => {
    const b = e.target.closest('[data-choice]');
    if (!b || !exporting) return;
    banks.metro = b.dataset.choice === 'on';
    save();
    describeExport();
  });
  $('format').addEventListener('click', (e) => {
    const b = e.target.closest('[data-choice]');
    if (!b || !exporting) return;
    banks.format = b.dataset.choice === 'wav' ? 'wav' : 'mp3';
    save();
    describeExport();
  });
  $('exportCancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { exporting = false; });
  $('exportGo').addEventListener('click', async () => {
    if (!exporting) return;
    const { first, events } = setMusic();
    const all = countInEvents(banks.countIn, first).concat(events);
    const name = fileName();
    $('exportGo').disabled = true;
    A.stopAll();
    status('Rendering…');
    try {
      const buf = await A.render(all, { clicks: banks.metro });
      const blob = banks.format === 'mp3'
        ? await encodeMp3(buf, (p) => status(`Encoding MP3… ${Math.round(p * 100)}%`))
        : new Blob([A.encodeWav(buf)], { type: 'audio/wav' });
      status('Saving…');
      status(await download(blob, name));
    } catch (e) {
      status(`Export failed: ${e.message || e}`, true);
    }
    $('exportGo').disabled = false;
  });

  /** MP3 through lamejs (LGPL), about a second of audio per step so the page stays responsive. */
  async function encodeMp3(buffer, onProgress) {
    const lame = window.lamejs;
    if (!lame) throw new Error('the MP3 encoder did not load');
    const channels = Math.min(2, buffer.numberOfChannels);
    const enc = new lame.Mp3Encoder(channels, buffer.sampleRate, MP3_KBPS);
    const [left, right = null] = A.pcm16(buffer);
    const parts = [], step = 1152 * 40;
    for (let i = 0; i < left.length; i += step) {
      const l = left.subarray(i, i + step);
      const out = right ? enc.encodeBuffer(l, right.subarray(i, i + step)) : enc.encodeBuffer(l);
      if (out.length) parts.push(out);
      onProgress(Math.min(1, (i + step) / left.length));
      await new Promise((r) => setTimeout(r, 0));
    }
    const tail = enc.flush();
    if (tail.length) parts.push(tail);
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  /**
   * Hand the file to the browser's download, to the Android app (which writes it to Downloads),
   * or to the claude.ai artifact viewer, which only saves certain file types: there the track goes
   * inside a zip.
   */
  async function download(blob, name) {
    const android = window.ChordChemistAndroid;
    if (android && android.beginFile) return androidSave(android, blob, name);
    const viewer = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (viewer) {
      const zipName = name.replace(/\.(wav|mp3)$/i, '.zip');
      await viewer.save({ filename: zipName, data: zipStore(name, new Uint8Array(await blob.arrayBuffer())) });
      return `Saved as ${zipName} — unzip it to get the track.`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Promise.resolve(`Saved as ${name} in your Downloads folder.`);
  }
  /** One file in a zip archive, stored uncompressed (audio does not compress anyway). */
  function zipStore(name, bytes) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const fname = new TextEncoder().encode(name);
    const local = new DataView(new ArrayBuffer(30)), central = new DataView(new ArrayBuffer(46)), end = new DataView(new ArrayBuffer(22));
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    // version needed, flags (UTF-8 name), method (store), time, date, crc, sizes, name length, extra length
    const head = (v, sig, o) => {
      v.setUint32(0, sig, true); v.setUint16(o, 20, true); v.setUint16(o + 2, 0x800, true); v.setUint16(o + 4, 0, true);
      v.setUint16(o + 6, dosTime, true); v.setUint16(o + 8, dosDate, true); v.setUint32(o + 10, crc, true);
      v.setUint32(o + 14, bytes.length, true); v.setUint32(o + 18, bytes.length, true);
      v.setUint16(o + 22, fname.length, true); v.setUint16(o + 24, 0, true);
    };
    head(local, 0x04034b50, 4);
    central.setUint16(4, 20, true);
    head(central, 0x02014b50, 6);
    central.setUint16(32, 0, true); central.setUint16(34, 0, true); central.setUint16(36, 0, true); central.setUint32(38, 0, true); central.setUint32(42, 0, true);
    const centralAt = 30 + fname.length + bytes.length;
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true);
    end.setUint32(12, 46 + fname.length, true); end.setUint32(16, centralAt, true);
    return new Blob([local, fname, bytes, central, fname, end], { type: 'application/zip' });
  }
  const base64 = (part) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result.slice(fr.result.indexOf(',') + 1));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(part);
  });
  function androidSave(android, blob, name) {
    return new Promise((resolve, reject) => {
      window.__fileSaved = (ok, where) => {
        delete window.__fileSaved;
        if (ok) resolve(`Saved to ${where} as ${name}.`);
        else reject(new Error(where));
      };
      (async () => {
        android.beginFile(name, blob.type || 'application/octet-stream');
        const CHUNK = 1 << 20; // 1 MiB of audio per call across the bridge
        for (let i = 0; i < blob.size; i += CHUNK) android.appendFile(await base64(blob.slice(i, i + CHUNK)));
        android.endFile();
      })().catch(reject);
    });
  }

  // ---------- boot ----------

  load();
  renderBanks();
  App.onChange = renderBanks; // the Store buttons follow whether the chart is complete
})();
