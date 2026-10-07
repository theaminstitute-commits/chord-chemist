/* Chord Chemist — UI: directory, progression chart, diagrams, fretboard, playback. */
(function () {
  'use strict';
  const T = window.CCTheory, V = window.CCVoicings, A = window.CCAudio;
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STORE = 'chord-chemist-v1';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = {
    template: T.TEMPLATE['ii-V-I'],
    key: null,
    start: 'D',
    slots: [],
    selected: 0,
    target: 'main',
    tab: 'all',
    shown: null, // { chord, voicing, fn, rule, next } on the diagram and fretboard
    playing: -1,
  };

  // ---------- persistence ----------

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        tpl: state.template.id, start: state.start,
        slots: state.slots.map((s) => ({
          main: s.main && [s.main.root, s.main.q], mainV: s.mainV,
          split: s.split && [s.split.root, s.split.q], splitV: s.splitV,
        })),
        tempo: $('tempo').value, volume: $('volume').value, voice: $('voice').value, beats: $('beats').value, style: $('style').value, loop: $('loop').checked,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d || !T.TEMPLATE[d.tpl]) return false;
      setTemplate(d.tpl, d.start, false);
      d.slots.forEach((s, i) => {
        if (!state.slots[i]) return;
        if (s.main) { state.slots[i].main = T.makeChord(s.main[0], s.main[1]); state.slots[i].mainV = s.mainV || 0; }
        if (s.split) { state.slots[i].split = T.makeChord(s.split[0], s.split[1]); state.slots[i].splitV = s.splitV || 0; }
      });
      $('tempo').value = d.tempo || 88;
      $('volume').value = d.volume ?? 100;
      $('voice').value = d.voice === 'synth' ? 'synth' : 'jazz';
      $('beats').value = d.beats || '4';
      $('style').value = d.style || 'ring';
      $('loop').checked = !!d.loop;
      refreshRules();
      return true;
    } catch (e) { return false; }
  }

  // ---------- setup ----------

  function setTemplate(id, start, fillStart = true) {
    state.template = T.TEMPLATE[id];
    const choices = T.startChoices(state.template);
    const pick = choices.find((c) => c.root === start) ||
      choices.find((c) => c.pc === T.parseNote(start || 'C').pc) || choices[0];
    state.start = pick.root;
    state.key = T.keyForStart(state.template, pick.root);
    state.slots = state.template.slots.map(() => ({ main: null, mainV: 0, split: null, splitV: 0 }));
    if (fillStart) {
      placeMain(0, T.defaultChord(state.key, state.template.slots[0]), true);
      state.selected = state.slots.length > 1 ? 1 : 0;
    } else {
      state.selected = 0;
    }
    state.target = 'main';
    state.tab = 'all';
    renderHeader();
  }

  function renderHeader() {
    const tpl = $('tpl');
    tpl.innerHTML = T.TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    tpl.value = state.template.id;
    const first = state.template.slots[0];
    $('start').innerHTML = T.startChoices(state.template).map((c) => {
      const sym = T.pretty(c.root) + T.Q[first.q].sym;
      return `<option value="${c.root}">${esc(sym)}  (${esc(T.pretty(c.tonic))} ${state.template.mode})</option>`;
    }).join('');
    $('start').value = state.start;
    $('keyplate').textContent = `${T.pretty(state.key.tonic)} ${state.key.mode}`;
  }

  // ---------- slot operations ----------

  function prevVoicing(i) {
    if (i <= 0) return null;
    const p = state.slots[i - 1];
    if (p.split) return V.voicings(p.split)[p.splitV] || null;
    if (p.main) return V.voicings(p.main)[p.mainV] || null;
    return null;
  }

  function placeMain(i, chord, quiet) {
    const s = state.slots[i];
    s.main = chord;
    s.mainV = Math.max(0, V.chooseVoicing(chord, prevVoicing(i)));
    // A passing chord that no longer leads anywhere legal goes.
    if (s.split && !T.findOption(state, i, 'split', s.split.key)) {
      if (!quiet) say(`Removed the passing ${s.split.sym} — it no longer fits after ${chord.sym}.`);
      s.split = null;
    }
    if (s.split) s.splitV = Math.max(0, V.chooseVoicing(s.split, V.voicings(chord)[s.mainV]));
  }

  function placeSplit(i, chord) {
    const s = state.slots[i];
    s.split = chord;
    s.splitV = Math.max(0, V.chooseVoicing(chord, s.main ? V.voicings(s.main)[s.mainV] : prevVoicing(i)));
  }

  function refreshRules() {
    state.slots.forEach((s, i) => {
      s.mainOpt = s.main ? T.findOption(state, i, 'main', s.main.key) : null;
      s.splitOpt = s.split ? T.findOption(state, i, 'split', s.split.key) : null;
    });
  }

  function drop(i, item) {
    const opt = T.findOption(state, i, item.target, item.chord.key);
    const spec = state.template.slots[i];
    if (!opt) {
      const where = item.target === 'split' ? `a passing chord in bar ${i + 1}` : `bar ${i + 1} (${spec.rn})`;
      say(`${item.chord.sym} isn’t a legal choice for ${where}. Select that bar to see what fits.`, true);
      return false;
    }
    if (item.target === 'split') {
      if (!state.slots[i].main) { say(`Fill bar ${i + 1} first — the passing chord plays in its second half.`, true); return false; }
      placeSplit(i, item.chord);
      say(`${item.chord.sym} passes from ${state.slots[i].main.sym} into ${T.chordAt(state, T.nextIndex(state.template, i)).sym}.`);
    } else {
      placeMain(i, item.chord);
      const nextEmpty = state.slots.findIndex((s, k) => k > i && !s.main);
      if (nextEmpty >= 0) {
        state.selected = nextEmpty;
        say(`${item.chord.sym} placed. Bar ${nextEmpty + 1} now lists what can follow it.`);
      } else {
        state.selected = i;
        say(complete() ? `${item.chord.sym} placed — the progression is complete. Press Play.` : `${item.chord.sym} placed.`);
      }
    }
    refreshRules();
    const s = state.slots[i];
    const chord = item.target === 'split' ? s.split : s.main;
    const vi = item.target === 'split' ? s.splitV : s.mainV;
    show(chord, V.voicings(chord)[vi], item.target === 'split' ? s.splitOpt : s.mainOpt, i);
    A.playChord(V.voicings(chord)[vi].midi);
    render();
    save();
    return true;
  }

  const complete = () => state.slots.every((s) => s.main);

  // ---------- messages ----------

  let sayTimer = 0;
  function say(msg, bad) {
    const el = $('status');
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
    clearTimeout(sayTimer);
    if (bad) sayTimer = setTimeout(() => { el.classList.remove('bad'); }, 5000);
  }

  // ---------- diagrams ----------

  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) {
      // Theme tokens go through style so they resolve in every browser.
      const v = attrs[k];
      if (typeof v === 'string' && v.startsWith('var(')) n.style.setProperty(k, v);
      else n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  /** Chord box: fret number to the left, chord tones underneath each string. */
  function diagram(v, { size = 'mini', labels = false } = {}) {
    const big = size === 'big';
    const cw = big ? 26 : 8.4, rh = big ? 28 : 10, left = big ? 30 : 10, top = big ? 26 : 9;
    const frets = 5;
    const W = left + cw * 5 + (big ? 16 : 4), H = top + rh * frets + (labels ? 26 : 4);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: big ? W * 1.05 : W * 1.3, class: 'diag', 'aria-hidden': 'true' });
    if (!v) return svg;
    const base = v.max <= 4 ? 1 : v.min;
    const ink = 'var(--paper-ink)';
    for (let s = 0; s < 6; s++) el('line', { x1: left + s * cw, y1: top, x2: left + s * cw, y2: top + rh * frets, stroke: ink, 'stroke-width': big ? 1.2 : 0.7 }, svg);
    for (let f = 0; f <= frets; f++) {
      el('line', {
        x1: left, y1: top + f * rh, x2: left + 5 * cw, y2: top + f * rh, stroke: ink,
        'stroke-width': f === 0 && base === 1 ? (big ? 5 : 2.4) : big ? 1.2 : 0.7,
      }, svg);
    }
    if (base > 1) {
      const t = el('text', { x: left - (big ? 8 : 3), y: top + rh * 0.72, 'text-anchor': 'end', 'font-size': big ? 17 : 8, fill: ink, 'font-family': 'var(--type)' }, svg);
      t.textContent = base;
    }
    v.frets.forEach((f, s) => {
      const x = left + s * cw;
      if (f < 0) {
        const t = el('text', { x, y: top - (big ? 7 : 2.5), 'text-anchor': 'middle', 'font-size': big ? 14 : 6.5, fill: 'var(--paper-muted)', 'font-family': 'var(--type)' }, svg);
        t.textContent = '×';
      } else if (f === 0) {
        el('circle', { cx: x, cy: top - (big ? 11 : 4.5), r: big ? 5.5 : 2.3, fill: 'none', stroke: ink, 'stroke-width': big ? 1.4 : 0.8 }, svg);
      } else {
        const row = f - base;
        const isRoot = v.labels[s] === 'R';
        el('circle', {
          cx: x, cy: top + row * rh + rh / 2, r: big ? 9.5 : 3.4,
          fill: isRoot ? 'var(--paper-active)' : ink,
        }, svg);
      }
      if (labels && f >= 0) {
        const t = el('text', { x, y: top + rh * frets + 19, 'text-anchor': 'middle', 'font-size': 13, fill: v.labels[s] === 'R' ? 'var(--paper-active)' : 'var(--paper-muted)', 'font-family': 'var(--type)' }, svg);
        t.textContent = v.labels[s];
      }
    });
    return svg;
  }

  // ---------- fretboard ----------

  const FB = { x0: 64, x1: 988, y0: 22, y1: 150, frets: 15 };
  const fretX = (f) => {
    const scale = 1 - Math.pow(2, -FB.frets / 12);
    return FB.x0 + (FB.x1 - FB.x0) * (1 - Math.pow(2, -f / 12)) / scale;
  };
  const stringY = (s) => FB.y1 - (s * (FB.y1 - FB.y0)) / 5; // low E at the bottom

  function drawFretboard() {
    const svg = $('fretboard');
    svg.innerHTML = '';
    el('rect', { x: FB.x0, y: FB.y0 - 12, width: FB.x1 - FB.x0, height: FB.y1 - FB.y0 + 24, rx: 3, fill: 'var(--wood)', stroke: 'var(--wood-edge)' }, svg);
    for (const f of [3, 5, 7, 9, 15]) {
      el('circle', { cx: (fretX(f - 1) + fretX(f)) / 2, cy: (FB.y0 + FB.y1) / 2, r: 6, fill: 'var(--marker)' }, svg);
    }
    for (const dy of [-26, 26]) el('circle', { cx: (fretX(11) + fretX(12)) / 2, cy: (FB.y0 + FB.y1) / 2 + dy, r: 6, fill: 'var(--marker)' }, svg);
    el('rect', { x: FB.x0 - 5, y: FB.y0 - 12, width: 7, height: FB.y1 - FB.y0 + 24, fill: 'var(--nut)', stroke: 'var(--wood-edge)', 'stroke-width': 0.5 }, svg);
    for (let f = 1; f <= FB.frets; f++) {
      el('line', { x1: fretX(f), y1: FB.y0 - 12, x2: fretX(f), y2: FB.y1 + 12, stroke: 'var(--wire)', 'stroke-width': 2 }, svg);
      const t = el('text', { x: (fretX(f - 1) + fretX(f)) / 2, y: FB.y1 + 24, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--muted)', 'font-family': 'var(--type)' }, svg);
      t.textContent = f;
    }
    ['E', 'A', 'D', 'G', 'B', 'e'].forEach((n, s) => {
      el('line', { x1: FB.x0, y1: stringY(s), x2: FB.x1, y2: stringY(s), stroke: 'var(--string)', 'stroke-width': 2.4 - s * 0.28 }, svg);
      const t = el('text', { x: 6, y: stringY(s) + 4, 'font-size': 12, fill: 'var(--muted)', 'font-family': 'var(--type)' }, svg);
      t.textContent = n;
    });
    el('g', { id: 'fbNext' }, svg);
    el('g', { id: 'fbNow' }, svg);
  }

  const noteX = (f) => (f === 0 ? FB.x0 - 26 : (fretX(f - 1) + fretX(f)) / 2);

  function paintFretboard(v, nextV) {
    const now = $('fretboard').querySelector('#fbNow'), nx = $('fretboard').querySelector('#fbNext');
    if (!now) return;
    now.innerHTML = '';
    nx.innerHTML = '';
    if (nextV) {
      nextV.frets.forEach((f, s) => {
        if (f < 0) return;
        el('circle', { cx: noteX(f), cy: stringY(s), r: 12, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '3 2.5', opacity: 0.85 }, nx);
      });
    }
    if (!v) return;
    v.frets.forEach((f, s) => {
      if (f < 0) return;
      const root = v.labels[s] === 'R';
      el('circle', { cx: noteX(f), cy: stringY(s), r: 11.5, fill: root ? 'var(--accent)' : 'var(--paper)', stroke: root ? 'var(--accent-2)' : 'var(--paper-ink)', 'stroke-width': 1.2 }, now);
      const t = el('text', { x: noteX(f), y: stringY(s) + 4, 'text-anchor': 'middle', 'font-size': 11, fill: root ? 'var(--accent-text)' : 'var(--paper-ink)', 'font-family': 'var(--type)' }, now);
      t.textContent = v.labels[s];
    });
  }

  // ---------- showing a chord ----------

  function show(chord, v, opt, slotIndex, nextV) {
    state.shown = { chord, v, opt, slotIndex };
    const fig = $('bigdiag');
    fig.innerHTML = '';
    fig.appendChild(diagram(v, { size: 'big', labels: true }));
    const cap = document.createElement('figcaption');
    cap.textContent = chord.sym;
    fig.appendChild(cap);

    const q = T.Q[chord.q];
    const fn = opt ? opt.fn : T.roman(chord, state.key);
    const voiceDesc = v ? v.frets.map((f) => (f < 0 ? '×' : f)).join(' ') : '—';
    const kind = v ? (v.kind === 'barre' ? 'barre form' : `${v.midi.length}-note voicing${v.rootless ? ', no root' : ''}`) : '';
    $('notes').innerHTML = `
      <h3>${esc(chord.sym)}</h3>
      <p class="qname">${esc(T.pretty(chord.root))} ${esc(q.name)} · ${esc(fn)} in ${esc(T.pretty(state.key.tonic))} ${state.key.mode}</p>
      <dl>
        <dt>Tones</dt><dd class="tones">${chord.tones.map((t) => esc(T.pretty(t.name))).join('  ')}</dd>
        <dt>Formula</dt><dd class="tones">${chord.tones.map((t) => esc(V.degLabel(t.deg))).join('  ')}</dd>
        <dt>Voicing</dt><dd><span class="tones">${esc(voiceDesc)}</span> <small>(${esc(kind)}, low E → high e)</small></dd>
        <dt>Why legal</dt><dd>${esc(opt ? opt.rule : 'Not in this bar’s directory.')}</dd>
      </dl>`;
    paintFretboard(v, nextV || null);
  }

  function slotVoicing(i, which) {
    const s = state.slots[i];
    const c = which === 'split' ? s.split : s.main;
    if (!c) return null;
    return V.voicings(c)[which === 'split' ? s.splitV : s.mainV];
  }

  function nextVoicingAfter(i, which) {
    if (which === 'main' && state.slots[i].split) return slotVoicing(i, 'split');
    const ni = T.nextIndex(state.template, i);
    return slotVoicing(ni, 'main');
  }

  function showSlot(i, which = 'main') {
    const s = state.slots[i];
    const c = which === 'split' ? s.split : s.main;
    if (!c) return;
    show(c, slotVoicing(i, which), which === 'split' ? s.splitOpt : s.mainOpt, i, nextVoicingAfter(i, which));
  }

  // ---------- rendering: directory ----------

  let currentGroups = [];

  function renderDirectory() {
    const i = state.selected;
    const spec = state.template.slots[i];
    const next = T.chordAt(state, T.nextIndex(state.template, i));
    const splitMode = state.target === 'split';
    $('tMain').setAttribute('aria-pressed', String(!splitMode));
    $('tSplit').setAttribute('aria-pressed', String(splitMode));
    $('dirTitle').textContent = `Bar ${i + 1} · ${spec.rn}`;
    const main = state.slots[i].main;
    $('dirSub').textContent = splitMode
      ? `after ${main ? main.sym : '…'}, into ${next.sym}`
      : `${i === 0 ? 'starting chord · ' : ''}moves to ${next.sym}`;

    currentGroups = T.options(state, i, state.target);
    if (!currentGroups.some((g) => g.id === state.tab)) state.tab = 'all';
    const total = currentGroups.reduce((n, g) => n + g.items.length, 0);
    $('tabs').innerHTML = [`<button type="button" data-tab="all" aria-pressed="${state.tab === 'all'}">All<b>${total}</b></button>`]
      .concat(currentGroups.map((g) => `<button type="button" data-tab="${g.id}" aria-pressed="${state.tab === g.id}">${esc(g.title)}<b>${g.items.length}</b></button>`))
      .join('');

    const cards = $('cards');
    cards.innerHTML = '';
    if (splitMode && !main) {
      cards.innerHTML = `<p class="empty-note">Fill bar ${i + 1} first. A passing chord takes the second half of a bar and leads into the next one.</p>`;
      return;
    }
    const prevV = splitMode ? slotVoicing(i, 'main') : prevVoicing(i);
    for (const g of currentGroups) {
      if (state.tab !== 'all' && state.tab !== g.id) continue;
      const sec = document.createElement('section');
      sec.className = 'group';
      sec.innerHTML = `<h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="group-cards"></div>`;
      const wrap = sec.querySelector('.group-cards');
      g.items.forEach((it, k) => {
        const list = V.voicings(it.chord);
        const v = list[Math.max(0, V.chooseVoicing(it.chord, prevV))];
        const card = document.createElement('article');
        card.className = 'card';
        card.tabIndex = 0;
        card.dataset.group = g.id;
        card.dataset.k = k;
        card.setAttribute('aria-label', `${it.chord.sym}, ${it.fn}. ${it.rule}`);
        card.title = it.rule;
        card.innerHTML = `<span class="fn">${esc(it.fn)}</span><div class="grip"></div><div class="sym">${esc(it.chord.sym)}</div>
          <p class="rule">${esc(it.rule.split(' — ')[0])}</p><button class="add" type="button">+ Bar ${i + 1}</button>`;
        card.querySelector('.grip').appendChild(diagram(v));
        wrap.appendChild(card);
      });
      cards.appendChild(sec);
    }
  }

  function itemFromCard(card) {
    const g = currentGroups.find((x) => x.id === card.dataset.group);
    const it = g && g.items[+card.dataset.k];
    return it ? { ...it, target: state.target } : null;
  }

  // ---------- rendering: chart ----------

  function renderSlots() {
    const ol = $('slots');
    ol.innerHTML = '';
    const beats = +$('beats').value;
    state.slots.forEach((s, i) => {
      const spec = state.template.slots[i];
      const li = document.createElement('li');
      li.className = 'slot' + (i === state.selected ? ' selected' : '') + (i === state.playing ? ' playing' : '') +
        ((s.main && !s.mainOpt) || (s.split && !s.splitOpt) ? ' invalid' : '');
      li.dataset.i = i;
      const slash = (n) => '/'.repeat(Math.max(1, n));
      let mainHtml;
      if (s.main) {
        mainHtml = `<div class="slot-sym">${esc(s.main.sym)}</div><div class="slot-fn">${esc(s.mainOpt ? s.mainOpt.fn : T.roman(s.main, state.key))}</div>
          <div class="slot-dia"></div><div class="slashes">${slash(s.split ? beats / 2 : beats)}</div>
          ${s.mainOpt ? '' : `<div class="warn">No longer resolves into ${esc(T.chordAt(state, T.nextIndex(state.template, i)).sym)} — pick again.</div>`}`;
      } else {
        const hint = T.defaultChord(state.key, spec).sym;
        mainHtml = `<div class="slot-empty">Drop a ${esc(spec.rn)} chord here<br>(e.g. ${esc(hint)})</div>`;
      }
      const count = s.main ? `${s.mainV + 1}/${V.voicings(s.main).length}` : '';
      li.innerHTML = `
        <div class="slot-rn"><span>${esc(spec.rn)}</span><span class="num">bar ${i + 1}</span></div>
        <div class="slot-main" data-drop="main" tabindex="0" aria-label="Bar ${i + 1}, ${esc(spec.rn)}${s.main ? ', ' + esc(s.main.sym) : ', empty'}">${mainHtml}</div>
        ${s.split
          ? `<div class="slot-split filled" data-drop="split" title="Passing chord, 2nd half of the bar"><span>½ ${esc(s.split.sym)} ${slash(beats / 2)}</span><button class="x" type="button" data-act="unsplit" aria-label="Remove passing chord">×</button></div>`
          : `<button class="slot-split" type="button" data-drop="split" data-act="split">+ passing chord ½</button>`}
        <div class="slot-tools">
          <button type="button" data-act="vprev" aria-label="Previous voicing" ${s.main ? '' : 'disabled'}>◀</button>
          <span class="count" title="Voicing">${count}</span>
          <button type="button" data-act="vnext" aria-label="Next voicing" ${s.main ? '' : 'disabled'}>▶</button>
          <button type="button" data-act="play" aria-label="Play bar ${i + 1}" ${s.main ? '' : 'disabled'}>♪</button>
          <button type="button" data-act="clear" aria-label="Empty bar ${i + 1}" ${s.main ? '' : 'disabled'}>×</button>
        </div>`;
      if (s.main) li.querySelector('.slot-dia').appendChild(diagram(slotVoicing(i, 'main')));
      ol.appendChild(li);
    });
    const filled = state.slots.filter((s) => s.main).length;
    $('play').disabled = filled < state.slots.length;
    $('play').title = filled < state.slots.length ? `Fill every bar to play the progression (${filled} of ${state.slots.length} filled)` : '';
  }

  function render() {
    renderSlots();
    renderDirectory();
  }

  // ---------- interactions ----------

  function selectSlot(i, target = 'main') {
    state.selected = i;
    state.target = target;
    render();
  }

  function playSlot(i, which = 'main') {
    const v = slotVoicing(i, which);
    if (!v) return;
    showSlot(i, which);
    A.playChord(v.midi);
  }

  $('slots').addEventListener('click', (e) => {
    const li = e.target.closest('.slot');
    if (!li) return;
    const i = +li.dataset.i;
    const s = state.slots[i];
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'vprev' || act === 'vnext') {
      const n = V.voicings(s.main).length;
      s.mainV = (s.mainV + (act === 'vnext' ? 1 : -1) + n) % n;
      renderSlots();
      playSlot(i);
      save();
      return;
    }
    if (act === 'play') { playSlot(i); return; }
    if (act === 'clear') {
      state.slots[i] = { main: null, mainV: 0, split: null, splitV: 0 };
      refreshRules();
      selectSlot(i);
      say(`Bar ${i + 1} emptied.`);
      save();
      return;
    }
    if (act === 'unsplit') {
      s.split = null;
      refreshRules();
      render();
      save();
      return;
    }
    if (act === 'split') { selectSlot(i, 'split'); return; }
    if (e.target.closest('.slot-split.filled')) { selectSlot(i, 'split'); playSlot(i, 'split'); return; }
    selectSlot(i, 'main');
    if (s.main) playSlot(i);
  });

  $('slots').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('slot-main')) {
      e.preventDefault();
      const i = +e.target.closest('.slot').dataset.i;
      selectSlot(i, 'main');
      if (state.slots[i].main) playSlot(i);
    }
  });

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    renderDirectory();
  });
  $('tMain').addEventListener('click', () => { state.target = 'main'; renderDirectory(); });
  $('tSplit').addEventListener('click', () => { state.target = 'split'; renderDirectory(); });

  function audition(card) {
    const it = itemFromCard(card);
    if (!it) return;
    document.querySelectorAll('.card.previewing').forEach((c) => c.classList.remove('previewing'));
    card.classList.add('previewing');
    const i = state.selected;
    const prevV = state.target === 'split' ? slotVoicing(i, 'main') : prevVoicing(i);
    const v = V.voicings(it.chord)[Math.max(0, V.chooseVoicing(it.chord, prevV))];
    const nextV = slotVoicing(T.nextIndex(state.template, i), 'main');
    show(it.chord, v, it, i, nextV);
    A.playChord(v.midi);
  }

  $('cards').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (e.target.closest('.add')) {
      const it = itemFromCard(card);
      if (it) drop(state.selected, it);
    }
  });
  $('cards').addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (!card || e.target.closest('.add')) return;
    if (e.key === 'Enter') { e.preventDefault(); const it = itemFromCard(card); if (it) drop(state.selected, it); }
    if (e.key === ' ') { e.preventDefault(); audition(card); }
  });

  // Drag and drop with pointer events, so it works with a mouse and (later) on touch screens.
  let drag = null;
  const ghost = $('ghost');
  $('cards').addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card');
    if (!card || e.target.closest('button') || e.button > 0) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) {
      // Touch outside the diagram scrolls the list; a tap still auditions.
      drag = { card, x: e.clientX, y: e.clientY, started: false, scrollOnly: true };
      return;
    }
    drag = { card, x: e.clientX, y: e.clientY, started: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (drag.scrollOnly) { if (moved > 8) drag = null; return; }
    if (!drag.started && moved > 6) {
      drag.started = true;
      drag.item = itemFromCard(drag.card);
      ghost.textContent = drag.item ? drag.item.chord.sym : '';
      ghost.hidden = false;
      document.body.classList.add('dragging');
    }
    if (drag.started) {
      e.preventDefault();
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      document.querySelectorAll('.slot.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot');
      if (over) over.classList.add('drop-hover');
    }
  }, { passive: false });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    ghost.hidden = true;
    document.body.classList.remove('dragging');
    document.querySelectorAll('.slot.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
    if (!d.started) { audition(d.card); return; }
    const li = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot');
    if (li && d.item) drop(+li.dataset.i, d.item);
  });
  window.addEventListener('pointercancel', () => {
    drag = null;
    ghost.hidden = true;
    document.body.classList.remove('dragging');
  });

  // ---------- header & transport ----------

  $('tpl').addEventListener('change', (e) => {
    A.stopAll();
    // Stay in the same key: C major's ii–V–I becomes C major's I–vi–ii–V (or C minor).
    const tonicPc = state.key.pc;
    const choices = T.startChoices(T.TEMPLATE[e.target.value]);
    setTemplate(e.target.value, (choices.find((c) => T.parseNote(c.tonic).pc === tonicPc) || choices[0]).root);
    refreshRules();
    say(`New chart: ${state.template.name} starting on ${state.slots[0].main.sym}. Bar ${state.selected + 1} lists what can follow.`);
    showSlot(0);
    render();
    save();
  });
  $('start').addEventListener('change', (e) => {
    A.stopAll();
    setTemplate(state.template.id, e.target.value);
    refreshRules();
    say(`Starting on ${state.slots[0].main.sym} puts the progression in ${T.pretty(state.key.tonic)} ${state.key.mode}.`);
    playSlot(0);
    render();
    save();
  });

  $('tempo').addEventListener('input', () => { $('tempoOut').textContent = $('tempo').value; save(); });
  function applyVolume() {
    $('volumeOut').textContent = $('volume').value + '%';
    A.setVolume($('volume').value / 100);
  }
  $('volume').addEventListener('input', () => { applyVolume(); save(); });
  $('voice').addEventListener('change', () => {
    A.setVoice($('voice').value);
    save();
    if (state.shown && state.shown.v) A.playChord(state.shown.v.midi);
  });
  for (const id of ['beats', 'style', 'loop']) $(id).addEventListener('change', () => { renderSlots(); save(); });

  function stopPlayback() {
    A.stopAll();
    state.playing = -1;
    renderSlots();
  }

  $('play').addEventListener('click', () => {
    if (!complete()) return;
    const beats = +$('beats').value;
    const events = [];
    state.slots.forEach((s, i) => {
      const half = s.split ? beats / 2 : beats;
      events.push({ midis: slotVoicing(i, 'main').midi, beats: half, onStart: () => { state.playing = i; renderSlots(); showSlot(i, 'main'); } });
      if (s.split) events.push({ midis: slotVoicing(i, 'split').midi, beats: beats / 2, onStart: () => { showSlot(i, 'split'); } });
    });
    A.playSequence(events, {
      tempo: +$('tempo').value, style: $('style').value, loop: $('loop').checked,
      onDone: () => { state.playing = -1; renderSlots(); },
    });
    say(`Playing ${state.slots.map((s) => s.main.sym + (s.split ? ' ' + s.split.sym : '')).join(' | ')}`);
  });
  $('stop').addEventListener('click', stopPlayback);

  $('revoice').addEventListener('click', () => {
    let prev = null;
    state.slots.forEach((s) => {
      if (!s.main) { prev = null; return; }
      s.mainV = Math.max(0, V.chooseVoicing(s.main, prev));
      prev = V.voicings(s.main)[s.mainV];
      if (s.split) {
        s.splitV = Math.max(0, V.chooseVoicing(s.split, prev));
        prev = V.voicings(s.split)[s.splitV];
      }
    });
    renderSlots();
    say('Voicings re-picked so each chord sits close to the one before it (smooth voice leading).');
    save();
  });

  $('clear').addEventListener('click', () => {
    A.stopAll();
    setTemplate(state.template.id, state.start);
    refreshRules();
    say(`Chart cleared back to the starting chord, ${state.slots[0].main.sym}.`);
    render();
    save();
  });

  // ---------- theme ----------
  // As in Guitar Reading Trainer: the choice is a data-theme attribute on <html>; "Auto" removes it
  // so the device setting (prefers-color-scheme) decides. A change crossfades: the View Transitions
  // API where the browser has it, otherwise a short colour transition (none with reduced motion).
  const THEME_KEY = 'chord-chemist-theme';
  function savedTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch (e) { return 'system'; }
  }
  function markTheme(choice) {
    $('theme').querySelectorAll('[data-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.choice === choice)));
  }
  function setTheme(choice) {
    try { localStorage.setItem(THEME_KEY, choice); } catch (e) { /* storage unavailable */ }
    const root = document.documentElement;
    const apply = () => {
      if (choice === 'system') delete root.dataset.theme;
      else root.dataset.theme = choice;
      markTheme(choice);
    };
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(apply);
      return;
    }
    root.classList.add('theme-fade');
    apply();
    setTimeout(() => root.classList.remove('theme-fade'), 500);
  }
  $('theme').addEventListener('click', (e) => {
    const b = e.target.closest('[data-choice]');
    if (b && b.getAttribute('aria-pressed') !== 'true') setTheme(b.dataset.choice);
  });
  markTheme(savedTheme());

  // ---------- boot ----------

  function loadExample() {
    setTemplate('ii-V-I', 'D', false);
    placeMain(0, T.makeChord('D', 'm9'), true);
    placeMain(1, T.makeChord('G', '13'), true);
    placeMain(2, T.makeChord('C', 'maj9'), true);
    refreshRules();
    placeSplit(2, T.makeChord('A', '7b9'));
    state.selected = 1;
    say('Example loaded: Dm9 · G13 · Cmaj9 with a passing A7♭9. Press Play, or choose a new progression above.');
  }

  function boot() {
    // Decodes in the background while the loading screen is up.
    A.loadSamples().then((ok) => console.info(ok ? 'Jazz guitar samples ready' : 'Jazz guitar samples unavailable; using the synth'));
    drawFretboard();
    if (!load()) loadExample();
    $('tempoOut').textContent = $('tempo').value;
    applyVolume();
    A.setVoice($('voice').value);
    refreshRules();
    render();
    showSlot(state.selected);
  }

  // Loading screen: shown for 2.5 s once it has actually drawn; a tap or key press skips it.
  // Building the directories blocks the page for a moment (a second or more on a slow
  // phone), so that work waits until the picture and title are on screen.
  const splash = $('splash');
  function hideSplash() {
    if (!splash || splash.classList.contains('gone')) return;
    splash.classList.add('gone');
    setTimeout(() => splash.remove(), 400);
  }
  if (!splash) {
    boot();
  } else {
    splash.addEventListener('pointerdown', hideSplash);
    window.addEventListener('keydown', hideSplash, { once: true });
    const img = splash.querySelector('img');
    const ready = Promise.all([
      img && img.decode ? img.decode().catch(() => {}) : null,
      document.fonts ? document.fonts.load('20px VT323').catch(() => {}) : null,
    ]);
    let started = false;
    function start() {
      if (started) return;
      started = true;
      splash.classList.add('run'); // starts the progress bar
      setTimeout(hideSplash, 2500);
      requestAnimationFrame(() => setTimeout(boot, 0));
    }
    Promise.race([ready, new Promise((r) => setTimeout(r, 500))]).then(() => {
      const android = window.ChordChemistAndroid;
      if (android && android.splashReady) {
        // In the Android app the WebView can take a while to reach the display, so the
        // app calls back once the loading screen is really on screen.
        window.__splashOnScreen = start;
        android.splashReady();
        setTimeout(start, 4000); // don't wait forever if the signal never comes
      } else {
        // Two frames later the splash has been painted. A tab opened in the background
        // draws no frames, so the timer starts the app anyway.
        requestAnimationFrame(() => requestAnimationFrame(start));
        setTimeout(start, 1500);
      }
    });
  }
})();
