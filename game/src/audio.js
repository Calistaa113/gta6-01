// Synthesised sound, no audio files: a WebAudio engine hum that follows the car's
// speed, a two-tone siren when the heat is on, and short blips for shots, pickups,
// crashes and mission results. Everything is created on the first user gesture;
// nothing here touches the simulation.
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = context.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 1.6;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slide) {
    if (!ensure() || muted) return;
    try {
      const t = context.currentTime;
      const osc = context.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      const gain = context.createGain();
      gain.gain.setValueAtTime(vol || 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const t = context.currentTime;
      const len = Math.floor(context.sampleRate * dur);
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = context.createBufferSource();
      src.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = context.createGain();
      gain.gain.setValueAtTime(vol || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** The engine hum follows the car's speed; silent on foot or at a stop. */
    engine(speed, driving) {
      if (!context || muted) return;
      const target = driving ? 0.05 + Math.min(0.16, Math.abs(speed) / 460 * 0.16) : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(46 + Math.abs(speed) * 0.22, context.currentTime, 0.08);
    },
    /** The siren wails softly while the wanted level is above zero. */
    siren(on) {
      if (!context || muted) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.3);
    },
    shot() { noise(0.09, 0.4, 2400); },
    punch() { noise(0.08, 0.3, 500); },
    pickup() { blip(880, 0.12, 'sine', 0.25, 1320); },
    crash() { noise(0.25, 0.4, 700); },
    mission() { blip(523, 0.14, 'triangle', 0.25); setTimeout(() => blip(659, 0.14, 'triangle', 0.25), 130); setTimeout(() => blip(784, 0.22, 'triangle', 0.25), 260); },
    busted() { blip(220, 0.5, 'sawtooth', 0.2, 110); },
    click() { blip(1200, 0.05, 'square', 0.12); },
  };
}
