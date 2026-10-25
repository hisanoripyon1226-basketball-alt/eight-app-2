/**
 * 地図クラフト - メインアプリケーション制御
 */
class MapCraftApp {
  constructor() {
    this.map3d = null;
    this.currentMode = "japan"; // "japan" | "world"
    this.currentRegionId = "hokkaido_tohoku";
    this.currentDifficulty = "easy"; // "easy" | "normal" | "hard"

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

    // シルエット特訓用状態
    this.silhouetteScore = 0;
    this.silhouetteTotal = 10;
    this.silhouetteCurrent = 0;
    this.silhouetteTargetItem = null;

    this.init();
  }

  async init() {
    this.map3d = new MapCraft3D("canvas-container");

    // 3Dイベントのハンドリング
    this.map3d.onSlotClick = (item) => this.handleSlotHintClick(item);
    this.map3d.onPieceGrab = (item) => this.showShapeZoom(item);
    this.map3d.onPiecePlaced = (item) => this.handlePiecePlaced(item);

    this.bindUIEvents();

    // 初期ステージ読み込み
    this.switchMode("japan", "hokkaido_tohoku");
  }

  bindUIEvents() {
    // モード切替タブ (日本地図 / リアル地球儀 / シルエット特訓)
    const modeTabs = document.querySelectorAll(".mode-tab");
    modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.mode;
        modeTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        if (mode === "quiz") {
          this.startSilhouetteQuiz();
        } else {
          document.getElementById("modal-silhouette-quiz").classList.remove("active");
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

    // 難易度セレクター (入門・中級・達人)
    const diffSelect = document.getElementById("difficulty-select");
    if (diffSelect) {
      diffSelect.addEventListener("change", (e) => {
        this.currentDifficulty = e.target.value;
        this.loadRegion(this.currentRegionId);
      });
    }

    // サウンド切り替えボタン
    const soundBtn = document.getElementById("btn-sound");
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        const isEnabled = window.soundManager.toggleSound();
        soundBtn.innerHTML = isEnabled ? "🔊 サウンド: ON" : "🔇 サウンド: OFF";
        soundBtn.classList.toggle("btn-active", isEnabled);
      });
    }

    // 音声読み上げボタン
    const voiceBtn = document.getElementById("btn-voice");
    if (voiceBtn) {
      voiceBtn.addEventListener("click", () => {
        const isVoice = window.soundManager.toggleVoice();
        voiceBtn.innerHTML = isVoice ? "🗣️ 音声読上: ON" : "🗣️ 音声読上: OFF";
        voiceBtn.classList.toggle("btn-active", isVoice);
      });
    }

    // BGM切り替えボタン
    const bgmBtn = document.getElementById("btn-bgm");
    if (bgmBtn) {
      bgmBtn.addEventListener("click", () => {
        const isBgm = window.soundManager.toggleBGM();
        bgmBtn.innerHTML = isBgm ? "🎵 BGM: ON" : "🎵 BGM: OFF";
        bgmBtn.classList.toggle("btn-active", isBgm);
      });
    }

    // ふりがな切り替えボタン
    const rubyBtn = document.getElementById("btn-ruby");
    if (rubyBtn) {
      rubyBtn.addEventListener("click", () => {
        this.showRuby = !this.showRuby;
        rubyBtn.innerHTML = this.showRuby ? "📛 ふりがな: ON" : "📛 ふりがな: OFF";
        rubyBtn.classList.toggle("btn-active", this.showRuby);
        document.body.classList.toggle("hide-ruby", !this.showRuby);
      });
    }

    // 視点リセットボタン
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

    // ヒントモーダル閉じるボタン
    const closeHintBtn = document.getElementById("btn-close-hint");
    const hintModal = document.getElementById("modal-hint");
    if (closeHintBtn && hintModal) {
      closeHintBtn.addEventListener("click", () => hintModal.classList.remove("active"));
      hintModal.addEventListener("click", (e) => {
        if (e.target === hintModal) hintModal.classList.remove("active");
      });
    }

    // コンプリートモーダル閉じるボタン
    const closeCompBtn = document.getElementById("btn-close-complete");
    const compModal = document.getElementById("modal-complete");
    if (closeCompBtn && compModal) {
      closeCompBtn.addEventListener("click", () => compModal.classList.remove("active"));
    }

    // シルエット特訓モーダル閉じる
    const closeQuizBtn = document.getElementById("btn-close-quiz");
    const quizModal = document.getElementById("modal-silhouette-quiz");
    if (closeQuizBtn && quizModal) {
      closeQuizBtn.addEventListener("click", () => {
        quizModal.classList.remove("active");
        // 日本地図タブへ戻す
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

    // 3Dステージ再生成 (難易度レベルを渡す)
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

      // リアルなSVGシルエットをサムネイルに描画！
      let shapeSvg = "";
      if (this.currentMode === "japan" && window.geoUtils) {
        shapeSvg = window.geoUtils.generatePrefectureSVG(item.name, 48, "#63b3ed");
      } else {
        shapeSvg = `<span style="font-size: 2rem;">${item.flag || "📍"}</span>`;
      }

      card.innerHTML = `
        <div class="card-shape-preview">${shapeSvg}</div>
        <div class="card-text">
          <ruby class="card-name">${item.name}<rt>${item.kana || item.nameEn || ""}</rt></ruby>
        </div>
      `;

      // クリックで該当スロットにスナップ（アシスト機能）
      card.addEventListener("click", () => {
        if (this.placedState.get(item.id)) return;
        this.showShapeZoom(item);
        this.map3d.snapPieceToSlot(item.id);
      });

      container.appendChild(card);
    });
  }

  // ピースを掴んだ時にリアルタイムで表示する「🔍 形状ズームビューア」
  showShapeZoom(item) {
    const viewer = document.getElementById("shape-zoom-viewer");
    if (!viewer) return;

    const svgContainer = document.getElementById("zoom-shape-svg");
    const nameEl = document.getElementById("zoom-shape-name");
    const hintEl = document.getElementById("zoom-shape-hint");

    let svgStr = "";
    if (this.currentMode === "japan" && window.geoUtils) {
      svgStr = window.geoUtils.generatePrefectureSVG(item.name, 160, item.color || "#38a169");
    } else {
      svgStr = `<div style="font-size: 5rem; text-align: center;">${item.flag || "📍"}</div>`;
    }

    svgContainer.innerHTML = svgStr;
    nameEl.innerHTML = `<ruby>${item.name}<rt>${item.kana || item.nameEn || ""}</rt></ruby>`;
    hintEl.textContent = `💡 形の特徴: ${item.shapeHint || "独特なシルエットだよ！"}`;

    viewer.classList.add("active");

    // 4秒後に自動フェードアウト（長押し中はキープ）
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => {
      viewer.classList.remove("active");
    }, 4500);
  }

  // 「？」ピンをクリックした時のヒントモーダル
  // ★重要★ ユーザーの要望通り、答え（県名・国名・3択ボタン）は絶対に伏せ、ヒント情報のみ表示する！
  handleSlotHintClick(item) {
    if (window.soundManager) window.soundManager.playHint();
    this.hintUsedCount++;

    const modal = document.getElementById("modal-hint");
    if (!modal) return;

    // 地方バッジ
    document.getElementById("hint-region-badge").textContent =
      this.currentMode === "japan" ? JAPAN_REGIONS[item.region]?.name : WORLD_REGIONS[item.region]?.name;

    // 県庁所在地 / 首都 (県名は出さない！)
    const capTitle = this.currentMode === "japan" ? "県庁所在地" : "首都";
    document.getElementById("hint-capital-title").textContent = `🏛️ ${capTitle}`;
    document.getElementById("hint-capital-value").textContent = item.capital + (item.capitalKana ? ` (${item.capitalKana})` : "");

    // 代表的な特産品
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

    // 名所・シンボル
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

    // 形状の特徴ヒント
    document.getElementById("hint-shape-desc").textContent = item.shapeHint || "特徴的な形をよく観察してみよう！";

    // 豆知識ヒント
    document.getElementById("hint-trivia-text").textContent = item.trivia || "";

    // ★重要★ 選択肢ボタンは出さず、探してドラッグするよう案内！
    const guideBox = document.getElementById("hint-choices");
    guideBox.innerHTML = `
      <div class="drag-guide-box">
        <div class="guide-icon">🎯</div>
        <div class="guide-text">
          <strong>このヒントから都道府県・国を推理しよう！</strong><br>
          下のピーストレイから正しい形のピースを探して、この場所にドラッグ＆ドロップしてね！
        </div>
      </div>
    `;

    modal.classList.add("active");
  }

  // ピース配置成功時
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
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
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
  // ⚡ 新機能：シルエット特訓ミニゲーム
  // ==========================================
  startSilhouetteQuiz() {
    this.silhouetteScore = 0;
    this.silhouetteCurrent = 0;
    this.silhouetteTotal = 10;

    const modal = document.getElementById("modal-silhouette-quiz");
    modal.classList.add("active");

    this.nextSilhouetteQuestion();
  }

  nextSilhouetteQuestion() {
    if (this.silhouetteCurrent >= this.silhouetteTotal) {
      // 終了
      this.showQuizResult();
      return;
    }

    this.silhouetteCurrent++;
    document.getElementById("quiz-step").textContent = `${this.silhouetteCurrent} / ${this.silhouetteTotal} 問目`;
    document.getElementById("quiz-score-badge").textContent = `スコア: ${this.silhouetteScore}`;

    // ランダムに1つ正解を選ぶ
    const all = JAPAN_PREFECTURES;
    const target = all[Math.floor(Math.random() * all.length)];
    this.silhouetteTargetItem = target;

    // シルエットSVGを描画 (黒い漆黒のシルエット！)
    const svgStr = window.geoUtils.generatePrefectureSVG(target.name, 220, "#1a202c");
    document.getElementById("quiz-silhouette-view").innerHTML = svgStr;

    // 誤答2つを選出
    const pool = all.filter((i) => i.id !== target.id);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const choices = [target, shuffled[0], shuffled[1]].sort(() => Math.random() - 0.5);

    const container = document.getElementById("quiz-choices-container");
    container.innerHTML = "";

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "quiz-choice-btn";
      btn.innerHTML = `<ruby>${choice.name}<rt>${choice.kana}</rt></ruby>`;

      btn.addEventListener("click", () => {
        if (choice.id === target.id) {
          // 正解！
          this.silhouetteScore++;
          if (window.soundManager) {
            window.soundManager.playCorrect();
            window.soundManager.speakName(`正解！${target.name}！`);
          }
          btn.classList.add("btn-correct");
          setTimeout(() => this.nextSilhouetteQuestion(), 800);
        } else {
          // 不正解
          if (window.soundManager) {
            window.soundManager.playWrong();
            window.soundManager.speakName(`ちがうよ、これは${target.name}だよ！`);
          }
          btn.classList.add("btn-wrong");
          setTimeout(() => this.nextSilhouetteQuestion(), 1100);
        }
      });
      container.appendChild(btn);
    });
  }

  showQuizResult() {
    const container = document.getElementById("quiz-choices-container");
    const view = document.getElementById("quiz-silhouette-view");
    view.innerHTML = `<div style="font-size: 5rem;">🏆</div>`;
    document.getElementById("quiz-step").textContent = "特訓完了！";
    container.innerHTML = `
      <div style="text-align: center; padding: 16px;">
        <h3 style="font-size: 1.5rem; margin-bottom: 8px;">あなたのスコア: ${this.silhouetteScore} / ${this.silhouetteTotal} 点</h3>
        <p style="color: #4a5568; margin-bottom: 16px;">${this.silhouetteScore === 10 ? "全問正解！完璧なシルエットマスターです！" : "何度も挑戦して日本全国の形を完璧に覚えよう！"}</p>
        <button id="btn-quiz-retry" class="btn-primary-craft">もう一度特訓する！</button>
      </div>
    `;
    document.getElementById("btn-quiz-retry").addEventListener("click", () => this.startSilhouetteQuiz());
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
