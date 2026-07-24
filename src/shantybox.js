// THE SHANTY BOX — the ship's band, synthesised. All WebAudio, zero assets:
// every instrument is oscillators, noise buffers built in code, and biquads
// (the founding identity — audio synthesised in code, like everything else).
// The musical MIND lives in shanties.js (pure, verify-gated); this box only
// turns its deterministic scores into sound.
//
// The design creed, from the research that shaped it:
//  - Music is a VISITOR on this deck. Short renditions, long silences between
//    (Sea of Thieves' ambient cadence). Mute it and the ship feels emptier;
//    unmute and nobody goes looking for the band.
//  - The two-clocks law (Chris Wilson): a lookahead window scheduled against
//    ctx.currentTime, driven here from the game's own frame. The tab hiding
//    stops the frames, so the tail of the window plays out and the music
//    falls silent — exactly right for a background tab.
//  - Sources are one-shot throwaways (create, start, stop, disconnect on
//    ended); everything downstream — body filters, buses, the convolver —
//    is built once. Convolution IR is decaying noise (Moorer / reverbGen).
//  - Ducking and weather live on the BUS: a fight or a gale fades the whole
//    band in half a second; a rendition abandoned mid-tune stays abandoned.
//
// Bus: voices -> [instrument body chains] -> band -> airLP -> dry+wet(IR)
//      -> master (mood gain) -> limiter -> destination

import { tuneById, rotationOrder, planFor, renderScore } from './shanties.js';

const LOOKAHEAD = 0.45;      // seconds scheduled ahead of the clock
const DUCK = 0.12;           // master ramp when standing down — fast, no click
const RISE = 1.4;            // master ramp when the music returns — a breath
const ABANDON_S = 6;         // ducked this long mid-tune = the tune is lost
const MUTE_KEY = 'saltstead-music';

