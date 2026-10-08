// Run with: node test/theory.test.js
const assert = require('node:assert/strict');
const T = require('../src/theory.js');
const V = require('../src/voicings.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}

const keysOf = (groups, id) => (groups.find((g) => g.id === id) || { items: [] }).items.map((it) => it.chord.sym);
const all = (groups) => groups.flatMap((g) => g.items.map((it) => it.chord.sym));
function stateFor(templateId, start, mains = []) {
  const template = T.TEMPLATE[templateId];
  const key = T.keyForStart(template, start);
  return { template, key, slots: template.slots.map((_, i) => ({ main: mains[i] || null, split: null })) };
}

test('spelling', () => {
  assert.equal(T.transpose('G', 6, 4), 'Db');
  assert.equal(T.transpose('D', -1, -1), 'C#');
  assert.equal(T.transpose('C', 10, 6), 'Bb');
  assert.deepEqual(T.makeChord('Eb', 'm7b5').tones.map((t) => t.name), ['Eb', 'Gb', 'Bbb', 'Db']);
  assert.deepEqual(T.makeChord('B', 'dim7').tones.map((t) => t.name), ['B', 'D', 'F', 'Ab']);
  assert.deepEqual(T.makeChord('G', '13b9').tones.map((t) => t.name), ['G', 'B', 'D', 'F', 'Ab', 'E']);
});

test('start choices spell keys sensibly', () => {
  const ch = T.startChoices(T.TEMPLATE['ii-V-I']);
  assert.equal(ch.find((c) => c.pc === 2).root, 'D');
  assert.equal(ch.find((c) => c.pc === 2).tonic, 'C');
  assert.equal(ch.find((c) => c.pc === 3).tonic, 'Db'); // Ebm7 -> Db major
  assert.equal(T.keyForStart(T.TEMPLATE['ii-V-i'], 'B').tonic, 'A');
});

test('ii-V-I in C: ii slot', () => {
  const g = T.options(stateFor('ii-V-I', 'D'), 0);
  const dia = keysOf(g, 'diatonic');
  for (const c of ['Dm', 'Dm7', 'Dm9', 'Dm11', 'Dm7/11']) assert.ok(dia.includes(c), c);
  assert.ok(!dia.includes('Dm6'), 'm6 before V is excluded');
  assert.ok(!dia.includes('Dm(maj7)'));
  assert.ok(keysOf(g, 'secondary').includes('D7'), 'II7 = V7/V');
  assert.ok(!g.some((x) => x.id === 'subs'), 'first slot keeps its root');
});

test('ii-V-I in C: V slot', () => {
  const g = T.options(stateFor('ii-V-I', 'D'), 1);
  const dia = keysOf(g, 'diatonic');
  for (const c of ['G7', 'G9', 'G13', 'G7sus', 'G']) assert.ok(dia.includes(c), c);
  for (const c of ['G7♭9', 'G7♯9', 'G7+', 'G13♭9']) assert.ok(keysOf(g, 'altered').includes(c), c);
  const subs = keysOf(g, 'subs');
  for (const c of ['D♭7', 'D♭9', 'Bm7♭5', 'B°7', 'B♭7', 'Fm6', 'B♭13♭9']) assert.ok(subs.includes(c), c);
});

test('ii-V-I in C: I slot', () => {
  const g = T.options(stateFor('ii-V-I', 'D'), 2);
  const dia = keysOf(g, 'diatonic');
  for (const c of ['C', 'C6', 'Cmaj7', 'C6/9', 'Cmaj9', 'Cadd9', 'Cmaj13']) assert.ok(dia.includes(c), c);
  assert.ok(!dia.includes('Cmaj7♯11'), '#11 is not in C major');
  assert.ok(keysOf(g, 'subs').includes('C6/9♯11'), 'ending chord');
  assert.ok(keysOf(g, 'subs').includes('Am7'));
});

test('altered only when resolving', () => {
  const blues = stateFor('blues', 'C');
  assert.ok(T.options(blues, 0).some((g) => g.id === 'altered'), 'I7 -> IV7 goes up a 4th');
  assert.ok(!T.options(blues, 1).some((g) => g.id === 'altered'), 'IV7 -> I7 does not');
  assert.ok(keysOf(T.options(blues, 0), 'diatonic').includes('C13'), 'blues I7 gets mixolydian extensions');
});

test('passing chords', () => {
  const s = stateFor('I-vi-ii-V', 'C');
  const p = all(T.options(s, 0, 'split'));
  for (const c of ['E7', 'B♭7', 'G♯°7']) assert.ok(p.includes(c), c);
  const p2 = all(T.options(s, 2, 'split')); // Dm7 -> G7
  assert.ok(p2.includes('Dm7') || p2.includes('Dm9'), 'related ii of G7');
});

test('changing the next chord changes legality', () => {
  const s = stateFor('ii-V-I', 'D', [null, T.makeChord('Db', '7')]);
  // With Db7 in slot 2, D7 is no longer a 5th above the next chord...
  assert.ok(!keysOf(T.options(s, 0), 'secondary').includes('D7'));
  // ...but Ab7 (V of Db7) is.
  assert.ok(T.findOption(stateFor('ii-V-I', 'D', [null, T.makeChord('Db', '7')]), 1, 'main', T.makeChord('Db', '7').key));
});

test('minor ii-V-i', () => {
  const s = stateFor('ii-V-i', 'D');
  assert.equal(s.key.tonic, 'C');
  assert.ok(keysOf(T.options(s, 0), 'diatonic').includes('Dm7♭5'));
  const i = keysOf(T.options(s, 2), 'diatonic');
  for (const c of ['Cm6', 'Cm(maj7)', 'Cm9', 'Cm7']) assert.ok(i.includes(c), c);
});

test('every quality has voicings and they only use chord tones', () => {
  for (const root of ['C', 'F#', 'Bb', 'E']) {
    for (const q of T.QUALITIES) {
      const chord = T.makeChord(root, q.id);
      const list = V.voicings(chord);
      assert.ok(list.length > 0, chord.sym + ' has no voicings');
      const pcs = new Set(T.chordPcs(chord));
      for (const v of list) for (const m of v.midi) assert.ok(pcs.has(m % 12), chord.sym + ' ' + v.id);
    }
  }
});

test('voice leading keeps the hand close', () => {
  const dm7 = T.makeChord('D', 'm7'), g7 = T.makeChord('G', '7');
  const a = V.voicings(dm7)[V.chooseVoicing(dm7)];
  const b = V.voicings(g7)[V.chooseVoicing(g7, a)];
  assert.ok(V.distance(a, b) < 3, `moved ${V.distance(a, b)} from ${a.id} to ${b.id}`);
});

// Exported backing tracks: the WAV encoder and event timing (no audio hardware needed).
const A = require('../src/audio.js');
test('encodeWav writes a 16-bit PCM header and clamps samples', () => {
  const buffer = { numberOfChannels: 2, length: 3, sampleRate: 44100, getChannelData: (c) => (c === 0 ? [0, 1, -2] : [0.5, -1, 0]) };
  const v = new DataView(A.encodeWav(buffer));
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
  assert.equal(v.byteLength, 44 + 3 * 2 * 2);
  assert.equal(v.getUint32(4, true), v.byteLength - 8);
  assert.equal(v.getUint16(20, true), 1); // PCM
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(28, true), 44100 * 4);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 12);
  // Interleaved L R L R L R; dither moves unclamped values by at most one step.
  const got = [44, 46, 48, 50, 52, 54].map((o) => v.getInt16(o, true));
  [0, 16384, 32767, -32768, -32768, 0].forEach((want, i) => assert.ok(Math.abs(got[i] - want) <= 1, `sample ${i}: ${got[i]} vs ${want}`));
});
test('pcm16 dithers without ever clipping', () => {
  const f = new Float32Array(2000).map((_, i) => Math.sin(i / 7) * 1.2);
  const [s] = A.pcm16({ numberOfChannels: 1, getChannelData: () => f });
  assert.equal(Math.max(...s), 32767);
  assert.equal(Math.min(...s), -32768);
  assert.ok(Math.abs(s[0]) <= 1);
});
test('seconds follows each event’s own tempo', () => {
  assert.equal(A.seconds([{ beats: 4, tempo: 120 }, { beats: 2, tempo: 60 }]), 4);
  assert.equal(A.seconds([{ beats: 3 }], 90), 2);
});

console.log(`${passed} tests passed`);
