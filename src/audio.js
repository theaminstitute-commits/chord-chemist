/* Chord Chemist — plucked-string synth, sampled jazz guitar, progression scheduler and
 * offline rendering (exported backing tracks).
 *
 * Each string is a Karplus–Strong plucked string rendered once per pitch and
 * cached, run through a warm body filter and a short room reverb. The same
 * signal chain is built on an OfflineAudioContext to render a WAV.
 */
(function (global) {
  'use strict';

  let ctx = null, live = null; // live: the signal chain on the real-time context
  let volumeLevel = 1;
  const bufferCache = new Map();

  /**
   * The signal chain on a context: guitar bus → body → reverb → level chain → out.
   * The soft ceiling that keeps live playback from clipping rounds off every pluck transient
   * (faintly gritty in a file), so an export leaves it out and is peak-normalised afterwards.
   */
  function makeGraph(c, { softCeiling = true } = {}) {
    // Level chain: gentle compression, make-up gain, then a hard limiter so the
    // louder output never clips.
    const master = c.createGain();
    master.gain.value = 1;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const makeup = c.createGain();
    makeup.gain.value = 1.8;
    const volume = c.createGain();
    volume.gain.value = 1;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    // Soft ceiling: unity below 0.7, then rounds off to about -0.8 dBFS, catching
    // the pluck transients the limiter is too slow for.
    const ceiling = c.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1, ax = Math.abs(x);
      curve[i] = Math.sign(x) * (ax < 0.7 ? ax : 0.7 + 0.27 * Math.tanh((ax - 0.7) / 0.27));
    }
    ceiling.curve = curve;
    ceiling.oversample = '2x';
    const out = master.connect(comp).connect(makeup).connect(volume).connect(limiter);
    if (softCeiling) out.connect(ceiling).connect(c.destination);
    else out.connect(c.destination);

    // Body: soften the top end and add a little low-mid wood.
    const body = c.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 5200;
    body.Q.value = 0.5;
    const wood = c.createBiquadFilter();
    wood.type = 'peaking';
    wood.frequency.value = 180;
    wood.gain.value = 3;
    wood.Q.value = 0.9;
    const bus = c.createGain();
    bus.connect(wood).connect(body);

    const dry = c.createGain();
    dry.gain.value = 0.85;
    const wet = c.createGain();
    wet.gain.value = 0.22;
    const verb = c.createConvolver();
    verb.buffer = roomImpulse(c, 1.6);
    body.connect(dry).connect(master);
    body.connect(verb).connect(wet).connect(master);
    return { ctx: c, master, bus, volume, notes: new Set() };
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();
    live = makeGraph(ctx);
    live.volume.gain.value = volumeLevel;
    return ctx;
  }

  function roomImpulse(c, seconds) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
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

  // ---------- metronome ----------
  // A short tick: a sine burst with a touch of noise, higher on the first beat of a bar.
  const clickCache = new Map();
  function clickBuffer(accent) {
    const key = accent ? 'hi' : 'lo';
    if (clickCache.has(key)) return clickCache.get(key);
    const sr = ctx.sampleRate, len = Math.floor(sr * 0.05);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const f = accent ? 1760 : 1175;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = (Math.sin(2 * Math.PI * f * t) * 0.8 + (Math.random() * 2 - 1) * 0.2) * Math.exp(-t * (accent ? 90 : 120));
    }
    clickCache.set(key, buf);
    return buf;
  }

  function click(graph, at, accent, gain) {
    const src = graph.ctx.createBufferSource();
    src.buffer = clickBuffer(accent);
    const g = graph.ctx.createGain();
    g.gain.value = gain * (accent ? 1 : 0.7);
    src.connect(g).connect(graph.master); // straight to the level chain: no guitar body, no reverb
    src.start(at);
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

  /** Strum a voicing (MIDI notes low to high) on a graph at time `at`; returns a handle to damp it. */
  function strum(graph, midis, at, opts = {}) {
    const c = graph.ctx;
    const t0 = Math.max(at ?? c.currentTime, c.currentTime);
    const spread = opts.spread ?? 0.022;
    const vel = opts.velocity ?? 0.5;
    const notes = [];
    midis.forEach((m, i) => {
      const sound = noteSound(m);
      const src = c.createBufferSource();
      src.buffer = sound.buffer;
      src.playbackRate.value = sound.rate;
      const g = c.createGain();
      g.gain.value = vel * (1 - i * 0.04) * sound.gain;
      src.connect(g).connect(graph.bus);
      src.start(t0 + i * spread, sound.offset);
      const note = { src, g };
      notes.push(note);
      graph.notes.add(note);
      src.onended = () => graph.notes.delete(note);
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

  /**
   * Lay a list of events out on a graph from `startAt`. Each event is
   * { midis, beats, tempo?, style?, bar?, count? }: `bar: false` marks a chord that starts
   * mid-bar (a passing chord), so the metronome does not accent it; `count: true` is a
   * count-in bar, which clicks even when the metronome is off (and has no chord).
   * style 'ring' strums once per chord, 'four' strums every beat (four to the bar).
   * Returns the end time, when each event starts, and the last strum's handle.
   */
  function layout(graph, events, { startAt, tempo = 90, style = 'ring', clicks = false, clickGain = 0.5 }) {
    let t = startAt, last = null, beat = 60 / tempo;
    const starts = [];
    events.forEach((ev) => {
      beat = 60 / (ev.tempo || tempo);
      const st = ev.style || style;
      const n = Math.max(1, Math.round(ev.beats));
      starts.push(t);
      if (ev.midis && ev.midis.length) {
        const strums = st === 'four' ? n : 1;
        for (let k = 0; k < strums; k++) {
          const at = t + k * beat;
          if (last) last.damp(at - 0.01, st === 'four' ? 0.05 : 0.12);
          last = strum(graph, ev.midis, at, {
            spread: st === 'four' ? 0.012 : 0.024,
            velocity: st === 'four' ? (k % 2 ? 0.36 : 0.45) : 0.5,
          });
        }
      }
      if (clicks || ev.count) {
        for (let b = 0; b < n; b++) click(graph, t + b * beat, b === 0 && ev.bar !== false, clickGain);
      }
      t += ev.beats * beat;
    });
    return { end: t, starts, last, beat };
  }

  let timers = [];
  let session = 0;
  const stopListeners = [];

  function stopAll() {
    session++;
    timers.forEach(clearTimeout);
    timers = [];
    stopListeners.forEach((cb) => cb());
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const n of live.notes) {
      try {
        n.g.gain.cancelScheduledValues(now);
        n.g.gain.setValueAtTime(n.g.gain.value, now);
        n.g.gain.linearRampToValueAtTime(0, now + 0.06);
        n.src.stop(now + 0.08);
      } catch (e) { /* ignore */ }
    }
    live.notes.clear();
  }

  /** Called whenever playback stops (for any reason), so highlights can be cleared. */
  function onStop(cb) { stopListeners.push(cb); }

  let single = null;
  function playChord(midis) {
    ensure();
    stopAll();
    if (single) single.damp(ctx.currentTime, 0.05);
    single = strum(live, midis, ctx.currentTime + 0.02);
  }

  /** Play events (see layout) live: [{ midis, beats, onStart, ... }]. */
  function playSequence(events, { tempo = 90, style = 'ring', loop = false, clicks = false, onDone } = {}) {
    ensure();
    stopAll();
    const my = session;

    function pass(startAt) {
      const { end, starts, last, beat } = layout(live, events, { startAt, tempo, style, clicks });
      starts.forEach((at, i) => {
        const delay = Math.max(0, (at - ctx.currentTime) * 1000);
        timers.push(setTimeout(() => { if (session === my) events[i].onStart && events[i].onStart(i); }, delay));
      });
      const endDelay = Math.max(0, (end - ctx.currentTime) * 1000);
      if (loop) {
        timers.push(setTimeout(() => {
          if (session !== my) return;
          if (last) last.damp(end - 0.01);
          pass(end);
        }, Math.max(0, endDelay - 250)));
      } else {
        if (last) last.damp(end + beat * 1.5, 0.8);
        timers.push(setTimeout(() => { if (session === my && onDone) onDone(); }, endDelay + 200));
      }
    }
    pass(ctx.currentTime + 0.12);
  }

  /** How long a list of events lasts, in seconds. */
  const seconds = (events, tempo = 90) => events.reduce((s, ev) => s + ev.beats * 60 / (ev.tempo || tempo), 0);

  /**
   * Render events to an AudioBuffer (stereo, at the live context's rate) with the same
   * sound as playback, plus a ring-out after the last chord, peak-normalised to -1 dBFS.
   */
  async function render(events, { tempo = 90, style = 'ring', clicks = false } = {}) {
    ensure();
    const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    const lastBeat = 60 / ((events.length ? events[events.length - 1].tempo : 0) || tempo);
    const lead = 0.05, tail = lastBeat * 1.5 + 1.8;
    const total = lead + seconds(events, tempo) + tail;
    const off = new OAC(2, Math.ceil(total * ctx.sampleRate), ctx.sampleRate);
    const graph = makeGraph(off, { softCeiling: false });
    const { end, last, beat } = layout(graph, events, { startAt: lead, tempo, style, clicks });
    if (last) last.damp(end + beat * 1.5, 0.8);
    const buf = await off.startRendering();
    const fade = Math.floor(buf.sampleRate * 0.25); // no click at the very end
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    const gain = peak > 0.01 ? Math.min(4, 0.891 / peak) : 1; // -1 dBFS; never boosting silence
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] *= gain;
    }
    return buf;
  }

  /** 16-bit samples per channel, rounded with TPDF dither so quiet tails do not turn grainy. */
  function pcm16(buffer) {
    const out = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const f = buffer.getChannelData(c), s = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) {
        const dither = (Math.random() - Math.random()) / 32768; // triangular, ±1 LSB
        s[i] = Math.max(-32768, Math.min(32767, Math.round((f[i] + dither) * 32767)));
      }
      out.push(s);
    }
    return out;
  }

  /** An AudioBuffer (or anything with the same shape) as a 16-bit PCM WAV file. */
  function encodeWav(buffer) {
    const ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
    const bytes = 44 + n * ch * 2;
    const ab = new ArrayBuffer(bytes);
    const v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const chans = pcm16(buffer);
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        v.setInt16(o, chans[c][i], true);
        o += 2;
      }
    }
    return ab;
  }

  /** Output volume, 0–1.5 (1 = normal). */
  function setVolume(v) {
    volumeLevel = v;
    if (live) live.volume.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
  }

  const sampleRate = () => (ctx ? ctx.sampleRate : 44100);

  const api = { ensure, playChord, playSequence, stopAll, onStop, setVolume, setVoice, loadSamples, seconds, render, pcm16, encodeWav, sampleRate };
  global.CCAudio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