export class ShantyBox {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage[MUTE_KEY] === 'off'; } catch { /* private mode */ }
    this._order = null;       // the day's rotation for the current side
    this._seed = null; this._side = null; this._idx = 0;
    this._score = null;       // the rendition in flight
    this._evIx = 0;           // next unscheduled event in it
    this._t0 = 0;             // ctx time of the rendition's beat zero
    this._spb = 0.5;          // seconds per beat for this rendition
    this._plan = null;
    this._silence = 8;        // seconds of quiet before the first tune
    this._duckedFor = 0;
    this._plucks = new Map(); // Karplus-Strong buffers, cached per midi note
  }

  // called once, inside the first user gesture (autoplay law)
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ac;
    // shared noise (chiff, bow-breath, drums) — built once, sourced many times
    const len = ac.sampleRate * 2;
    this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    // the band bus and the open-air colour
    this.band = ac.createGain();
    this._airLP = ac.createBiquadFilter();
    this._airLP.type = 'lowpass'; this._airLP.frequency.value = 5200; this._airLP.Q.value = 0.5;
    this._conv = ac.createConvolver(); this._conv.buffer = this._makeIR(1.9, 2.6);
    this._wet = ac.createGain(); this._wet.gain.value = 0.22;  // open deck, wooden ship
    this._dry = ac.createGain(); this._dry.gain.value = 0.9;
    this.master = ac.createGain(); this.master.gain.value = 0; // mood-ridden, starts silent
    // a safety brick wall so a stacked chorus can never spike the mix
    this._limit = ac.createDynamicsCompressor();
    this._limit.threshold.value = -12; this._limit.ratio.value = 12;
    this._limit.attack.value = 0.003; this._limit.release.value = 0.25;
    this.band.connect(this._airLP);
    this._airLP.connect(this._dry).connect(this.master);
    this._airLP.connect(this._conv).connect(this._wet).connect(this.master);
    this.master.connect(this._limit).connect(ac.destination);

    // per-instrument pans: the band spreads across the deck, gently
    this._pans = {};
    for (const [name, pan] of [['fiddle', -0.3], ['concertina', 0.25], ['whistle', 0.35],
      ['fife', 0.3], ['brass', -0.2], ['pluck', -0.15], ['drone', 0], ['perc', -0.05],
      ['hum', 0.1]]) {
      const p = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
      if (p.pan) p.pan.value = pan;
      p.connect(this.band);
      this._pans[name] = p;
    }
  }

  // decaying-noise impulse response with a darkening tail — the reverbGen
  // trick: white noise, exponential decay, and a lowpass sweep baked in by
  // simple one-pole filtering that tightens along the buffer.
  _makeIR(secs, decay) {
    const ac = this.ctx;
    const len = Math.floor(ac.sampleRate * secs);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const a = 0.12 + 0.82 * x;               // one-pole tightens: bright head, dark tail
        lp += (Math.random() * 2 - 1 - lp) * (1 - a);
        d[i] = lp * Math.pow(1 - x, decay);
      }
    }
    return b;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage[MUTE_KEY] = m ? 'off' : 'on'; } catch { /* private mode */ }
    if (m) this._abandon();
  }

  // drive once per frame from main.js.
  //   mood: moodFor(...) from shanties.js   side: 'pirate'|'navy'
  //   daySeed: stable per-in-game-day integer
  update(dt, mood, side, daySeed) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const want = this.muted || !mood.play ? 0 : mood.level;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(want, t, want > 0.001 ? RISE : DUCK);
    // heavy weather closes the air down before the gain fully goes — the wind
    // takes the top of the band first (the mix research's distance law)
    const lpWant = mood.mode === 'sail' ? 4200 : mood.mode === 'harbour' ? 5200 : 2000;
    this._airLP.frequency.setTargetAtTime(lpWant, t, 1.2);

    if (want <= 0.001) {
      // standing down: a rendition ducked too long is abandoned, not resumed —
      // a fight is not a fermata
      if (this._score) {
        this._duckedFor += dt;
        if (this._duckedFor > ABANDON_S) this._abandon();
      }
      return;
    }
    this._duckedFor = 0;

    // a new day or a changed flag rebuilds the rotation
    const seed = Math.floor(daySeed) | 0;
    if (this._order === null || seed !== this._seed || side !== this._side) {
      this._order = rotationOrder(seed, side);
      this._seed = seed; this._side = side; this._idx = 0;
    }
    if (!this._order.length) return;

    if (!this._score) {
      // the silence between tunes — music is a visitor, not a resident
      this._silence -= dt;
      if (this._silence > 0) return;
      const tune = tuneById(this._order[this._idx % this._order.length]);
      this._idx++;
      if (!tune) return;
      const plan = planFor(seed * 8191 + this._idx * 127, tune, side);
      this._plan = plan;
      this._score = renderScore(tune, plan);
      this._spb = 60 / (tune.bpm * plan.tempoMul);
      this._t0 = t + 0.25;
      this._evIx = 0;
      this._tune = tune;
      this._doneRuns = new Set(); // slur runs already handed to the bow
    }

    // the two-clocks window: commit everything due inside the lookahead
    const horizon = t + LOOKAHEAD;
    const evs = this._score.events;
    while (this._evIx < evs.length) {
      const e = evs[this._evIx];
      const at = this._t0 + e.t * this._spb;
      if (at > horizon) break;
      this._playEvent(e, at, mood.mode);
      this._evIx++;
    }
    // rendition done: book the next silence (harbour keeps the band warmer)
    if (this._evIx >= evs.length) {
      const endAt = this._t0 + this._score.totalBeats * this._spb;
      if (t > endAt) {
        this._silence = this._plan.gapS * (mood.mode === 'harbour' ? 0.45 : 1);
        this._score = null;
      }
    }
  }

  _abandon() {
    this._score = null; this._plan = null; this._evIx = 0;
    this._duckedFor = 0;
    this._silence = 20 + Math.random() * 30; // the band takes a spell before trying again
  }

  // which instrument carries a lead event: the tune crosses the deck to the
  // response instrument on the MIDDLE passes (call-and-response), coming home
  // to the lead for the first and last
  _leadInstFor(e) {
    const passes = this._plan.repeats || 1;
    const middle = e.rep > 0 && e.rep < passes - 1;
    return middle ? this._plan.responseLead : this._plan.lead;
  }

  _playEvent(e, at, mode) {
    const durS = Math.max(0.08, e.dur * this._spb);
    if (e.voice === 'percLow') return this._drum(at, e.vel, true);
    if (e.voice === 'percHigh') return this._drum(at, e.vel, false);
    if (e.voice === 'drone') return this._drone(e.midi, at, durS, e.vel);
    if (e.voice === 'hum') return this._hum(e.midi, at, durS, e.vel, e.cents || 0);
    let inst, vel = e.vel;
    if (e.voice === 'lead') {
      inst = this._leadInstFor(e);
      // a slur run plays as ONE gesture — the whole run is rendered when its
      // first note crosses the horizon; later members are already spoken for
      const runNotes = e.run >= 0 && this._score.runMap ? this._score.runMap[e.run] : null;
      if (runNotes && runNotes.length > 1 && (inst === 'fiddle' || inst === 'whistle' || inst === 'fife')) {
        if (this._doneRuns.has(e.run)) return;
        this._doneRuns.add(e.run);
        return this._playRun(inst, runNotes);
      }
    } else {
      inst = this._plan.lead === 'fiddle' ? 'concertina' : 'fiddle';
    }
    const f = midiHz(e.midi) * centsMul(e.cents || 0);
    if (inst === 'fiddle') this._fiddle(f, at, durS, vel);
    else if (inst === 'concertina') this._concertina(f, at, durS, vel);
    else if (inst === 'whistle') this._whistle(f, at, durS, vel, false);
    else if (inst === 'fife') this._whistle(f, at, durS, vel, true);
    else if (inst === 'brass') this._brass(f, at, durS, vel);
    else if (inst === 'pluck') this._pluck(e.midi, at, vel);
    else this._fiddle(f, at, durS, vel);
  }

  // A SLUR RUN on one continuous voice: one oscillator drawn through the
  // whole phrase, pitch gliding at each boundary (~35 ms — a finger sliding,
  // not a key pressed), the level dipping a breath at each note-change. This
  // is what separates a played line from a step sequencer.
  _playRun(inst, notes) {
    const ac = this.ctx;
    const fife = inst === 'fife';
    const whistleish = inst === 'whistle' || fife;
    const t0 = this._t0 + notes[0].t * this._spb;
    const end = this._t0 + (notes[notes.length - 1].t + notes[notes.length - 1].dur) * this._spb;
    const o = ac.createOscillator();
    o.type = whistleish ? 'triangle' : 'sawtooth';
    const f0 = midiHz(notes[0].midi) * centsMul(notes[0].cents || 0) * (fife ? 2 : 1);
    o.frequency.setValueAtTime(f0, t0);
    // the glides: hold each pitch until 35 ms before the next note, then slide
    for (let i = 1; i < notes.length; i++) {
      const at = this._t0 + notes[i].t * this._spb;
      const f = midiHz(notes[i].midi) * centsMul(notes[i].cents || 0) * (fife ? 2 : 1);
      o.frequency.setValueAtTime(midiHz(notes[i - 1].midi) * centsMul(notes[i - 1].cents || 0) * (fife ? 2 : 1), at - 0.035);
      o.frequency.linearRampToValueAtTime(f, at);
    }
    // vibrato arrives once the run has settled
    const vib = ac.createOscillator(); vib.frequency.value = whistleish ? 4.8 : 5.4;
    const vibG = ac.createGain();
    vibG.gain.setValueAtTime(0, t0);
    vibG.gain.linearRampToValueAtTime(whistleish ? 8 : 13, t0 + 0.35);
    vib.connect(vibG).connect(o.detune);
    // body / lid per instrument
    const chain = [];
    if (whistleish) {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = fife ? 6000 : 4200;
      chain.push(lp);
    } else {
      const body = ac.createBiquadFilter(); body.type = 'peaking';
      body.frequency.value = 1200; body.Q.value = 2.5; body.gain.value = 3.5;
      const air = ac.createBiquadFilter(); air.type = 'peaking';
      air.frequency.value = 300; air.Q.value = 2; air.gain.value = 2.5;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      chain.push(body, air, lp);
    }
    // the envelope: one attack, a dip at each boundary, one release
    const g = ac.createGain();
    const base = whistleish ? (fife ? 0.13 : 0.11) : 0.16;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(base * notes[0].vel, t0 + (whistleish ? 0.02 : 0.13));
    for (let i = 1; i < notes.length; i++) {
      const at = this._t0 + notes[i].t * this._spb;
      const peak = base * notes[i].vel;
      g.gain.setValueAtTime(base * notes[i - 1].vel, at - 0.05);
      g.gain.linearRampToValueAtTime(peak * 0.72, at);        // the bow lightens
      g.gain.linearRampToValueAtTime(peak, at + 0.06);        // and leans back in
    }
    g.gain.setValueAtTime(base * notes[notes.length - 1].vel, Math.max(t0, end - 0.06));
    g.gain.setTargetAtTime(0, end, whistleish ? 0.05 : 0.11);
    const pan = this._pans[inst];
    let head = o;
    for (const nd of chain) { head.connect(nd); head = nd; }
    head.connect(g).connect(pan);
    const nodes = [o, vib, vibG, ...chain, g];
    // the instrument's breath rides the whole run: bow-hiss or blow-noise
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bf = ac.createBiquadFilter(); bf.type = whistleish ? 'highpass' : 'bandpass';
    bf.frequency.value = whistleish ? 2600 : 3800; bf.Q.value = 1;
    const bg = ac.createGain(); bg.gain.value = base * notes[0].vel * (whistleish ? 0.03 : 0.045);
    s.connect(bf).connect(bg).connect(pan);
    nodes.push(s, bf, bg);
    // the whistle's chiff marks only the run's first articulation
    if (whistleish) {
      const c = ac.createBufferSource(); c.buffer = this.noiseBuf;
      const cf = ac.createBiquadFilter(); cf.type = 'bandpass';
      cf.frequency.value = Math.min(9000, f0 * 2.2); cf.Q.value = 5;
      const cg = ac.createGain();
      cg.gain.setValueAtTime(base * notes[0].vel * 0.5, t0);
      cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      c.connect(cf).connect(cg).connect(pan);
      c.start(t0);
      nodes.push(c, cf, cg);
    }
    o.start(t0); vib.start(t0); s.start(t0);
    this._bury(nodes, end + 0.6);
  }

  // ---- the instruments -----------------------------------------------------
  // Every recipe follows the researched pattern: excitation -> envelope gain
  // -> body filter(s) -> the instrument's pan -> band. Sources are throwaways.

  _bury(nodes, stopAt) {
    // stop and release: the graph must not accumulate dead nodes
    for (const n of nodes) { try { n.stop(stopAt); } catch { /* not a source */ } }
    const first = nodes[0];
    if (first) first.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* fine */ } } };
  }

  // fiddle: sawtooth + slow bow attack + DELAYED vibrato + the odd slide-in.
  // The slow attack is the single biggest "bow, not organ" cue.
  _fiddle(freq, t0, dur, vel) {
    const ac = this.ctx;
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    // a slide into ~1 in 7 notes, from a semitone under — the fiddler's thumb
    if (((freq * 7) | 0) % 7 === 0) {
      o.detune.setValueAtTime(-80, t0);
      o.detune.linearRampToValueAtTime(0, t0 + 0.07);
    }
    const vib = ac.createOscillator(); vib.frequency.value = 5.4;
    const vibG = ac.createGain();
    vibG.gain.setValueAtTime(0, t0);
    vibG.gain.linearRampToValueAtTime(dur > 0.4 ? 13 : 5, t0 + 0.28); // vibrato arrives late
    vib.connect(vibG).connect(o.detune);
    // body: wood at ~1.2k over a 3k lid
    const body = ac.createBiquadFilter(); body.type = 'peaking';
    body.frequency.value = 1200; body.Q.value = 2.5; body.gain.value = 3.5;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g = ac.createGain();
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.16, dur * 0.4)); // the bow starts slow
    g.gain.setValueAtTime(peak, t0 + Math.max(0.01, dur - 0.06));
    g.gain.setTargetAtTime(0, t0 + dur, 0.11);
    // the bow's breath: a whisper of banded noise under the tone
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 3800; bf.Q.value = 1;
    const bg = ac.createGain(); bg.gain.value = peak * 0.045;
    s.connect(bf).connect(bg).connect(this._pans.fiddle);
    o.connect(body).connect(lp).connect(g).connect(this._pans.fiddle);
    o.start(t0); vib.start(t0); s.start(t0);
    this._bury([o, vib, s, vibG, body, lp, g, bf, bg], t0 + dur + 0.5);
  }

  // concertina: the wet pair — two saws a few cents apart IS the free-reed
  // sound, the 1-3 Hz beat doing the work vibrato would
  _concertina(freq, t0, dur, vel) {
    const ac = this.ctx;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 0.7;
    const reed = ac.createBiquadFilter(); reed.type = 'peaking';
    reed.frequency.value = 1700; reed.Q.value = 1.8; reed.gain.value = 3;
    const g = ac.createGain();
    const peak = 0.085 * vel;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.045);   // bellows take up
    g.gain.setValueAtTime(peak, t0 + Math.max(0.01, dur - 0.05));
    g.gain.setTargetAtTime(0, t0 + dur, 0.06);
    // the bellows breathe: a slow ±8% swell on held notes
    const bel = ac.createOscillator(); bel.frequency.value = 0.35;
    const belG = ac.createGain(); belG.gain.value = peak * 0.08;
    bel.connect(belG).connect(g.gain);
    lp.connect(g); reed.connect(lp);
    const nodes = [bel, belG, reed, lp, g];
    for (const det of [5.5, -5.5]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = freq; o.detune.value = det;
      o.connect(reed);
      nodes.unshift(o);
    }
    g.connect(this._pans.concertina);
    for (const n of nodes) { if (n.start) n.start(t0); }
    this._bury(nodes, t0 + dur + 0.3);
  }

  // whistle / fife: triangle + CHIFF (the identity of the instrument) — a
  // 20 ms banded noise spit and a fast pitch-drop into the note. The fife is
  // the same pipe blown harder and brighter, an octave up.
  _whistle(freq, t0, dur, vel, fife) {
    const ac = this.ctx;
    const f = fife ? freq * 2 : freq;
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    o.detune.setValueAtTime(40, t0);                       // the chiff's pitch drop
    o.detune.linearRampToValueAtTime(0, t0 + 0.02);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = fife ? 6000 : 4200;
    const g = ac.createGain();
    const peak = (fife ? 0.13 : 0.11) * vel;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    g.gain.setValueAtTime(peak, t0 + Math.max(0.01, dur - 0.05));
    g.gain.setTargetAtTime(0, t0 + dur, 0.05);
    // breath vibrato (tremolo, not pitch) arriving late on the long notes
    if (dur > 0.5) {
      const tr = ac.createOscillator(); tr.frequency.value = 4.8;
      const trG = ac.createGain();
      trG.gain.setValueAtTime(0, t0);
      trG.gain.linearRampToValueAtTime(peak * 0.13, t0 + 0.4);
      tr.connect(trG).connect(g.gain);
      tr.start(t0);
      this._bury([tr, trG], t0 + dur + 0.2);
    }
    // the chiff itself: one spit of noise banded near the second harmonic
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    const cf = ac.createBiquadFilter(); cf.type = 'bandpass';
    cf.frequency.value = Math.min(9000, f * 2.2); cf.Q.value = 5;
    const cg = ac.createGain();
    cg.gain.setValueAtTime(peak * 0.5, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    s.connect(cf).connect(cg).connect(this._pans[fife ? 'fife' : 'whistle']);
    o.connect(lp).connect(g).connect(this._pans[fife ? 'fife' : 'whistle']);
    o.start(t0); s.start(t0);
    this._bury([o, s, lp, g, cf, cg], t0 + dur + 0.3);
  }

  // brass: the band across the water — three stacked detuned saws under a
  // resonant lid, the proven Moorstead voicing kept dark for distance
  _brass(freq, t0, dur, vel) {
    const ac = this.ctx;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t0);                 // the brassy 'wah' opens
    lp.frequency.linearRampToValueAtTime(1400, t0 + Math.min(0.2, dur * 0.5));
    lp.Q.value = 1.2;
    const g = ac.createGain();
    const peak = 0.06 * vel;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.07);
    g.gain.setValueAtTime(peak, t0 + Math.max(0.01, dur - 0.08));
    g.gain.setTargetAtTime(0, t0 + dur, 0.09);
    lp.connect(g).connect(this._pans.brass);
    const nodes = [lp, g];
    for (const det of [0, 7, -7]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = freq; o.detune.value = det;
      o.connect(lp); o.start(t0);
      nodes.unshift(o);
    }
    this._bury(nodes, t0 + dur + 0.4);
  }

  // the drone: an open fifth is built by the CALLER (two events); each note
  // here is one soft reedy sustain, darker than the concertina lead
  _drone(midi, t0, dur, vel) {
    const ac = this.ctx;
    const freq = midiHz(midi);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = ac.createGain();
    const peak = 0.05 * vel;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.6);        // it swells like weather
    g.gain.setValueAtTime(peak, t0 + Math.max(0.6, dur - 0.8));
    g.gain.setTargetAtTime(0, t0 + dur, 0.4);
    lp.connect(g).connect(this._pans.drone);
    const nodes = [lp, g];
    for (const det of [4, -4]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = freq; o.detune.value = det;
      o.connect(lp); o.start(t0);
      nodes.unshift(o);
    }
    this._bury(nodes, t0 + dur + 1.2);
  }

  // the hum: the watch below, wordless. The classic parallel-formant model —
  // a buzz source through bandpass resonators — set to a CLOSED mouth ("mm"):
  // F1 ~270 Hz dominant, F2 ~1000 down 12 dB, F3 ~2200 down 18 dB, the lot
  // under a 3 kHz lid. Two detuned copies make it a watch, not a soloist;
  // slow tremolo is the breath. Kept far back — a hum you notice is too loud.
  _hum(midi, t0, dur, vel, cents = 0) {
    const ac = this.ctx;
    const freq = midiHz(midi) * centsMul(cents);
    const mix = ac.createGain(); mix.gain.value = 1;
    // the formants, in parallel: [centre, Q, level]
    const nodes = [mix];
    for (const [fc, q, lvl] of [[270, 4, 1], [1000, 9, 0.25], [2200, 12, 0.12]]) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = q;
      const bg = ac.createGain(); bg.gain.value = lvl;
      bp.connect(bg).connect(mix);
      nodes.push(bp, bg);
      // each voice of the watch feeds every formant
      for (const det of [6, -7]) {
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = freq; o.detune.value = det;
        const vib = ac.createOscillator(); vib.frequency.value = 4.6 + det * 0.02;
        const vibG = ac.createGain();
        vibG.gain.setValueAtTime(0, t0);
        vibG.gain.linearRampToValueAtTime(9, t0 + 0.5);   // the note settles, then sways
        vib.connect(vibG).connect(o.detune);
        o.connect(bp);
        o.start(t0); vib.start(t0);
        nodes.unshift(o, vib, vibG);
      }
    }
    const lid = ac.createBiquadFilter(); lid.type = 'lowpass'; lid.frequency.value = 3000;
    const g = ac.createGain();
    const peak = 0.05 * vel;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.25);      // a breath taken, not an attack
    g.gain.setValueAtTime(peak, t0 + Math.max(0.25, dur - 0.3));
    g.gain.setTargetAtTime(0, t0 + dur, 0.18);
    // the breath: slow tremolo on the level
    const tr = ac.createOscillator(); tr.frequency.value = 0.9;
    const trG = ac.createGain(); trG.gain.value = peak * 0.15;
    tr.connect(trG).connect(g.gain);
    tr.start(t0);
    nodes.push(lid, g, tr, trG);
    mix.connect(lid).connect(g).connect(this._pans.hum);
    this._bury(nodes, t0 + dur + 0.8);
  }

  // the drum: field-drum recipe — banded noise + a struck shell with a fast
  // pitch drop. Low = the stick, high = the tap; both kept well back.
  _drum(t0, vel, low) {
    const ac = this.ctx;
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + (low ? 0 : 0.5);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = low ? 900 : 1800; bp.Q.value = 0.8;
    const lid = ac.createBiquadFilter(); lid.type = 'lowpass'; lid.frequency.value = 4000;
    const g = ac.createGain();
    const peak = (low ? 0.11 : 0.06) * vel;
    g.gain.setValueAtTime(peak, t0);
    g.gain.setTargetAtTime(0, t0 + 0.005, low ? 0.05 : 0.03);
    s.connect(bp).connect(lid).connect(g).connect(this._pans.perc);
    s.start(t0);
    this._bury([s, bp, lid, g], t0 + 0.4);
    if (low) {
      const o = ac.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(200, t0);
      o.frequency.exponentialRampToValueAtTime(140, t0 + 0.03);
      const og = ac.createGain();
      og.gain.setValueAtTime(peak * 0.7, t0);
      og.gain.setTargetAtTime(0, t0 + 0.005, 0.04);
      o.connect(og).connect(this._pans.perc);
      o.start(t0);
      this._bury([o, og], t0 + 0.2);
    }
  }

  // the pluck: Karplus-Strong rendered into a cached buffer — the classic
  // noise-into-averaging-delay ring, computed in plain JS (no worklet, no
  // native feedback loop with its 128-sample tuning quantisation)
  _pluck(midi, t0, vel) {
    const ac = this.ctx;
    let buf = this._plucks.get(midi);
    if (!buf) {
      const fs = ac.sampleRate;
      const f = midiHz(midi);
      const N = Math.max(2, Math.round(fs / f));
      const secs = 1.6;
      buf = ac.createBuffer(1, Math.floor(fs * secs), fs);
      const d = buf.getChannelData(0);
      // soften the excitation first — a thumbed gut string, not a banjo snap
      let pre = 0;
      for (let i = 0; i < N; i++) { pre += ((Math.random() * 2 - 1) - pre) * 0.5; d[i] = pre; }
      for (let i = N; i < d.length; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N + 1]);
      this._plucks.set(midi, buf);
    }
    const s = ac.createBufferSource(); s.buffer = buf;
    const g = ac.createGain(); g.gain.value = 0.14 * vel;
    s.connect(g).connect(this._pans.pluck);
    s.start(t0);
    this._bury([s, g], t0 + buf.duration + 0.05);
  }
}

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function centsMul(c) { return Math.pow(2, c / 1200); }
