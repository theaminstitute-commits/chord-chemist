/* Chord Chemist — plucked-string synth and progression scheduler.
 *
 * Each string is a Karplus–Strong plucked string rendered once per pitch and
 * cached, run through a warm body filter and a short room reverb.
 */
(function (global) {
  'use strict';

  let ctx = null, master = null, bus = null, volume = null;
  let volumeLevel = 1;
  const bufferCache = new Map();

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();
    // Level chain: gentle compression, make-up gain, then a hard limiter so the
    // louder output never clips.
    master = ctx.createGain();
    master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.8;
    volume = ctx.createGain();
    volume.gain.value = volumeLevel;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    // Soft ceiling: unity below 0.7, then rounds off to about -0.8 dBFS, catching
    // the pluck transients the limiter is too slow for.
    const ceiling = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1, ax = Math.abs(x);
      curve[i] = Math.sign(x) * (ax < 0.7 ? ax : 0.7 + 0.27 * Math.tanh((ax - 0.7) / 0.27));
    }
    ceiling.curve = curve;
    ceiling.oversample = '2x';
    master.connect(comp).connect(makeup).connect(volume).connect(limiter).connect(ceiling).connect(ctx.destination);

    // Body: soften the top end and add a little low-mid wood.
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 5200;
    body.Q.value = 0.5;
    const wood = ctx.createBiquadFilter();
    wood.type = 'peaking';
    wood.frequency.value = 180;
    wood.gain.value = 3;
    wood.Q.value = 0.9;
    bus = ctx.createGain();
    bus.connect(wood).connect(body);

    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const verb = ctx.createConvolver();
    verb.buffer = roomImpulse(1.6);
    body.connect(dry).connect(master);
    body.connect(verb).connect(wet).connect(master);
    return ctx;
  }

  function roomImpulse(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  /** Karplus–Strong string with an allpass for exact tuning. */
  function pluckBuffer(midi) {
    if (bufferCache.has(midi)) return bufferCache.get(midi);
    const sr = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const period = sr / freq - 0.5; // the averaging filter adds half a sample
    const N = Math.floor(period - 0.1);
    const frac = period - N;
    const C = (1 - frac) / (1 + frac);
    const seconds = midi < 52 ? 4.2 : midi < 64 ? 3.4 : 2.6;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    // Excitation: filtered noise gives a thumb-and-pick attack rather than a harsh one.
    const ring = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) {
      lp = lp * 0.35 + (Math.random() * 2 - 1) * 0.65;
      ring[i] = lp;
    }
    const damp = midi < 52 ? 0.9985 : midi < 64 ? 0.998 : 0.9978;
    let idx = 0, prev = 0, apX = 0, apY = 0;
    for (let i = 0; i < len; i++) {
      const x = ring[idx];
      const avg = 0.5 * (x + prev) * damp;
      prev = x;
      const y = C * avg + apX - C * apY; // fractional-delay allpass
      apX = avg;
      apY = y;
      ring[idx] = y;
      out[i] = x;
      idx = idx + 1 === N ? 0 : idx + 1;
    }
    const fade = Math.floor(sr * 0.08);
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    bufferCache.set(midi, buf);
    return buf;
  }

  // ---------- sampled jazz guitar ----------
  // FluidR3 GM "Electric Guitar (jazz)", one recording per note (MIDI 40-79), rendered by the
  // midi-js-soundfonts project; CC BY 3.0. Embedded by build.js as window.CCSamples.
  const SAMPLE_GAIN = 3.2; // matches the synth's loudness (measured: about -11 dBFS rms per chord)
  const sampleBuffers = new Map(); // midi -> { buffer, offset }
  let samplesReady = null;
  let voice = 'jazz';

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  /** Where the note actually starts: skip the MP3 encoder's leading silence. */
  function onsetOf(buffer) {
    const d = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) > peak * 0.02) return Math.max(0, i / buffer.sampleRate - 0.002);
    }
    return 0;
  }

  /** Decode the embedded samples once. Safe to call before any sound has been allowed. */
  function loadSamples() {
    if (samplesReady) return samplesReady;
    const notes = global.CCSamples && global.CCSamples.notes;
    const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!notes || !OAC) return (samplesReady = Promise.resolve(false));
    const decoder = new OAC(2, 1, 44100);
    samplesReady = Promise.all(Object.keys(notes).map((midi) =>
      decoder.decodeAudioData(base64ToBuffer(notes[midi])).then((buffer) => {
        // The recordings stop at 3.1 s while the string is still ringing: fade the last
        // 0.4 s so a long note dies away instead of clicking off.
        const fade = Math.floor(buffer.sampleRate * 0.4);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const d = buffer.getChannelData(ch);
          for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
        }
        sampleBuffers.set(+midi, { buffer, offset: onsetOf(buffer) });
      }))).then(() => true, () => false);
    return samplesReady;
  }

  /** The sound for one note: the jazz guitar sample (nearest one, re-pitched, if needed), else the synth. */
  function noteSound(midi) {
    if (voice === 'jazz' && sampleBuffers.size) {
      let key = midi;
      if (!sampleBuffers.has(key)) {
        key = [...sampleBuffers.keys()].reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));
      }
      const s = sampleBuffers.get(key);
      return { buffer: s.buffer, offset: s.offset, rate: Math.pow(2, (midi - key) / 12), gain: SAMPLE_GAIN };
    }
    return { buffer: pluckBuffer(midi), offset: 0, rate: 1, gain: 1 };
  }

  function setVoice(v) { voice = v === 'synth' ? 'synth' : 'jazz'; }

  const live = new Set();

  /** Strum a voicing (MIDI notes low to high) at time `at`; returns a handle to damp it. */
  function strum(midis, at, opts = {}) {
    ensure();
    const t0 = Math.max(at ?? ctx.currentTime, ctx.currentTime);
    const spread = opts.spread ?? 0.022;
    const vel = opts.velocity ?? 0.5;
    const notes = [];
    midis.forEach((m, i) => {
      const sound = noteSound(m);
      const src = ctx.createBufferSource();
      src.buffer = sound.buffer;
      src.playbackRate.value = sound.rate;
      const g = ctx.createGain();
      g.gain.value = vel * (1 - i * 0.04) * sound.gain;
      src.connect(g).connect(bus);
      src.start(t0 + i * spread, sound.offset);
      const note = { src, g };
      notes.push(note);
      live.add(note);
      src.onended = () => live.delete(note);
    });
    return {
      damp(when, release = 0.09) {
        for (const n of notes) {
          try {
            n.g.gain.setValueAtTime(n.g.gain.value, when);
            n.g.gain.linearRampToValueAtTime(0, when + release);
            n.src.stop(when + release + 0.02);
          } catch (e) { /* already stopped */ }
        }
      },
    };
  }

  let timers = [];
  let session = 0;

  function stopAll() {
    session++;
    timers.forEach(clearTimeout);
    timers = [];
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const n of live) {
      try {
        n.g.gain.cancelScheduledValues(now);
        n.g.gain.setValueAtTime(n.g.gain.value, now);
        n.g.gain.linearRampToValueAtTime(0, now + 0.06);
        n.src.stop(now + 0.08);
      } catch (e) { /* ignore */ }
    }
    live.clear();
  }

  let single = null;
  function playChord(midis) {
    ensure();
    stopAll();
    if (single) single.damp(ctx.currentTime, 0.05);
    single = strum(midis, ctx.currentTime + 0.02);
  }

  /**
   * Play a list of events: [{ midis, beats, onStart }].
   * style: 'ring' strums once per chord, 'four' strums every beat (four to the bar).
   */
  function playSequence(events, { tempo = 90, style = 'ring', loop = false, onDone } = {}) {
    ensure();
    stopAll();
    const my = session;
    const beat = 60 / tempo;

    function pass(startAt) {
      let t = startAt;
      let prevHandle = null;
      events.forEach((ev, i) => {
        const dur = ev.beats * beat;
        const strums = style === 'four' ? Math.max(1, Math.round(ev.beats)) : 1;
        for (let k = 0; k < strums; k++) {
          const at = t + k * beat;
          if (prevHandle) prevHandle.damp(at - 0.01, style === 'four' ? 0.05 : 0.12);
          prevHandle = strum(ev.midis, at, {
            spread: style === 'four' ? 0.012 : 0.024,
            velocity: style === 'four' ? (k % 2 ? 0.36 : 0.45) : 0.5,
          });
        }
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        timers.push(setTimeout(() => { if (session === my) ev.onStart && ev.onStart(i); }, delay));
        t += dur;
      });
      const endDelay = Math.max(0, (t - ctx.currentTime) * 1000);
      if (loop) {
        timers.push(setTimeout(() => {
          if (session !== my) return;
          if (prevHandle) prevHandle.damp(t - 0.01);
          pass(t);
        }, Math.max(0, endDelay - 250)));
      } else {
        if (prevHandle) prevHandle.damp(t + beat * 1.5, 0.8);
        timers.push(setTimeout(() => { if (session === my && onDone) onDone(); }, endDelay + 200));
      }
    }
    pass(ctx.currentTime + 0.12);
  }

  /** Output volume, 0–1.5 (1 = normal). */
  function setVolume(v) {
    volumeLevel = v;
    if (volume) volume.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
  }

  global.CCAudio = { ensure, playChord, playSequence, stopAll, setVolume, setVoice, loadSamples };
})(typeof window !== 'undefined' ? window : globalThis);
