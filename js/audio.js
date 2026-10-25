/**
 * 地図クラフト - Web Audio API サウンドシステム
 * 外部ファイル不要で軽快・確実な効果音＆チップチューンBGMを合成生成
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmPlaying = false;
    this.bgmTimer = null;
    this.bgmNoteIndex = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.bgmPlaying) {
      this.stopBGM();
    }
    return this.enabled;
  }

  // ブロック設置音 (カチッ・ドスン)
  playPlace() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // 低音ドスン (クラフト感)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(140, t);
    osc1.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    gain1.gain.setValueAtTime(0.5, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.12);

    // 高音カチッ (スナップ感)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(800, t);
    osc2.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    gain2.gain.setValueAtTime(0.2, t);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.05);
  }

  // 正解音 (ピロリ〜ン✨)
  playCorrect() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);
      gain.gain.setValueAtTime(0, t + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.25, t + idx * 0.06 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.25);
    });
  }

  // ヒント表示音 (ポンッ)
  playHint() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.09);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // 不正解音 (ブッブー)
  playWrong() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    [0, 0.12].forEach((offset) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, t + offset);
      gain.gain.setValueAtTime(0.2, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, t + offset + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.09);
    });
  }

  // 地方/大陸コンプリートファンファーレ！
  playFanfare() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const melody = [
      { f: 523.25, d: 0.12 }, // C
      { f: 523.25, d: 0.12 }, // C
      { f: 523.25, d: 0.12 }, // C
      { f: 659.25, d: 0.35 }, // E
      { f: 587.33, d: 0.12 }, // D
      { f: 659.25, d: 0.12 }, // E
      { f: 783.99, d: 0.45 }, // G
      { f: 1046.5, d: 0.6 }   // C6
    ];

    let curr = t;
    melody.forEach((note) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(note.f, curr);
      gain.gain.setValueAtTime(0.25, curr);
      gain.gain.exponentialRampToValueAtTime(0.01, curr + note.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(curr);
      osc.stop(curr + note.d);
      curr += note.d + 0.02;
    });
  }

  // BGM トグル
  toggleBGM() {
    if (this.bgmPlaying) {
      this.stopBGM();
      return false;
    } else {
      this.startBGM();
      return true;
    }
  }

  startBGM() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.bgmPlaying = true;
    this.bgmNoteIndex = 0;
    this._scheduleBGMStep();
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  _scheduleBGMStep() {
    if (!this.bgmPlaying || !this.ctx) return;

    // 心地よいクラフト風アルペジオ (Cメジャーペンタトニック)
    const melody = [
      261.63, 329.63, 392.00, 523.25,
      392.00, 329.63, 261.63, 196.00,
      220.00, 261.63, 329.63, 440.00,
      392.00, 329.63, 293.66, 261.63
    ];

    const freq = melody[this.bgmNoteIndex % melody.length];
    this.bgmNoteIndex++;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);

    this.bgmTimer = setTimeout(() => {
      this._scheduleBGMStep();
    }, 240);
  }
}

window.soundManager = new SoundManager();
