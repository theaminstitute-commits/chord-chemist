/* Chord Chemist — guitar voicings.
 *
 * Voicings are built systematically: pick 3 or 4 chord tones, put one on each string
 * of a string set, and walk every inversion up the neck by moving each tone up to the
 * next chord tone on the same string. This module does that walk in code, keeps what a hand can reach, and adds
 * the familiar E- and A-form barre chords for the basic qualities.
 */
(function (global) {
  'use strict';
  const T = global.CCTheory || (typeof require !== 'undefined' ? require('./theory.js') : null);
  const { Q, mod } = T;

  const OPEN = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4, index 0 = low E (6th string)
  const MAX_FRET = 15;

  function combos(n) {
    const out = [];
    (function rec(start, acc) {
      if (acc.length === n) { out.push(acc.slice()); return; }
      for (let s = start; s < 6; s++) { acc.push(s); rec(s + 1, acc); acc.pop(); }
    })(0, []);
    return out.filter((set) => {
      let total = 0;
      for (let i = 1; i < set.length; i++) {
        const gap = set[i] - set[i - 1] - 1;
        if (gap > 1) return false;
        total += gap;
      }
      return total <= (n === 3 ? 1 : 2);
    });
  }
  const STRING_SETS = { 3: combos(3), 4: combos(4) };

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => {
      for (const p of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([x].concat(p));
    });
    return out;
  }

  const degLabel = (deg) => (deg === '1' ? 'R' : deg.replace('bb', '𝄫').replace('b', '♭').replace('#', '♯'));

  function build(chord, frets, kind) {
    const midi = [], labels = [];
    for (let s = 0; s < 6; s++) {
      if (frets[s] < 0) { labels.push(''); continue; }
      const m = OPEN[s] + frets[s];
      const tone = chord.tones.find((t) => t.pc === mod(m));
      if (!tone) return null;
      midi.push(m);
      labels.push(degLabel(tone.deg));
    }
    const fretted = frets.filter((f) => f > 0);
    const min = fretted.length ? Math.min(...fretted) : 0;
    const max = fretted.length ? Math.max(...fretted) : 0;
    const bassString = frets.findIndex((f) => f >= 0);
    const played = frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
    let gaps = 0;
    for (let i = 1; i < played.length; i++) gaps += played[i] - played[i - 1] - 1;
    const rootless = !labels.includes('R');
    const rootBass = labels[bassString] === 'R';
    const hasOpen = frets.some((f) => f === 0);
    let score = (max - min) * 1.1 + gaps * 1.2 + (rootBass ? 0 : 1.6) + (rootless ? 1 : 0) - 0.25 * (midi.length - 3);
    if (min > 9) score += (min - 9) * 0.35;
    if (kind === 'barre') score -= 0.3;
    return {
      frets: frets.slice(), midi, labels, min, max, score, kind, rootless, rootBass,
      bassString, id: frets.map((f) => (f < 0 ? 'x' : f.toString(36))).join(''),
    };
  }

  function searchSet(chord, tones, strings, out) {
    const cand = strings.map((s, i) => {
      const f0 = mod(tones[i].pc - OPEN[s]);
      return [f0, f0 + 12].filter((f) => f <= MAX_FRET);
    });
    const pick = new Array(strings.length);
    (function rec(i) {
      if (i === strings.length) {
        let prev = -1;
        for (let k = 0; k < strings.length; k++) {
          const m = OPEN[strings[k]] + pick[k];
          if (m <= prev) return;
          prev = m;
        }
        const fretted = pick.filter((f) => f > 0);
        const hasOpen = pick.some((f) => f === 0);
        const min = fretted.length ? Math.min(...fretted) : 0;
        const max = fretted.length ? Math.max(...fretted) : 0;
        const reach = min >= 7 ? 4 : 3;
        if (max - min > reach) return;
        // Open strings only in open position, and never around a muted inner string.
        if (hasOpen && (max > 4 || strings[strings.length - 1] - strings[0] !== strings.length - 1)) return;
        // Keep the bass clear: no seconds packed together low on the neck.
        const lo0 = OPEN[strings[0]] + pick[0], lo1 = OPEN[strings[1]] + pick[1];
        if (lo1 - lo0 < 3 && lo0 < 55) return;
        const frets = [-1, -1, -1, -1, -1, -1];
        strings.forEach((s, k) => { frets[s] = pick[k]; });
        const v = build(chord, frets, 'set');
        if (v && !out.has(v.id)) out.set(v.id, v);
        return;
      }
      for (const f of cand[i]) { pick[i] = f; rec(i + 1); }
    })(0);
  }

  // Barre forms: offsets from the root fret, null = muted string.
  const E_FORM = {
    maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
    maj7: [0, null, 1, 1, 0, null], '7sus': [0, 2, 0, 2, 0, 0], 13: [0, null, 0, 1, 2, null],
    m7b5: [0, null, 0, 0, -1, null], dim7: [0, null, -1, 0, -1, null], 6: [0, null, -1, 1, 0, null],
  };
  const A_FORM = {
    maj: [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], 7: [null, 0, 2, 0, 2, 0], m7: [null, 0, 2, 0, 1, 0],
    maj7: [null, 0, 2, 1, 2, 0], m7b5: [null, 0, 1, 0, 1, null], '7sus': [null, 0, 2, 0, 3, 0],
    6: [null, 0, 2, 2, 2, 2], 9: [null, 0, -1, 0, 0, 0], m6: [null, 0, null, -1, 1, 0], dim7: [null, 0, 1, -1, 1, null],
  };

  function addBarres(chord, out) {
    for (const [form, rootString] of [[E_FORM, 0], [A_FORM, 1]]) {
      const shape = form[chord.q];
      if (!shape) continue;
      const rf0 = mod(chord.rootPc - OPEN[rootString]);
      for (const rf of [rf0, rf0 + 12]) {
        const frets = shape.map((o) => (o === null ? -1 : rf + o));
        if (frets.some((f) => f < -1) || shape.some((o) => o !== null && rf + o < 0)) continue;
        if (Math.max(...frets) > MAX_FRET) continue;
        const v = build(chord, frets, 'barre');
        if (v && !out.has(v.id)) out.set(v.id, v);
      }
    }
  }

  const cache = new Map();

  /** All playable voicings for a chord, best first. */
  function voicings(chord) {
    if (cache.has(chord.key)) return cache.get(chord.key);
    const q = Q[chord.q];
    const sets = q.v || [q.tones];
    const out = new Map();
    for (const set of sets) {
      const tones = set.map((deg) => chord.tones.find((t) => t.deg === deg));
      for (const perm of permutations(tones)) {
        for (const strings of STRING_SETS[perm.length]) searchSet(chord, perm, strings, out);
      }
    }
    addBarres(chord, out);
    const list = [...out.values()].sort((a, b) => a.score - b.score || a.min - b.min);
    cache.set(chord.key, list);
    return list;
  }

  const avgFret = (v) => {
    const f = v.frets.filter((x) => x > 0);
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
  };

  /** How far the hand and the voices have to move from one voicing to the next. */
  function distance(a, b) {
    let d = 0;
    for (const x of a.midi) d += Math.min(...b.midi.map((y) => Math.abs(x - y)));
    for (const y of b.midi) d += Math.min(...a.midi.map((x) => Math.abs(x - y)));
    return d / (a.midi.length + b.midi.length) + 0.3 * Math.abs(avgFret(a) - avgFret(b));
  }

  /** Index of the voicing to use, following the previous chord's voicing when there is one. */
  function chooseVoicing(chord, prev) {
    const list = voicings(chord);
    if (!list.length) return -1;
    if (!prev) {
      const i = list.findIndex((v) => v.min >= 1 && v.max <= 10 && v.rootBass && v.midi.length >= 4);
      return i >= 0 ? i : 0;
    }
    let best = 0, bestCost = Infinity;
    list.forEach((v, i) => {
      const cost = distance(prev, v) + 0.35 * v.score;
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    return best;
  }

  const api = { OPEN, voicings, chooseVoicing, distance, degLabel };
  global.CCVoicings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
