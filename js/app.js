/**
 * 地図クラフト - メインアプリケーション制御
 */
class MapCraftApp {
  constructor() {
    this.map3d = null;
    this.currentMode = "japan"; // "japan" | "world"
    this.currentRegionId = "hokkaido_tohoku";

    this.allData = {
      japan: JAPAN_PREFECTURES,
      world: WORLD_COUNTRIES
    };

    this.regionDefs = {
      japan: JAPAN_REGIONS,
      world: WORLD_REGIONS
    };

    // 各アイテムの配置状態保持 (id -> boolean)
    this.placedState = new Map();

    // タイムアタック＆統計
    this.startTime = null;
    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.hintUsedCount = 0;

    // 設定
    this.showRuby = true;

    this.init();
  }

  init() {
    // 3Dワールド初期化
    this.map3d = new MapCraft3D("canvas-container");
    this.map3d.onSlotClick = (data, isPlaced) => this.handleSlotClick(data, isPlaced);

    // UI要素のイベントバインド
    this.bindUIEvents();

    // 初期ステージ読み込み
    this.switchMode("japan", "hokkaido_tohoku");
  }

  bindUIEvents() {
    // モード切替タブ (日本 / 世界)
    const modeTabs = document.querySelectorAll(".mode-tab");
    modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.mode;
        if (mode === this.currentMode) return;
        modeTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const initialRegion = mode === "japan" ? "hokkaido_tohoku" : "asia";
        this.switchMode(mode, initialRegion);
      });
    });

    // 地域セレクター
    const regionSelect = document.getElementById("region-select");
    if (regionSelect) {
      regionSelect.addEventListener("change", (e) => {
        this.loadRegion(e.target.value);
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

    // ヒントモーダルの閉じるボタン
    const closeHintBtn = document.getElementById("btn-close-hint");
    const hintModal = document.getElementById("modal-hint");
    if (closeHintBtn && hintModal) {
      closeHintBtn.addEventListener("click", () => hintModal.classList.remove("active"));
      hintModal.addEventListener("click", (e) => {
        if (e.target === hintModal) hintModal.classList.remove("active");
      });
    }

    // コンプリートモーダルの閉じるボタン
    const closeCompBtn = document.getElementById("btn-close-complete");
    const compModal = document.getElementById("modal-complete");
    if (closeCompBtn && compModal) {
      closeCompBtn.addEventListener("click", () => compModal.classList.remove("active"));
    }
  }

  // モード切り替え (日本地図 / 世界地図)
  switchMode(mode, regionId) {
    this.currentMode = mode;
    this.currentRegionId = regionId;

    // 地域ドロップダウン更新
    this.populateRegionSelect();

    // 該当地域の読み込み
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

  // 地域の読み込み
  loadRegion(regionId) {
    this.currentRegionId = regionId;

    const regionSelect = document.getElementById("region-select");
    if (regionSelect) regionSelect.value = regionId;

    // 該当アイテムの抽出
    const allItems = this.allData[this.currentMode];
    let items;
    if (regionId === "all") {
      items = allItems;
    } else {
      items = allItems.filter((item) => item.region === regionId);
    }

    // 状態リセット
    this.placedState.clear();
    items.forEach((item) => this.placedState.set(item.id, false));

    // 3Dステージ再生成
    this.map3d.loadStage(this.currentMode, regionId, items);

    // インベントリトレイの更新
    this.renderInventory(items);

    // 進捗表示の更新
    this.updateProgress();

    // タイマーリセット＆スタート
    this.startTimer();
  }

  // インベントリ（手持ちピース一覧）の描画
  renderInventory(items) {
    const container = document.getElementById("inventory-items");
    if (!container) return;

    container.innerHTML = "";

    // 未配置のピースをシャッフルまたは表示
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "inventory-card";
      card.id = `inv-card-${item.id}`;
      card.dataset.id = item.id;

      const flagOrIcon = item.specialtyIcons ? item.specialtyIcons[0] : (item.flag || "📍");
      const subInfo = this.currentMode === "japan" ? `庁: ${item.capital}` : `首: ${item.capital}`;

      card.innerHTML = `
        <div class="card-icon">${flagOrIcon}</div>
        <div class="card-text">
          <ruby class="card-name">${item.name}<rt>${item.kana || item.nameEn || ""}</rt></ruby>
          <div class="card-capital">${subInfo}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        this.selectInventoryItem(item);
      });

      container.appendChild(card);
    });
  }

  // インベントリのアイテムをクリックしたときの処理
  selectInventoryItem(item) {
    if (this.placedState.get(item.id)) return; // 既に配置済み

    // 地図上の該当スロットへカメラ移動してクラフト
    this.map3d.focusSlot(item.id);

    // クラフト実行
    this.executeCraft(item.id);
  }

  // 3Dスロットがクリックされた時の処理
  handleSlotClick(data, isPlaced) {
    if (window.soundManager) window.soundManager.playHint();

    this.hintUsedCount++;

    if (isPlaced) {
      // 既に配置済み：図鑑（ずかん）カードとして表示
      this.openZukanModal(data);
    } else {
      // 未配置：ヒントウィンドウを表示して、ここにはめるピースを選ばせる！
      this.openHintModal(data);
    }
  }

  // ヒントモーダルを表示 (空白スロットのクリック時)
  openHintModal(data) {
    const modal = document.getElementById("modal-hint");
    if (!modal) return;

    document.getElementById("hint-region-badge").textContent =
      this.currentMode === "japan" ? JAPAN_REGIONS[data.region]?.name : WORLD_REGIONS[data.region]?.name;

    // 首都・県庁所在地
    const capTitle = this.currentMode === "japan" ? "県庁所在地" : "首都";
    document.getElementById("hint-capital-title").textContent = `🏛️ ${capTitle}`;
    document.getElementById("hint-capital-value").textContent = data.capital + (data.capitalKana ? ` (${data.capitalKana})` : "");

    // 特産品・名物
    const specContainer = document.getElementById("hint-specialties");
    specContainer.innerHTML = "";
    if (data.specialties) {
      data.specialties.forEach((spec, idx) => {
        const icon = data.specialtyIcons ? data.specialtyIcons[idx] || "✨" : "✨";
        const badge = document.createElement("span");
        badge.className = "hint-badge";
        badge.innerHTML = `<span class="badge-icon">${icon}</span> ${spec}`;
        specContainer.appendChild(badge);
      });
    }

    // 名所・シンボル
    const landContainer = document.getElementById("hint-landmarks");
    landContainer.innerHTML = "";
    if (data.landmarks) {
      data.landmarks.forEach((land) => {
        const badge = document.createElement("span");
        badge.className = "hint-badge landmark-badge";
        badge.innerHTML = `🏯 ${land}`;
        landContainer.appendChild(badge);
      });
    }

    // 豆知識ヒント
    document.getElementById("hint-trivia-text").textContent = data.trivia || "";

    // 選択肢候補ボタンを生成 (正解＋ランダム2つの3択クイズ！)
    const choicesContainer = document.getElementById("hint-choices");
    choicesContainer.innerHTML = "";

    const candidatePool = this.allData[this.currentMode].filter((i) => i.id !== data.id);
    const shuffledPool = [...candidatePool].sort(() => Math.random() - 0.5);
    const choices = [data, shuffledPool[0], shuffledPool[1]].sort(() => Math.random() - 0.5);

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "btn-craft-choice";
      const icon = choice.specialtyIcons ? choice.specialtyIcons[0] : (choice.flag || "📍");
      btn.innerHTML = `<span class="choice-icon">${icon}</span> <strong>${choice.name}</strong> をクラフト！`;

      btn.addEventListener("click", () => {
        if (choice.id === data.id) {
          // 正解！
          modal.classList.remove("active");
          this.executeCraft(data.id);
        } else {
          // 不正解！
          if (window.soundManager) window.soundManager.playWrong();
          btn.classList.add("btn-wrong");
          btn.innerHTML = `❌ ちがうよ！（${choice.name}ではありません）`;
          setTimeout(() => {
            btn.classList.remove("btn-wrong");
            btn.innerHTML = `<span class="choice-icon">${icon}</span> <strong>${choice.name}</strong> をクラフト！`;
          }, 1200);
        }
      });

      choicesContainer.appendChild(btn);
    });

    modal.classList.add("active");
  }

  // 図鑑モーダル（配置済みブロックをクリックしたときの詳細情報）
  openZukanModal(data) {
    const modal = document.getElementById("modal-hint");
    if (!modal) return;

    document.getElementById("hint-region-badge").textContent = "📖 クラフト完成ずかん";
    const capTitle = this.currentMode === "japan" ? "県庁所在地" : "首都";
    document.getElementById("hint-capital-title").textContent = `🏛️ ${capTitle}`;
    document.getElementById("hint-capital-value").textContent = `${data.name}（${data.capital}）`;

    // 特産品
    const specContainer = document.getElementById("hint-specialties");
    specContainer.innerHTML = "";
    if (data.specialties) {
      data.specialties.forEach((spec, idx) => {
        const icon = data.specialtyIcons ? data.specialtyIcons[idx] || "✨" : "✨";
        const badge = document.createElement("span");
        badge.className = "hint-badge";
        badge.innerHTML = `<span class="badge-icon">${icon}</span> ${spec}`;
        specContainer.appendChild(badge);
      });
    }

    // 名所
    const landContainer = document.getElementById("hint-landmarks");
    landContainer.innerHTML = "";
    if (data.landmarks) {
      data.landmarks.forEach((land) => {
        const badge = document.createElement("span");
        badge.className = "hint-badge landmark-badge";
        badge.innerHTML = `🏯 ${land}`;
        landContainer.appendChild(badge);
      });
    }

    // 豆知識
    document.getElementById("hint-trivia-text").textContent = `【解説】${data.trivia}`;

    // ボタン欄は「完成済み」表示
    const choicesContainer = document.getElementById("hint-choices");
    choicesContainer.innerHTML = `<div class="completed-badge">✅ クラフト済み！この場所は完成しているよ！</div>`;

    modal.classList.add("active");
  }

  // クラフトを実行する
  executeCraft(id) {
    if (this.placedState.get(id)) return;

    this.placedState.set(id, true);

    // インベントリのカードを配置済みにマーク
    const card = document.getElementById(`inv-card-${id}`);
    if (card) {
      card.classList.add("placed");
    }

    // 3Dアニメーション
    this.map3d.craftPiece(id, () => {
      this.updateProgress();
      this.checkCompletion();
    });
  }

  // 進捗状況の更新
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

  // コンプリート判定
  checkCompletion() {
    let allDone = true;
    this.placedState.forEach((val) => {
      if (!val) allDone = false;
    });

    if (allDone) {
      this.stopTimer();

      // ファンファーレ音
      if (window.soundManager) window.soundManager.playFanfare();

      // 紙吹雪エフェクト (canvas-confetti がある場合)
      if (typeof confetti === "function") {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
        setTimeout(() => {
          confetti({
            particleCount: 80,
            angle: 60,
            spread: 55,
            origin: { x: 0 }
          });
          confetti({
            particleCount: 80,
            angle: 120,
            spread: 55,
            origin: { x: 1 }
          });
        }, 300);
      }

      // 星評価計算
      const total = this.placedState.size;
      let stars = 3;
      if (this.hintUsedCount > total * 2) stars = 1;
      else if (this.hintUsedCount > total) stars = 2;

      const starStr = "⭐".repeat(stars) + "☆".repeat(3 - stars);

      // モーダル表示
      const regionName = this.regionDefs[this.currentMode][this.currentRegionId]?.name;
      document.getElementById("comp-region-name").textContent = regionName;
      document.getElementById("comp-time").textContent = this.formatTime(this.elapsedSeconds);
      document.getElementById("comp-hints").textContent = `${this.hintUsedCount} 回`;
      document.getElementById("comp-stars").textContent = starStr;

      const modal = document.getElementById("modal-complete");
      if (modal) modal.classList.add("active");
    }
  }

  // タイマー管理
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

// 起動
window.addEventListener("DOMContentLoaded", () => {
  window.app = new MapCraftApp();
});
