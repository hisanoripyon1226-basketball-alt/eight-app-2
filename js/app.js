/**
 * 地図クラフト - メインアプリケーション制御
 * 日本・世界のリアル形状パズル ＆ 4大クイズ道場（日本の形・世界の形・国旗・首都）
 */
class MapCraftApp {
  constructor() {
    this.map3d = null;
    this.currentMode = "japan"; // "japan" | "world"
    this.currentRegionId = "hokkaido_tohoku";
    this.currentDifficulty = "easy"; // "easy" | "normal" | "hard"
    this.trayPosition = "bottom"; // "bottom" | "side"

    this.allData = {
      japan: JAPAN_PREFECTURES,
      world: WORLD_COUNTRIES
    };

    this.regionDefs = {
      japan: JAPAN_REGIONS,
      world: WORLD_REGIONS
    };

    this.placedState = new Map();
    this.startTime = null;
    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.hintUsedCount = 0;
    this.showRuby = true;

    // クイズ用状態
    this.quizType = "japan_shape"; // "japan_shape" | "world_shape" | "world_flag" | "capital"
    this.quizScore = 0;
    this.quizCurrent = 0;
    this.quizTotal = 10;
    this.quizTargetItem = null;

    this.init();
  }

  async init() {
    this.map3d = new MapCraft3D("canvas-container");

    this.map3d.onSlotClick = (item) => this.handleSlotHintClick(item);
    this.map3d.onPieceGrab = (item) => this.showShapeZoom(item);
    this.map3d.onPiecePlaced = (item) => this.handlePiecePlaced(item);

    this.bindUIEvents();
    this.switchMode("japan", "hokkaido_tohoku");
  }

