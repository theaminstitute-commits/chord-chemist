/* Chord Chemist — sampled jazz guitar, a formant choir, the progression scheduler and
 * offline rendering (exported backing tracks).
 *
 * The guitar is one recording per note through a warm body filter and a short room
 * reverb; the choir is synthesised (see sing) and sings into a longer hall. The same
 * signal chain is built on an OfflineAudioContext to render a file.
 */
(function (global) {
  'use strict';

  let ctx = null, live = null; // live: the signal chain on the real-time context
  let volumeLevel = 1;

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

    // The choir sings into its own hall: no guitar body, a longer and wetter reverb.
    const choir = c.createGain();
    const air = c.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 6500;
    air.Q.value = 0.4;
    const choirDry = c.createGain();
    choirDry.gain.value = 0.7;
    const choirWet = c.createGain();
    choirWet.gain.value = 0.5;
    const hall = c.createConvolver();
    hall.buffer = roomImpulse(c, 2.8);
    choir.connect(air);
    air.connect(choirDry).connect(master);
    air.connect(hall).connect(choirWet).connect(master);
    return { ctx: c, master, bus, choir, volume, notes: new Set() };
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

  // ---------- choir ----------
  // "Ah" sung by a small section: three slightly detuned sawtooths per voice, shaped by the
  // vowel's three formant band-passes plus a low "chest" path for the fundamental, with a slow
  // swell in, delayed vibrato at a slightly different rate per voice, and a long hall.
  const FORMANTS = [[750, 1.0, 8], [1150, 0.5, 10], [2700, 0.2, 16]]; // Hz, level, Q
  const CHOIR_GAIN = 0.6; // a sustained pad reads louder than plucks: this sits level with the guitar

  function sing(graph, midi, t0, velocity) {
    const c = graph.ctx;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const peak = velocity * CHOIR_GAIN;
    const env = c.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.32);
    env.gain.linearRampToValueAtTime(peak * 0.85, t0 + 1.0);
    env.connect(graph.choir);

    const vibrato = c.createOscillator();
    vibrato.frequency.value = 4.8 + Math.random() * 1.2;
    const depth = c.createGain(); // cents
    depth.gain.setValueAtTime(0, t0);
    depth.gain.linearRampToValueAtTime(7, t0 + 0.9);
    vibrato.connect(depth);
    const source = c.createGain();
    source.gain.value = 0.34;
    const oscs = [-7, 0, 7].map((cents) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      depth.connect(o.detune);
      o.connect(source);
      return o;
    });
    for (const [f, level, q] of FORMANTS) {
      const formant = c.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = f;
      formant.Q.value = q;
      const g = c.createGain();
      g.gain.value = level;
      source.connect(formant).connect(g).connect(env);
    }
    const chest = c.createBiquadFilter();
    chest.type = 'lowpass';
    chest.frequency.value = 420;
    chest.Q.value = 0.7;
    const chestGain = c.createGain();
    chestGain.gain.value = 0.55;
    source.connect(chest).connect(chestGain).connect(env);

    const nodes = [vibrato, ...oscs];
    nodes.forEach((n) => n.start(t0));
    const stop = (t) => nodes.forEach((n) => { try { n.stop(t); } catch (e) { /* already stopped */ } });
    const note = {
      g: env,
      stop,
      damp(when, release) {
        const r = Math.max(release, 0.25); // a choir never stops dead
        env.gain.setTargetAtTime(0, when, r / 4);
        stop(when + r + 0.3);
      },
    };
    oscs[0].onended = () => graph.notes.delete(note);
    return note;
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

  /** The jazz guitar sample for one note: the nearest recording, re-pitched if needed. */
  function noteSound(midi) {
    let key = midi;
    if (!sampleBuffers.has(key)) {
      key = [...sampleBuffers.keys()].reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));
    }
    const s = sampleBuffers.get(key);
    return { buffer: s.buffer, offset: s.offset, rate: Math.pow(2, (midi - key) / 12), gain: SAMPLE_GAIN };
  }

  function pluck(graph, midi, t0, gain) {
    const c = graph.ctx;
    const sound = noteSound(midi);
    const src = c.createBufferSource();
    src.buffer = sound.buffer;
    src.playbackRate.value = sound.rate;
    const g = c.createGain();
    g.gain.value = gain * sound.gain;
    src.connect(g).connect(graph.bus);
    src.start(t0, sound.offset);
    const note = {
      g,
      stop: (t) => { try { src.stop(t); } catch (e) { /* already stopped */ } },
      damp(when, release) {
        g.gain.setValueAtTime(g.gain.value, when);
        g.gain.linearRampToValueAtTime(0, when + release);
        note.stop(when + release + 0.02);
      },
    };
    src.onended = () => graph.notes.delete(note);
    return note;
  }

  function setVoice(v) { voice = v === 'choir' ? 'choir' : 'jazz'; }

  /**
   * Sound a voicing (MIDI notes low to high) on a graph at time `at`: the guitar strums it,
   * the choir swells in on every note at once. Returns a handle to damp it.
   */
  function strum(graph, midis, at, opts = {}) {
    const c = graph.ctx;
    const t0 = Math.max(at ?? c.currentTime, c.currentTime);
    const vel = opts.velocity ?? 0.5;
    const notes = [];
    if (voice === 'choir' || !sampleBuffers.size) {
      midis.forEach((m) => notes.push(sing(graph, m, t0, vel)));
    } else {
      const spread = opts.spread ?? 0.022;
      midis.forEach((m, i) => notes.push(pluck(graph, m, t0 + i * spread, vel * (1 - i * 0.04))));
    }
    notes.forEach((n) => graph.notes.add(n));
    return {
      damp(when, release = 0.09) {
        for (const n of notes) {
          try { n.damp(when, release); } catch (e) { /* already stopped */ }
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
        n.stop(now + 0.08);
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
    let peak = 0, power = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
      for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); power += d[i] * d[i]; }
    }
    buf.rendered = { peak, rms: Math.sqrt(power / (buf.length * buf.numberOfChannels)) }; // as it came off the chain
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
