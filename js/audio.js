/* ============================================================================
 * Horse Rally 3D — Procedural Web Audio Synthesizer & Voice Announcer
 * Skill: build-game-audio-feedback
 * ============================================================================ */

export class RaceAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voiceEnabled = false;
    this.unlocked = false;

    this.crowdGain = null;
    this.crowdSource = null;
    this.rainGain = null;
    this.rainSource = null;

    this.hoofTimers = Array(9).fill(0);
    this.lastSpokenText = "";

    // Windows Natural / Neural & high-quality voice selection state
    this.availableVoices = [];
    this.selectedVoice = null;
    this.selectedVoiceName = "Auto (Best Natural Voice)";
    this.onVoicesUpdated = null;

    this._initVoiceLoader();
  }

  _initVoiceLoader() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const raw = window.speechSynthesis.getVoices() || [];
      if (!raw.length) return;

      // Filter and rank English voices, prioritizing Windows 11 Natural/Online Neural voices
      const enVoices = raw.filter(v => /^en(-|_|$)/i.test(v.lang));
      const pool = enVoices.length ? enVoices : raw;

      const scoreVoice = (v) => {
        const name = v.name || "";
        const lang = v.lang || "";
        let score = 0;

        // 1. Highest priority: Windows/Edge "Natural" / "Online" Neural voices (sound human, not robotic SAPI5)
        if (/Natural/i.test(name)) score += 1000;
        if (/Online/i.test(name)) score += 500;
        if (/Neural/i.test(name)) score += 500;
        if (/Google/i.test(name)) score += 300;
        if (/Premium|Enhanced|Siri/i.test(name)) score += 250;

        // 2. Classic British / Australian / Irish racecourse caller accents (Royal Ascot feel)
        if (/en-GB/i.test(lang) || /United Kingdom|Great Britain|UK/i.test(name)) score += 180;
        if (/en-AU|en-IE|en-NZ/i.test(lang)) score += 120;
        if (/en-US/i.test(lang)) score += 80;

        // 3. Specific well-known expressive announcer voices on Windows 11 / Edge / Chrome
        if (/Ryan|Guy|Thomas|Oliver|Libby|Sonia|Maisie|Liam|Connor|William|Brian|Andrew|Christopher|Eric/i.test(name)) {
          score += 95;
        }
        if (/George|Hazel|Daniel|Arthur|Malcolm/i.test(name)) {
          score += 55;
        }

        // 4. Penalize legacy Windows 98/10 basic SAPI5 desktop voices ("Microsoft David", "Microsoft Zira", "Microsoft Mark")
        if (/David|Zira|Mark/i.test(name) && !/Natural|Online/i.test(name)) {
          score -= 250;
        }

        return score;
      };

      this.availableVoices = [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a));

      // Keep user's explicit voice choice if still present, otherwise pick top-ranked voice
      if (this.selectedVoice) {
        const match = this.availableVoices.find(v => v.name === this.selectedVoice.name);
        this.selectedVoice = match || this.availableVoices[0] || null;
      } else {
        this.selectedVoice = this.availableVoices[0] || null;
      }

      if (this.selectedVoice) {
        this.selectedVoiceName = this.selectedVoice.name;
      }

      if (typeof this.onVoicesUpdated === "function") {
        this.onVoicesUpdated(this.availableVoices, this.selectedVoice);
      }
    };

    load();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = load;
    }
    // Retry shortly after boot in case browser populates voices asynchronously
    setTimeout(load, 250);
    setTimeout(load, 1000);
  }

  setVoiceByName(voiceName) {
    if (!this.availableVoices.length) this._initVoiceLoader();
    const found = this.availableVoices.find(v => v.name === voiceName);
    if (found) {
      this.selectedVoice = found;
      this.selectedVoiceName = found.name;
    }
    return this.selectedVoice;
  }

  getShortVoiceLabel(v = this.selectedVoice) {
    if (!v) return "System Default";
    const clean = v.name
      .replace(/^Microsoft\s+/i, "")
      .replace(/\s+Online\s*\(Natural\)/i, " (Natural)")
      .replace(/\s*-\s*English.*$/i, "");
    return `${clean} [${v.lang}]`;
  }

  _humanizeForRaceCaller(rawText) {
    // Clean icons & add natural punctuation pauses so neural TTS breathes like a real commentator
    return String(rawText)
      .replace(/[👑🏁🌿☀️🌧️💨🏆>>>]/g, "")
      .replace(/—/g, ", ")
      .replace(/•/g, ", ")
      .replace(/#(\d+)/g, "Number $1, ")
      .replace(/\b(\d+)-(\d+)\b/g, "$1 to $2")
      .replace(/\s+/g, " ")
      .trim();
  }

  unlock() {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.unlocked = true;
    this._setupAmbience();
  }

  _setupAmbience() {
    if (!this.ctx) return;
    // Create 2-second pink-ish noise buffer for crowd and rain loops
    const sr = this.ctx.sampleRate;
    const len = sr * 2;
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      b3 = white * 0.1848;
      data[i] = (b0 + b1 + b2 + b3) * 0.08;
    }
    this.noiseBuffer = buf;

    // Crowd loop
    const crowdSrc = this.ctx.createBufferSource();
    crowdSrc.buffer = buf;
    crowdSrc.loop = true;

    const crowdFilter = this.ctx.createBiquadFilter();
    crowdFilter.type = "bandpass";
    crowdFilter.frequency.value = 650;
    crowdFilter.Q.value = 0.7;

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.0;

    crowdSrc.connect(crowdFilter);
    crowdFilter.connect(this.crowdGain);
    this.crowdGain.connect(this.ctx.destination);
    crowdSrc.start();
    this.crowdSource = crowdSrc;

    // Rain / wind loop
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = buf;
    rainSrc.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1200;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;

    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ctx.destination);
    rainSrc.start();
    this.rainSource = rainSrc;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.crowdGain && this.ctx) {
      this.crowdGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }

  toggleMute() {
    this.unlock();
    return this.setMuted(!this.muted);
  }

  toggleVoice() {
    this.unlock();
    if (!this.availableVoices.length) this._initVoiceLoader();
    this.voiceEnabled = !this.voiceEnabled;
    if (!this.voiceEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    return this.voiceEnabled;
  }

  speak(text, priority = false, excitement = "normal") {
    if (!this.voiceEnabled || !window.speechSynthesis) return;
    if (text === this.lastSpokenText && !priority) return;
    this.lastSpokenText = text;
    try {
      if (!this.selectedVoice) this._initVoiceLoader();
      if (priority) {
        window.speechSynthesis.cancel();
      } else if (window.speechSynthesis.speaking) {
        return;
      }

      const spokenText = this._humanizeForRaceCaller(text);
      if (!spokenText) return;

      const u = new SpeechSynthesisUtterance(spokenText);
      if (this.selectedVoice) {
        u.voice = this.selectedVoice;
        u.lang = this.selectedVoice.lang;
      }

      const isNatural = this.selectedVoice && /Natural|Online|Neural|Google/i.test(this.selectedVoice.name);

      // Dynamic prosody: Neural/Natural voices sound best near 1.04-1.12 rate with subtle pitch lift on big moments
      if (excitement === "high") {
        u.rate = isNatural ? 1.10 : 1.14;
        u.pitch = isNatural ? 1.06 : 1.08;
      } else if (excitement === "calm") {
        u.rate = isNatural ? 1.00 : 1.04;
        u.pitch = 1.0;
      } else {
        u.rate = isNatural ? 1.05 : 1.08;
        u.pitch = isNatural ? 1.02 : 1.04;
      }
      u.volume = 0.95;
      window.speechSynthesis.speak(u);
    } catch (_) {
      // Ignore speech synthesis errors on restricted platforms
    }
  }

  updateAmbience(isRacing, progress, weather) {
    if (!this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;
    if (this.muted) {
      this.crowdGain.gain.setTargetAtTime(0, now, 0.08);
      this.rainGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    // Crowd swells as horses near the finish grandstand (progress 0.7 -> 1.0)
    let targetCrowd = 0.015;
    if (isRacing) {
      targetCrowd = 0.04 + Math.pow(Math.max(0, progress), 2.2) * 0.22;
    }
    this.crowdGain.gain.setTargetAtTime(targetCrowd, now, 0.15);

    // Rain ambience
    let targetRain = 0.0;
    if (weather.includes("Rain")) targetRain += 0.09;
    if (weather.includes("Wind")) targetRain += 0.05;
    this.rainGain.gain.setTargetAtTime(targetRain, now, 0.25);
  }

  playCountdownTick(num) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(num === 1 ? 660 : 520, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playStartBell() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Brass starting bell partials
    [880, 1320, 1760, 2420].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.16 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.75);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.78);
    });

    // Gate latch clatter
    this._playNoiseBurst(0.12, 900, 0.22);
  }

  playHoofbeat(pan = 0, wet = false, volume = 0.08) {
    if (this.muted || !this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;

    // Low turf thud
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    const startFreq = wet ? 145 : 120 + Math.random() * 25;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.055);

    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), now);
      osc.connect(g);
      g.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      osc.connect(g);
      g.connect(this.ctx.destination);
    }

    osc.start(now);
    osc.stop(now + 0.065);

    if (wet && Math.random() < 0.45) {
      this._playNoiseBurst(0.05, 2200, volume * 0.45);
    }
  }

  playJumpBrush() {
    if (this.muted || !this.ctx || !this.unlocked) return;
    this._playNoiseBurst(0.18, 1400, 0.11);
  }

  playBurstSurge() {
    if (this.muted || !this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.28);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playStumble() {
    if (this.muted || !this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.35);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playPhotoFinishShutter() {
    if (this.muted || !this.ctx || !this.unlocked) return;
    this._playNoiseBurst(0.04, 3400, 0.25);
    setTimeout(() => this._playNoiseBurst(0.06, 2600, 0.18), 75);
  }

  playWinnerFanfare() {
    if (this.muted || !this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.11;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  _playNoiseBurst(duration, centerFreq, gainVal) {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(centerFreq, now);
    filter.Q.setValueAtTime(1.2, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }
}