  bindUIEvents() {
    // モード切替タブ (日本地図 / リアル地球儀 / 特訓クイズ道場)
    const modeTabs = document.querySelectorAll(".mode-tab");
    modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.mode;
        modeTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        if (mode === "quiz") {
          this.openQuizModal();
        } else {
          document.getElementById("modal-quiz-dojo").classList.remove("active");
          const initialRegion = mode === "japan" ? "hokkaido_tohoku" : "asia";
          this.switchMode(mode, initialRegion);
        }
      });
    });

    // 地域セレクター
    const regionSelect = document.getElementById("region-select");
    if (regionSelect) {
      regionSelect.addEventListener("change", (e) => {
        this.loadRegion(e.target.value);
      });
    }

    // 難易度セレクター
    const diffSelect = document.getElementById("difficulty-select");
    if (diffSelect) {
      diffSelect.addEventListener("change", (e) => {
        this.currentDifficulty = e.target.value;
        this.loadRegion(this.currentRegionId);
      });
    }

    // トレイ位置切り替えボタン (下部 ⇔ 左サイド)
    const trayPosBtn = document.getElementById("btn-tray-pos");
    if (trayPosBtn) {
      trayPosBtn.addEventListener("click", () => {
        this.trayPosition = this.trayPosition === "bottom" ? "side" : "bottom";
        document.body.classList.toggle("tray-side-mode", this.trayPosition === "side");
        trayPosBtn.innerHTML = this.trayPosition === "side" ? "📐 トレイ: 左横" : "📐 トレイ: 下部";
      });
    }

    // サウンド切り替え
    const soundBtn = document.getElementById("btn-sound");
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        const isEnabled = window.soundManager.toggleSound();
        soundBtn.innerHTML = isEnabled ? "🔊 効果音: ON" : "🔇 効果音: OFF";
        soundBtn.classList.toggle("btn-active", isEnabled);
      });
    }

    // 音声読み上げ
    const voiceBtn = document.getElementById("btn-voice");
    if (voiceBtn) {
      voiceBtn.addEventListener("click", () => {
        const isVoice = window.soundManager.toggleVoice();
        voiceBtn.innerHTML = isVoice ? "🗣️ 読上げ: ON" : "🗣️ 読上げ: OFF";
        voiceBtn.classList.toggle("btn-active", isVoice);
      });
    }

    // BGM切り替え
    const bgmBtn = document.getElementById("btn-bgm");
    if (bgmBtn) {
      bgmBtn.addEventListener("click", () => {
        const isBgm = window.soundManager.toggleBGM();
        bgmBtn.innerHTML = isBgm ? "🎵 BGM: ON" : "🎵 BGM: OFF";
        bgmBtn.classList.toggle("btn-active", isBgm);
      });
    }

    // ふりがな切り替え
    const rubyBtn = document.getElementById("btn-ruby");
    if (rubyBtn) {
      rubyBtn.addEventListener("click", () => {
        this.showRuby = !this.showRuby;
        rubyBtn.innerHTML = this.showRuby ? "📛 ルビ: ON" : "📛 ルビ: OFF";
        rubyBtn.classList.toggle("btn-active", this.showRuby);
        document.body.classList.toggle("hide-ruby", !this.showRuby);
      });
    }

    // 視点リセット
    const resetCamBtn = document.getElementById("btn-reset-cam");
    if (resetCamBtn) {
      resetCamBtn.addEventListener("click", () => {
        this.map3d.focusRegion(this.currentMode, this.currentRegionId);
      });
    }

    // ヘルプモーダル
    const helpBtn = document.getElementById("btn-help");
    const helpModal = document.getElementById("modal-help");
    const closeHelpBtn = document.getElementById("btn-close-help");
    if (helpBtn && helpModal) {
      helpBtn.addEventListener("click", () => helpModal.classList.add("active"));
      if (closeHelpBtn) closeHelpBtn.addEventListener("click", () => helpModal.classList.remove("active"));
      helpModal.addEventListener("click", (e) => {
        if (e.target === helpModal) helpModal.classList.remove("active");
      });
    }

    // ヒントモーダル閉じる
    const closeHintBtn = document.getElementById("btn-close-hint");
    const hintModal = document.getElementById("modal-hint");
    if (closeHintBtn && hintModal) {
      closeHintBtn.addEventListener("click", () => hintModal.classList.remove("active"));
      hintModal.addEventListener("click", (e) => {
        if (e.target === hintModal) hintModal.classList.remove("active");
      });
    }

    // コンプリートモーダル閉じる
    const closeCompBtn = document.getElementById("btn-close-complete");
    const compModal = document.getElementById("modal-complete");
    if (closeCompBtn && compModal) {
      closeCompBtn.addEventListener("click", () => compModal.classList.remove("active"));
    }

    // クイズ道場ジャンル切り替え
    const quizTabs = document.querySelectorAll(".quiz-type-tab");
    quizTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        quizTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.quizType = tab.dataset.type;
        this.startQuiz();
      });
    });

    const closeQuizBtn = document.getElementById("btn-close-quiz-dojo");
    if (closeQuizBtn) {
      closeQuizBtn.addEventListener("click", () => {
        document.getElementById("modal-quiz-dojo").classList.remove("active");
        document.querySelector('.mode-tab[data-mode="japan"]').click();
      });
    }
  }

  switchMode(mode, regionId) {
    this.currentMode = mode;
    this.currentRegionId = regionId;
    this.populateRegionSelect();
    this.loadRegion(regionId);
  }

  populateRegionSelect() {
    const regionSelect = document.getElementById("region-select");
    if (!regionSelect) return;

    regionSelect.innerHTML = "";
    const defs = this.regionDefs[this.currentMode];

    Object.keys(defs).forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = defs[key].name;
      if (key === this.currentRegionId) opt.selected = true;
      regionSelect.appendChild(opt);
    });
  }

  loadRegion(regionId) {
    this.currentRegionId = regionId;
    const allItems = this.allData[this.currentMode];
    let items;
    if (regionId === "all") {
      items = allItems;
    } else {
      items = allItems.filter((item) => item.region === regionId);
    }

    this.placedState.clear();
    items.forEach((item) => this.placedState.set(item.id, false));

    this.map3d.loadStage(this.currentMode, regionId, items, this.currentDifficulty);
    this.renderInventory(items);
    this.updateProgress();
    this.startTimer();
  }

  renderInventory(items) {
    const container = document.getElementById("inventory-items");
    if (!container) return;
    container.innerHTML = "";

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "inventory-card";
      card.id = `inv-card-${item.id}`;
      card.dataset.id = item.id;

      let shapeSvg = "";
      if (this.currentMode === "japan" && window.geoUtils) {
        shapeSvg = window.geoUtils.generatePrefectureSVG(item.name, 48, "#63b3ed");
      } else if (window.geoUtils) {
        // 世界の国のリアルSVGシルエット！
        shapeSvg = window.geoUtils.generateCountrySVG(item.nameEn, 48, "#fc8181") ||
                   `<span style="font-size: 1.8rem;">${item.flag || "📍"}</span>`;
      }

      card.innerHTML = `
        <div class="card-shape-preview">${shapeSvg}</div>
        <div class="card-text">
          <ruby class="card-name">${item.name}<rt>${item.kana || item.nameEn || ""}</rt></ruby>
        </div>
      `;

      // クリックすると地図上のスロットへ自動移動してカチッと吸着（アシスト機能）
      card.addEventListener("click", () => {
        if (this.placedState.get(item.id)) return;
        this.showShapeZoom(item);
        this.map3d.snapPieceToSlot(item.id);
      });

      container.appendChild(card);
    });
  }

  showShapeZoom(item) {
    const viewer = document.getElementById("shape-zoom-viewer");
    if (!viewer) return;

    const svgContainer = document.getElementById("zoom-shape-svg");
    const nameEl = document.getElementById("zoom-shape-name");
    const hintEl = document.getElementById("zoom-shape-hint");

    let svgStr = "";
    if (this.currentMode === "japan" && window.geoUtils) {
      svgStr = window.geoUtils.generatePrefectureSVG(item.name, 160, item.color || "#38a169");
    } else if (window.geoUtils) {
      svgStr = window.geoUtils.generateCountrySVG(item.nameEn, 160, item.color || "#3182ce") ||
               `<div style="font-size: 5rem; text-align: center;">${item.flag || "📍"}</div>`;
    }

    svgContainer.innerHTML = svgStr;
    nameEl.innerHTML = `<ruby>${item.name}<rt>${item.kana || item.nameEn || ""}</rt></ruby>`;
    hintEl.textContent = `💡 形の特徴: ${item.shapeHint || "独特なシルエットだよ！"}`;

    viewer.classList.add("active");

    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => {
      viewer.classList.remove("active");
    }, 4500);
  }

  handleSlotHintClick(item) {
    if (window.soundManager) window.soundManager.playHint();
    this.hintUsedCount++;

    const modal = document.getElementById("modal-hint");
    if (!modal) return;

    document.getElementById("hint-region-badge").textContent =
      this.currentMode === "japan" ? JAPAN_REGIONS[item.region]?.name : WORLD_REGIONS[item.region]?.name;

    const capTitle = this.currentMode === "japan" ? "県庁所在地" : "首都";
    document.getElementById("hint-capital-title").textContent = `🏛️ ${capTitle}`;
    document.getElementById("hint-capital-value").textContent = item.capital + (item.capitalKana ? ` (${item.capitalKana})` : "");

    const specContainer = document.getElementById("hint-specialties");
    specContainer.innerHTML = "";
    if (item.specialties) {
      item.specialties.forEach((spec, idx) => {
        const icon = item.specialtyIcons ? item.specialtyIcons[idx] || "✨" : "✨";
        const badge = document.createElement("span");
        badge.className = "hint-badge";
        badge.innerHTML = `<span class="badge-icon">${icon}</span> ${spec}`;
        specContainer.appendChild(badge);
      });
    }

    const landContainer = document.getElementById("hint-landmarks");
    landContainer.innerHTML = "";
    if (item.landmarks) {
      item.landmarks.forEach((land) => {
        const badge = document.createElement("span");
        badge.className = "hint-badge landmark-badge";
        badge.innerHTML = `🏯 ${land}`;
        landContainer.appendChild(badge);
      });
    }

    document.getElementById("hint-shape-desc").textContent = item.shapeHint || "特徴的な形をよく観察してみよう！";
    document.getElementById("hint-trivia-text").textContent = item.trivia || "";

    const guideBox = document.getElementById("hint-choices");
    guideBox.innerHTML = `
      <div class="drag-guide-box">
        <div class="guide-icon">🎯</div>
        <div class="guide-text">
          <strong>このヒントから推理して形を探そう！</strong><br>
          トレイからこの形のピースを見つけて、白地図にドラッグ＆ドロップしてね！（カードをクリックでもOK）
        </div>
      </div>
    `;

    modal.classList.add("active");
  }

  handlePiecePlaced(item) {
    this.placedState.set(item.id, true);
    const card = document.getElementById(`inv-card-${item.id}`);
    if (card) card.classList.add("placed");

    this.updateProgress();
    this.checkCompletion();
  }

  updateProgress() {
    const total = this.placedState.size;
    let placed = 0;
    this.placedState.forEach((val) => {
      if (val) placed++;
    });

    const percent = total > 0 ? Math.round((placed / total) * 100) : 0;
    const progressFill = document.getElementById("progress-fill");
    const progressText = document.getElementById("progress-text");

    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${placed} / ${total} 完成 (${percent}%)`;
  }

  checkCompletion() {
    let allDone = true;
    this.placedState.forEach((val) => {
      if (!val) allDone = false;
    });

    if (allDone) {
      this.stopTimer();

      if (window.soundManager) {
        window.soundManager.playFanfare();
        window.soundManager.speakName("おめでとうございます！すべてのピースが完成しました！完璧です！");
      }

      if (typeof confetti === "function") {
        confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
      }

      const regionName = this.regionDefs[this.currentMode][this.currentRegionId]?.name;
      document.getElementById("comp-region-name").textContent = regionName;
      document.getElementById("comp-time").textContent = this.formatTime(this.elapsedSeconds);
      document.getElementById("comp-hints").textContent = `${this.hintUsedCount} 回`;

      const modal = document.getElementById("modal-complete");
      if (modal) modal.classList.add("active");
    }
  }

  // ==========================================
  // ⚡ 4大特訓クイズ道場（日本の形・世界の形・国旗・首都）
  // ==========================================
  openQuizModal() {
    const modal = document.getElementById("modal-quiz-dojo");
    modal.classList.add("active");
    this.startQuiz();
  }

  startQuiz() {
    this.quizScore = 0;
    this.quizCurrent = 0;
    this.quizTotal = 10;
    this.nextQuizQuestion();
  }

  nextQuizQuestion() {
    if (this.quizCurrent >= this.quizTotal) {
      this.showQuizResult();
      return;
    }

    this.quizCurrent++;
    document.getElementById("quiz-step").textContent = `${this.quizCurrent} / ${this.quizTotal} 問目`;
    document.getElementById("quiz-score-badge").textContent = `スコア: ${this.quizScore}`;

    const cardView = document.getElementById("quiz-display-card");
    const labelEl = document.getElementById("quiz-question-label");
    const choicesContainer = document.getElementById("quiz-choices-container");
    choicesContainer.innerHTML = "";

    let pool = [];
    let target = null;
    let displayContent = "";
    let questionText = "";

    if (this.quizType === "japan_shape") {
      pool = JAPAN_PREFECTURES;
      target = pool[Math.floor(Math.random() * pool.length)];
      displayContent = window.geoUtils.generatePrefectureSVG(target.name, 210, "#1a202c");
      questionText = "このシルエットはどの都道府県かな？";
    } else if (this.quizType === "world_shape") {
      pool = WORLD_COUNTRIES;
      target = pool[Math.floor(Math.random() * pool.length)];
      const svg = window.geoUtils.generateCountrySVG(target.nameEn, 210, "#1a202c");
      displayContent = svg || `<div style="font-size: 5rem;">${target.flag}</div>`;
      questionText = "このリアルなシルエットはどの国かな？";
    } else if (this.quizType === "world_flag") {
      pool = WORLD_COUNTRIES;
      target = pool[Math.floor(Math.random() * pool.length)];
      displayContent = `<div class="quiz-big-flag">${target.flag}</div><div class="quiz-sub-hint">首都: ${target.capital}</div>`;
      questionText = "この国旗はどの国かな？";
    } else if (this.quizType === "capital") {
      pool = WORLD_COUNTRIES;
      target = pool[Math.floor(Math.random() * pool.length)];
      displayContent = `<div class="quiz-capital-card">🏛️ 首都: <strong>${target.capital}</strong></div>`;
      questionText = `首都が「${target.capital}」の国はどこかな？`;
    }

    this.quizTargetItem = target;
    cardView.innerHTML = displayContent;
    labelEl.textContent = questionText;

    // 誤答2つを選出
    const candidates = pool.filter((i) => i.id !== target.id);
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const choices = [target, shuffled[0], shuffled[1]].sort(() => Math.random() - 0.5);

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "quiz-choice-btn";
      const icon = choice.flag ? `${choice.flag} ` : "";
      btn.innerHTML = `${icon}<ruby>${choice.name}<rt>${choice.kana || choice.nameEn || ""}</rt></ruby>`;

      btn.addEventListener("click", () => {
        if (choice.id === target.id) {
          this.quizScore++;
          if (window.soundManager) {
            window.soundManager.playCorrect();
            window.soundManager.speakName(`正解！${target.name}！`);
          }
          btn.classList.add("btn-correct");
          setTimeout(() => this.nextQuizQuestion(), 800);
        } else {
          if (window.soundManager) {
            window.soundManager.playWrong();
            window.soundManager.speakName(`ちがうよ、正解は${target.name}だよ！`);
          }
          btn.classList.add("btn-wrong");
          setTimeout(() => this.nextQuizQuestion(), 1100);
        }
      });
      choicesContainer.appendChild(btn);
    });
  }

  showQuizResult() {
    const cardView = document.getElementById("quiz-display-card");
    const labelEl = document.getElementById("quiz-question-label");
    const container = document.getElementById("quiz-choices-container");

    document.getElementById("quiz-step").textContent = "特訓完了！";
    cardView.innerHTML = `<div style="font-size: 5rem;">🏆</div>`;
    labelEl.textContent = "おつかれさまでした！";

    container.innerHTML = `
      <div style="text-align: center; padding: 16px;">
        <h3 style="font-size: 1.5rem; margin-bottom: 8px;">あなたのスコア: ${this.quizScore} / ${this.quizTotal} 点</h3>
        <p style="color: #4a5568; margin-bottom: 16px;">
          ${this.quizScore === 10 ? "全問正解！完璧な地図マスターの称号を獲得しました！" : "くり返し特訓して、世界中・日本中の形と国旗を完全マスターしよう！"}
        </p>
        <button id="btn-quiz-retry" class="btn-primary-craft">もう一度特訓する！</button>
      </div>
    `;

    document.getElementById("btn-quiz-retry").addEventListener("click", () => this.startQuiz());
  }

  startTimer() {
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.hintUsedCount = 0;
    this.startTime = Date.now();
    const timerEl = document.getElementById("timer-display");
    if (timerEl) timerEl.textContent = "⏱️ 00:00";

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      if (timerEl) timerEl.textContent = `⏱️ ${this.formatTime(this.elapsedSeconds)}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new MapCraftApp();
});
