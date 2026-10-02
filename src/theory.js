/* Chord Chemist — music theory engine.
 *
 * Chord families, extensions and substitutions follow common jazz-harmony practice.
 * Every option the directory offers carries the rule that makes it legal, so the UI
 * can explain it.
 */
(function (global) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const mod = (n, m = 12) => ((n % m) + m) % m;

  // ---------- note spelling ----------

  function parseNote(name) {
    const m = /^([A-G])(##|#|bb|b|x)?$/.exec(name);
    if (!m) throw new Error('Bad note name: ' + name);
    const letter = LETTERS.indexOf(m[1]);
    const accStr = m[2] || '';
    const acc = accStr === 'x' ? 2 : accStr.startsWith('#') ? accStr.length : -accStr.length;
    return { letter, acc, pc: mod(LETTER_PC[letter] + acc) };
  }

  function noteName(letter, pc) {
    let acc = mod(pc - LETTER_PC[letter]);
    if (acc > 6) acc -= 12;
    if (Math.abs(acc) > 2) return null;
    return LETTERS[letter] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
  }

  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  /** Move a note by `semis` semitones and `steps` letter names (a 5th = 7 semis, 4 steps). */
  function transpose(name, semis, steps) {
    const n = parseNote(name);
    const pc = mod(n.pc + semis);
    const spelled = noteName(mod(n.letter + steps, 7), pc);
    if (spelled && !/##|bb/.test(spelled)) return spelled;
    return (semis >= 0 ? SHARP_NAMES : FLAT_NAMES)[pc];
  }

  const pretty = (s) => s.replace(/(^[A-G])bb/, '$1𝄫').replace(/(^[A-G])##/, '$1𝄪')
    .replace(/(^[A-G])b/, '$1♭').replace(/(^[A-G])#/, '$1♯');

  // ---------- chord formulas ----------

  // degree -> [semitones above root, letter steps above root]
  const TONES = {
    '1': [0, 0], 'b3': [3, 2], '3': [4, 2], '4': [5, 3], 'b5': [6, 4], '5': [7, 4], '#5': [8, 4],
    '6': [9, 5], 'bb7': [9, 6], 'b7': [10, 6], '7': [11, 6],
    'b9': [1, 1], '9': [2, 1], '#9': [3, 1], '11': [5, 3], '#11': [6, 3], 'b13': [8, 5], '13': [9, 5],
  };

  // fam: maj | min | dom | hdim | dim | aug.   alt: altered tones.
  // v: the 4-note subsets used for voicings when a chord has more than 4 tones
  //    (the root or 5th is usually left out; 11th chords usually drop the 3rd).
  const QUALITIES = [
    // Major family
    { id: 'maj', sym: '', name: 'major', fam: 'maj', tones: ['1', '3', '5'] },
    { id: '6', sym: '6', name: 'major 6th', fam: 'maj', tones: ['1', '3', '5', '6'] },
    { id: 'maj7', sym: 'maj7', name: 'major 7th', fam: 'maj', tones: ['1', '3', '5', '7'] },
    { id: '69', sym: '6/9', name: 'major 6/9', fam: 'maj', tones: ['1', '3', '5', '6', '9'], v: [['1', '3', '6', '9'], ['3', '5', '6', '9']] },
    { id: 'add9', sym: 'add9', name: 'major add 9', fam: 'maj', tones: ['1', '3', '5', '9'] },
    { id: 'maj9', sym: 'maj9', name: 'major 9th', fam: 'maj', tones: ['1', '3', '5', '7', '9'], v: [['1', '3', '7', '9'], ['3', '5', '7', '9']] },
    { id: 'maj13', sym: 'maj13', name: 'major 13th', fam: 'maj', tones: ['1', '3', '5', '7', '9', '13'], v: [['1', '3', '7', '13'], ['3', '7', '9', '13']] },
    { id: 'maj7#11', sym: 'maj7♯11', name: 'major 7th +11', fam: 'maj', tones: ['1', '3', '5', '7', '#11'], v: [['1', '3', '7', '#11'], ['3', '5', '7', '#11']] },
    { id: '69#11', sym: '6/9♯11', name: 'major 6/9 +11', fam: 'maj', tones: ['1', '3', '5', '6', '9', '#11'], v: [['3', '6', '9', '#11'], ['1', '3', '6', '#11']] },
    { id: 'maj7#5', sym: 'maj7♯5', name: 'major 7th ♯5', fam: 'maj', alt: true, tones: ['1', '3', '#5', '7'] },
    // Minor family
    { id: 'm', sym: 'm', name: 'minor', fam: 'min', tones: ['1', 'b3', '5'] },
    { id: 'm6', sym: 'm6', name: 'minor 6th', fam: 'min', tones: ['1', 'b3', '5', '6'] },
    { id: 'm7', sym: 'm7', name: 'minor 7th', fam: 'min', tones: ['1', 'b3', '5', 'b7'] },
    { id: 'madd9', sym: 'm(add9)', name: 'minor add 9', fam: 'min', tones: ['1', 'b3', '5', '9'] },
    { id: 'm69', sym: 'm6/9', name: 'minor 6/9', fam: 'min', tones: ['1', 'b3', '5', '6', '9'], v: [['1', 'b3', '6', '9'], ['b3', '5', '6', '9']] },
    { id: 'm9', sym: 'm9', name: 'minor 9th', fam: 'min', tones: ['1', 'b3', '5', 'b7', '9'], v: [['1', 'b3', 'b7', '9'], ['b3', '5', 'b7', '9']] },
    { id: 'm7_11', sym: 'm7/11', name: 'minor 7/11', fam: 'min', tones: ['1', 'b3', '5', 'b7', '11'], v: [['1', 'b3', 'b7', '11'], ['b3', '5', 'b7', '11']] },
    { id: 'm11', sym: 'm11', name: 'minor 11th', fam: 'min', tones: ['1', 'b3', '5', 'b7', '9', '11'], v: [['1', 'b3', 'b7', '11'], ['b3', 'b7', '9', '11']] },
    { id: 'mmaj7', sym: 'm(maj7)', name: 'minor major 7th', fam: 'min', tones: ['1', 'b3', '5', '7'] },
    { id: 'mmaj9', sym: 'm(maj9)', name: 'minor major 9th', fam: 'min', tones: ['1', 'b3', '5', '7', '9'], v: [['1', 'b3', '7', '9'], ['b3', '5', '7', '9']] },
    // Half-diminished
    { id: 'm7b5', sym: 'm7♭5', name: 'minor 7th ♭5', fam: 'hdim', tones: ['1', 'b3', 'b5', 'b7'] },
    // Dominant family
    { id: '7', sym: '7', name: 'dominant 7th', fam: 'dom', tones: ['1', '3', '5', 'b7'] },
    { id: '7_6', sym: '7/6', name: 'dominant 7/6', fam: 'dom', tones: ['1', '3', '5', '6', 'b7'], v: [['1', '3', '6', 'b7']] },
    { id: '9', sym: '9', name: 'dominant 9th', fam: 'dom', tones: ['1', '3', '5', 'b7', '9'], v: [['1', '3', 'b7', '9'], ['3', '5', 'b7', '9']] },
    { id: '11', sym: '11', name: 'dominant 11th', fam: 'dom', tones: ['1', '5', 'b7', '9', '11'], v: [['1', 'b7', '9', '11'], ['5', 'b7', '9', '11'], ['1', '5', 'b7', '11']] },
    { id: '13', sym: '13', name: 'dominant 13th', fam: 'dom', tones: ['1', '3', '5', 'b7', '9', '13'], v: [['1', '3', 'b7', '13'], ['3', 'b7', '9', '13']] },
    { id: '7sus', sym: '7sus', name: 'dominant 7th suspended', fam: 'dom', tones: ['1', '4', '5', 'b7'] },
    { id: '13sus', sym: '13sus', name: 'dominant 13th suspended', fam: 'dom', tones: ['1', '4', '5', 'b7', '9', '13'], v: [['1', '4', 'b7', '13'], ['4', 'b7', '9', '13']] },
    // Altered dominants
    { id: '7b9', sym: '7♭9', name: 'dominant 7th ♭9', fam: 'dom', alt: true, tones: ['1', '3', '5', 'b7', 'b9'], v: [['1', '3', 'b7', 'b9'], ['3', '5', 'b7', 'b9']] },
    { id: '7#9', sym: '7♯9', name: 'dominant 7th ♯9', fam: 'dom', alt: true, tones: ['1', '3', '5', 'b7', '#9'], v: [['1', '3', 'b7', '#9']] },
    { id: '7b5', sym: '7♭5', name: 'dominant 7th ♭5', fam: 'dom', alt: true, tones: ['1', '3', 'b5', 'b7'] },
    { id: '7#5', sym: '7+', name: 'dominant 7th ♯5', fam: 'dom', alt: true, tones: ['1', '3', '#5', 'b7'] },
    { id: '9b5', sym: '9♭5', name: 'dominant 9th ♭5', fam: 'dom', alt: true, tones: ['1', '3', 'b5', 'b7', '9'], v: [['3', 'b5', 'b7', '9'], ['1', '3', 'b5', '9']] },
    { id: '9#5', sym: '9+', name: 'dominant 9th ♯5', fam: 'dom', alt: true, tones: ['1', '3', '#5', 'b7', '9'], v: [['3', '#5', 'b7', '9'], ['1', '3', '#5', '9']] },
    { id: '7b9b5', sym: '7♭9♭5', name: 'dominant 7th ♭9 ♭5', fam: 'dom', alt: true, tones: ['1', '3', 'b5', 'b7', 'b9'], v: [['3', 'b5', 'b7', 'b9']] },
    { id: '7b9#5', sym: '7♭9+', name: 'dominant 7th ♭9 ♯5', fam: 'dom', alt: true, tones: ['1', '3', '#5', 'b7', 'b9'], v: [['3', '#5', 'b7', 'b9']] },
    { id: '7#9#5', sym: '7♯9+', name: 'dominant 7th ♯9 ♯5', fam: 'dom', alt: true, tones: ['1', '3', '#5', 'b7', '#9'], v: [['3', '#5', 'b7', '#9']] },
    { id: '13b9', sym: '13♭9', name: 'dominant 13th ♭9', fam: 'dom', alt: true, tones: ['1', '3', '5', 'b7', 'b9', '13'], v: [['3', 'b7', 'b9', '13'], ['1', '3', 'b9', '13']] },
    { id: '9#11', sym: '9+11', name: 'dominant 9th +11', fam: 'dom', alt: true, tones: ['1', '3', '5', 'b7', '9', '#11'], v: [['3', 'b7', '9', '#11'], ['1', '3', 'b7', '#11']] },
    // Diminished & augmented: outside the major / minor / dominant families
    { id: 'dim', sym: '°', name: 'diminished triad', fam: 'dim', tones: ['1', 'b3', 'b5'] },
    { id: 'dim7', sym: '°7', name: 'diminished 7th', fam: 'dim', tones: ['1', 'b3', 'b5', 'bb7'] },
    { id: 'aug', sym: '+', name: 'augmented', fam: 'aug', tones: ['1', '3', '#5'] },
  ];
  const Q = Object.fromEntries(QUALITIES.map((q) => [q.id, q]));

  function makeChord(root, qid) {
    const q = Q[qid];
    if (!q) throw new Error('Unknown quality ' + qid);
    const r = parseNote(root);
    const tones = q.tones.map((deg) => {
      const [semis, steps] = TONES[deg];
      const pc = mod(r.pc + semis);
      return { deg, pc, name: noteName(mod(r.letter + steps, 7), pc) || SHARP_NAMES[pc] };
    });
    return { root, rootPc: r.pc, q: qid, fam: q.fam, sym: pretty(root) + q.sym, tones, key: r.pc + ':' + qid };
  }

  const chordPcs = (c) => c.tones.map((t) => t.pc);

  // ---------- keys & progression templates ----------

  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  // Minor keys draw on natural, harmonic and melodic minor together, the way
  // tunes in minor keys actually use them (i m6, i m(maj7), V7 all belong).
  const MINOR = [0, 2, 3, 5, 7, 8, 9, 10, 11];
  const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
  const KEY_NAMES = {
    major: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    minor: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  };

  function makeKey(tonic, mode) {
    const pc = parseNote(tonic).pc;
    return { tonic, pc, mode, scale: (mode === 'minor' ? MINOR : MAJOR).map((s) => mod(pc + s)) };
  }

  // Slot spec: roman numeral, semitones and letter steps above the tonic, family,
  // and the chord the slot starts with.
  const S = (rn, semis, step, fam, q) => ({ rn, semis, step, fam, q });
  const TEMPLATES = [
    { id: 'ii-V-I', name: 'ii – V – I', mode: 'major', slots: [S('ii', 2, 1, 'min', 'm7'), S('V', 7, 4, 'dom', '7'), S('I', 0, 0, 'maj', 'maj7')] },
    { id: 'ii-V-i', name: 'iiø – V – i (minor)', mode: 'minor', slots: [S('iiø', 2, 1, 'hdim', 'm7b5'), S('V', 7, 4, 'dom', '7'), S('i', 0, 0, 'min', 'm6')] },
    { id: 'I-vi-ii-V', name: 'I – vi – ii – V', mode: 'major', slots: [S('I', 0, 0, 'maj', 'maj7'), S('vi', 9, 5, 'min', 'm7'), S('ii', 2, 1, 'min', 'm7'), S('V', 7, 4, 'dom', '7')] },
    { id: 'iii-vi-ii-V-I', name: 'iii – vi – ii – V – I', mode: 'major', slots: [S('iii', 4, 2, 'min', 'm7'), S('vi', 9, 5, 'min', 'm7'), S('ii', 2, 1, 'min', 'm7'), S('V', 7, 4, 'dom', '7'), S('I', 0, 0, 'maj', 'maj7')] },
    { id: 'I-IV-V-I', name: 'I – IV – V – I', mode: 'major', slots: [S('I', 0, 0, 'maj', 'maj'), S('IV', 5, 3, 'maj', 'maj'), S('V', 7, 4, 'dom', '7'), S('I', 0, 0, 'maj', 'maj')] },
    { id: 'I-V-vi-IV', name: 'I – V – vi – IV', mode: 'major', slots: [S('I', 0, 0, 'maj', 'maj'), S('V', 7, 4, 'dom', 'maj'), S('vi', 9, 5, 'min', 'm'), S('IV', 5, 3, 'maj', 'maj')] },
    { id: 'i-iv-V-i', name: 'i – iv – V – i (minor)', mode: 'minor', slots: [S('i', 0, 0, 'min', 'm'), S('iv', 5, 3, 'min', 'm7'), S('V', 7, 4, 'dom', '7'), S('i', 0, 0, 'min', 'm')] },
    { id: 'cycle', name: 'III7 – VI7 – II7 – V7 (the cycle)', mode: 'major', slots: [S('III7', 4, 2, 'dom', '7'), S('VI7', 9, 5, 'dom', '7'), S('II7', 2, 1, 'dom', '7'), S('V7', 7, 4, 'dom', '7'), S('I', 0, 0, 'maj', '6')] },
    {
      id: 'blues', name: '12-bar blues', mode: 'major',
      slots: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'].map((rn) =>
        rn === 'I7' ? S(rn, 0, 0, 'dom', '7') : rn === 'IV7' ? S(rn, 5, 3, 'dom', '7') : S(rn, 7, 4, 'dom', '7')),
    },
  ];
  const TEMPLATE = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

  /** The 12 starting chords for a template, each spelled from its key. */
  function startChoices(template) {
    const first = template.slots[0];
    const out = [];
    for (let pc = 0; pc < 12; pc++) {
      const tonic = KEY_NAMES[template.mode][mod(pc - first.semis)];
      out.push({ pc, root: transpose(tonic, first.semis, first.step), tonic });
    }
    return out;
  }

  function keyForStart(template, startRoot) {
    const first = template.slots[0];
    const tonicPc = mod(parseNote(startRoot).pc - first.semis);
    return makeKey(KEY_NAMES[template.mode][tonicPc], template.mode);
  }

  const slotRoot = (key, spec) => transpose(key.tonic, spec.semis, spec.step);
  const defaultChord = (key, spec) => makeChord(slotRoot(key, spec), spec.q);

  // ---------- roman numerals ----------

  function roman(chord, key, bare = false) {
    const r = parseNote(chord.root), t = parseNote(key.tonic);
    const steps = mod(r.letter - t.letter, 7);
    let diff = mod(chord.rootPc - key.pc) - MAJOR[steps];
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    const acc = diff > 0 ? '♯'.repeat(diff) : '♭'.repeat(-diff);
    let rn = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][steps];
    const q = Q[chord.q];
    let suffix = q.sym;
    if (q.fam === 'min' || q.fam === 'hdim' || q.fam === 'dim') rn = rn.toLowerCase();
    if (bare) return acc + rn;
    if (q.fam === 'min') suffix = suffix.replace(/^m/, '');
    if (q.fam === 'hdim') suffix = 'ø7';
    return acc + rn + suffix;
  }

  // ---------- legal options ----------

  const isSubset = (pcs, scale) => pcs.every((p) => scale.includes(p));
  const famFits = (slotFam, q) =>
    q.fam === slotFam || (slotFam === 'dom' && q.id === 'maj') || (slotFam === 'hdim' && q.id === 'dim');

  function nextIndex(template, index) { return index + 1 < template.slots.length ? index + 1 : 0; }

  /** The chord a slot currently resolves into: the filled chord, or the template's default. */
  function chordAt(state, index) {
    const s = state.slots[index];
    return (s && s.main) || defaultChord(state.key, state.template.slots[index]);
  }

  /**
   * Legal chords for one slot of a progression.
   * state  = { template, key, slots: [{ main, split }] }
   * target = 'main' (the slot's chord) or 'split' (a passing chord for the 2nd half of the bar)
   * Returns groups: [{ id, title, blurb, items: [{ chord, fn, rule }] }]
   */
  function options(state, index, target = 'main') {
    const { template, key } = state;
    const spec = template.slots[index];
    const ni = nextIndex(template, index);
    const next = chordAt(state, ni);
    const n = next.rootPc, nName = next.root, nFam = Q[next.q].fam;
    const nRoman = roman(next, key, true); // "ii", not "ii9", after a slash
    const first = index === 0;
    const last = index === template.slots.length - 1;

    const seen = new Set();
    const groups = [];
    function group(id, title, blurb) {
      const g = { id, title, blurb, items: [] };
      groups.push(g);
      return (root, qids, rule, fn) => {
        for (const qid of qids) {
          const chord = makeChord(root, qid);
          if (seen.has(chord.key)) continue;
          seen.add(chord.key);
          g.items.push({ chord, fn: fn || roman(chord, key), rule });
        }
      };
    }

    if (target === 'split') {
      const cur = chordAt(state, index);
      const r = cur.rootPc, rName = cur.root, curFam = Q[cur.q].fam;
      const add = group('passing', 'Passing chords', `Second half of the bar, leading into ${next.sym}.`);
      if (nFam !== 'dim' && nFam !== 'hdim') {
        add(transpose(nName, 7, 4), ['7', '9', '13', '7b9'],
          `Secondary dominant — the dominant a 5th above ${next.sym}, played for the 2nd half of the bar`, 'V7/' + nRoman);
      }
      add(transpose(nName, 1, 1), ['7', '9'],
        `Tritone substitute — a dominant a half-step above ${next.sym} slides down into it`, 'subV/' + nRoman);
      if (nFam === 'dom') {
        add(transpose(nName, 7, 4), ['m7', 'm9'],
          `Related ii — the m7 a 5th above ${next.sym}, played just before the dominant`, 'ii/' + nRoman);
      }
      add(transpose(nName, -1, -1), ['dim7'],
        `Passing diminished — a half-step below ${next.sym}`);
      if (mod(n - r) === 2) {
        add(rName, ['dim7'], `Passing diminished — on the same root, rising a whole step (C C° Dm7)`);
      }
      if (curFam === 'maj' && (mod(n - r) === 5 || (nFam === 'min' && mod(n - r) === 9))) {
        add(rName, ['aug', '7#5'], `Augmented passing chord — the raised 5th leads from ${cur.sym} and ${next.sym}`);
      }
      return groups.filter((g) => g.items.length);
    }

    const rName = slotRoot(key, spec);
    const r = parseNote(rName).pc;
    const down5 = mod(n - r) === 5; // resolves up a 4th (down a 5th)
    const halfDown = mod(n - r) === 11;

    // 1. Diatonic: the slot's family, every extension whose tones stay in the key.
    //    Dominant slots use their own mixolydian scale so blues and cycle dominants
    //    get their extensions too.
    const scale = spec.fam === 'dom' ? MIXOLYDIAN.map((s) => mod(r + s)) : key.scale;
    const addDia = group('diatonic', 'Diatonic', `The ${spec.rn} family — extensions that stay inside the key.`);
    for (const q of QUALITIES) {
      if (q.alt || !famFits(spec.fam, q)) continue;
      const chord = makeChord(rName, q.id);
      if (!isSubset(chordPcs(chord), scale)) continue;
      // A minor 6th chord clashes with a dominant a 4th higher that follows it.
      if ((q.id === 'm6' || q.id === 'm69') && nFam === 'dom' && down5) continue;
      addDia(rName, [q.id], 'Extension — colour tones that stay inside the key');
    }

    // 2. Altered dominants: only when the next chord is a 4th higher or a half-step lower.
    if (spec.fam === 'dom' && (down5 || halfDown)) {
      const addAlt = group('altered', 'Altered', `Altered tones work because ${next.sym} follows.`);
      addAlt(rName, QUALITIES.filter((q) => q.alt && q.fam === 'dom').map((q) => q.id),
        `Altered dominant — works because ${next.sym} is ${down5 ? 'a 4th higher' : 'a half-step lower'}`);
    }

    // 3. Substitutes: other chords that do the same job. The first slot keeps the
    //    starting chord's root, so it only gets quality changes.
    if (!first) {
      const addSub = group('subs', 'Substitutes', 'Different chords that do the same job.');
      if (spec.fam === 'dom' && down5) {
        addSub(transpose(rName, 6, 4), ['7', '9', '13', '9#11', '7b5'],
          `Tritone substitute — replaces ${pretty(rName)}7 and resolves down a half-step`);
        addSub(transpose(rName, 4, 2), ['m7b5'], `Shared notes — ${pretty(transpose(rName, 4, 2))}m7♭5 = ${pretty(rName)}9 without root`);
        addSub(transpose(rName, 4, 2), ['dim7'], `Shared notes — ${pretty(transpose(rName, 4, 2))}°7 = ${pretty(rName)}7♭9 without root`);
        addSub(transpose(rName, 3, 2), ['13b9', '7b9'], 'Minor-third dominant — dominants a minor third apart share the same diminished core');
        addSub(transpose(rName, 9, 5), ['13b9', '7b9'], 'Minor-third dominant — dominants a minor third apart share the same diminished core');
        addSub(transpose(rName, 2, 1), ['9#11'], '+11 substitute — a 9♯11 chord a whole step higher');
        addSub(transpose(rName, -2, -1), ['9#11'], '+11 substitute — a 9♯11 chord a whole step lower');
        addSub(transpose(rName, 1, 1), ['m7', 'm9'], 'Related ii of the tritone sub — the m7 a half-step above the dominant');
        if (key.mode === 'major' && n === key.pc && spec.semis === 7) {
          addSub(transpose(key.tonic, 10, 6), ['7', '9'], 'Backdoor dominant — ♭VII7 resolves home, borrowed from the parallel minor');
          addSub(transpose(key.tonic, 5, 3), ['m6', 'm7'], 'Borrowed chord — IVm from the parallel minor, resolving to I');
        }
      }
      if (spec.fam === 'maj' && spec.semis === 0) {
        addSub(transpose(key.tonic, 4, 2), ['m7'], `Tonic substitute — IIIm7 shares three notes with Imaj7 (Em7 = Cmaj9 without root)`);
        addSub(transpose(key.tonic, 9, 5), ['m7', 'm9'], `Shared notes — ${pretty(transpose(key.tonic, 9, 5))}m7 = ${pretty(key.tonic)}6`);
        if (last) addSub(key.tonic, ['69#11', 'maj7#11'], 'Ending chord — a raised 11th gives the final chord extra colour');
      }
      if (spec.fam === 'maj' && spec.semis === 5) {
        addSub(transpose(key.tonic, 2, 1), ['m7', 'm9'], `Shared notes — ${pretty(transpose(key.tonic, 2, 1))}m7 = ${pretty(rName)}6`);
        addSub(rName, ['m6', 'm7'], 'Borrowed chord — IVm from the parallel minor');
      }
      if (spec.fam === 'min' && spec.semis === 2) {
        addSub(transpose(key.tonic, 5, 3), ['6', 'maj7', 'maj9', '69'], `Shared notes — ${pretty(transpose(key.tonic, 5, 3))}6 = ${pretty(rName)}m7`);
        addSub(rName, ['m7b5'], `Shared notes — ${pretty(rName)}m7♭5 = ${pretty(transpose(key.tonic, 5, 3))}m6, borrowed from the parallel minor`);
        addSub(transpose(key.tonic, 5, 3), ['m6'], 'Borrowed chord — IVm from the parallel minor');
      }
      if (spec.fam === 'min' && spec.semis === 9) {
        addSub(key.tonic, ['6', 'maj7'], `Shared notes — ${pretty(key.tonic)}6 = ${pretty(rName)}m7`);
      }
      if (spec.fam === 'min' && spec.semis === 4) {
        addSub(key.tonic, ['maj7', 'maj9'], `Tonic substitute — Imaj7 and IIIm7 share three notes`);
      }
      if (spec.fam === 'min' && spec.semis === 0) {
        addSub(transpose(key.tonic, 3, 2), ['6'], `Shared notes — ${pretty(transpose(key.tonic, 3, 2))}6 = ${pretty(key.tonic)}m7`);
        addSub(transpose(key.tonic, 9, 5), ['m7b5'], `Shared notes — ${pretty(transpose(key.tonic, 9, 5))}m7♭5 = ${pretty(key.tonic)}m6`);
      }
      if (spec.fam === 'min' && spec.semis === 5) {
        addSub(transpose(key.tonic, 2, 1), ['m7b5'], `Shared notes — ${pretty(transpose(key.tonic, 2, 1))}m7♭5 = ${pretty(rName)}m6`);
      }
      if (spec.fam === 'hdim') {
        addSub(transpose(key.tonic, 5, 3), ['m6', 'm7'], `Shared notes — ${pretty(transpose(key.tonic, 5, 3))}m6 = ${pretty(rName)}m7♭5`);
        addSub(transpose(key.tonic, 10, 6), ['9'], `Shared notes — ${pretty(transpose(key.tonic, 10, 6))}9 without root = ${pretty(rName)}m7♭5`);
      }
    }

    // 4. Secondary dominants: a chord a 5th above the next one may become its V7.
    const addSec = group('secondary', 'Secondary dominants', `Dominants that pull into ${next.sym}.`);
    const vOfNext = 'V7/' + nRoman;
    if (spec.fam !== 'dom' && mod(r - n) === 7 && nFam !== 'dim') {
      addSec(rName, ['7', '9', '13', '7b9', '7#9', '13b9', '7#5'],
        `Secondary dominant — ${pretty(rName)} becomes the V7 of ${next.sym} (dominant function)`, vOfNext);
    }
    if (!first && nFam !== 'dim') {
      addSec(transpose(nName, 7, 4), ['7', '9', '7b9'], `Secondary dominant — V7 of ${next.sym}, e.g. C D7 G7 C`, vOfNext);
      addSec(transpose(nName, 1, 1), ['7', '9', '13'],
        `Tritone substitute — replaces the V7 of ${next.sym} and resolves down a half-step`, 'subV/' + nRoman);
    }

    return groups.filter((g) => g.items.length);
  }

  function findOption(state, index, target, chordKey) {
    for (const g of options(state, index, target)) {
      const hit = g.items.find((it) => it.chord.key === chordKey);
      if (hit) return { ...hit, group: g.id };
    }
    return null;
  }

  const api = {
    LETTERS, QUALITIES, Q, TONES, TEMPLATES, TEMPLATE, KEY_NAMES, mod,
    parseNote, noteName, transpose, pretty, makeChord, chordPcs, makeKey,
    startChoices, keyForStart, slotRoot, defaultChord, roman, options, findOption, chordAt, nextIndex,
  };
  global.CCTheory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
