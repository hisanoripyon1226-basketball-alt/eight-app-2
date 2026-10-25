/**
 * 地図クラフト - 3Dボクセルワールド (Three.js エンジン)
 */
class MapCraft3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.slots = new Map(); // id -> slot object { mesh, data, isPlaced, decoMesh }
    this.clouds = [];
    this.waterMesh = null;
    this.particles = [];

    this.currentMode = "japan"; // "japan" | "world"
    this.currentRegion = "hokkaido_tohoku";
    this.onSlotClick = null; // コールバック (data, isPlaced) => void

    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.isAnimatingCamera = false;
    this.cameraAnim = null;

    this.blockTextures = {};

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // シーン作成
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbbf2f6); // 明るいクラフトブルー空
    this.scene.fog = new THREE.FogExp2(0xbbf2f6, 0.015);

    // カメラ作成
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(10, 20, 20);

    // レンダラー作成
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // オービットコントロール (THREE.OrbitControls が存在する場合)
    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // 地面下に潜らない
      this.controls.minDistance = 5;
      this.controls.maxDistance = 75;
      this.controls.target.set(0, 0, 0);
    }

    // ライティング (クラフト風の明るく温かい光)
    this.setupLighting();

    // 背景環境 (ボクセル水面・雲・グリッド土台)
    this.setupEnvironment();

    // テクスチャジェネレータ事前生成
    this.initProceduralTextures();

    // イベントリスナー
    window.addEventListener("resize", () => this.onWindowResize());
    this.renderer.domElement.addEventListener("pointerdown", (e) => this.onPointerDown(e));

    // アニメーションループ開始
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLighting() {
    // 環境光
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x446655, 0.7);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    // 太陽光（シャドウ付き）
    const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.1);
    dirLight.position.set(30, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 120;
    const d = 35;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 補助ソフトライト
    const fillLight = new THREE.DirectionalLight(0x90cdf4, 0.4);
    fillLight.position.set(-25, 20, -20);
    this.scene.add(fillLight);
  }

  setupEnvironment() {
    // 海面（ボクセル調の半透明水面）
    const waterGeo = new THREE.PlaneGeometry(200, 200, 32, 32);
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x319795,
      transparent: true,
      opacity: 0.75,
      wireframe: false
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = -0.6;
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // 深海ブロックベッド（底）
    const oceanBedGeo = new THREE.BoxGeometry(200, 4, 200);
    const oceanBedMat = new THREE.MeshLambertMaterial({ color: 0x1d4044 });
    const oceanBed = new THREE.Mesh(oceanBedGeo, oceanBedMat);
    oceanBed.position.y = -2.6;
    oceanBed.receiveShadow = true;
    this.scene.add(oceanBed);

    // 浮遊ボクセル雲の生成
    this.createClouds();
  }

  createClouds() {
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85
    });

    for (let i = 0; i < 16; i++) {
      const cloudGroup = new THREE.Group();
      const numBlocks = 4 + Math.floor(Math.random() * 5);
      for (let j = 0; j < numBlocks; j++) {
        const sx = 2 + Math.random() * 4;
        const sy = 1 + Math.random() * 1.5;
        const sz = 2 + Math.random() * 3;
        const bGeo = new THREE.BoxGeometry(sx, sy, sz);
        const bMesh = new THREE.Mesh(bGeo, cloudMat);
        bMesh.position.set(
          (j - numBlocks / 2) * 2.5,
          Math.sin(j) * 0.5,
          (Math.random() - 0.5) * 3
        );
        cloudGroup.add(bMesh);
      }

      cloudGroup.position.set(
        (Math.random() - 0.5) * 120,
        18 + Math.random() * 10,
        (Math.random() - 0.5) * 120
      );
      cloudGroup.userData = { speed: 0.03 + Math.random() * 0.03 };
      this.clouds.push(cloudGroup);
      this.scene.add(cloudGroup);
    }
  }

  // キャンバスを使ったクラフト風プロシージャルテクスチャ生成
  initProceduralTextures() {
    this.blockTextures.dirt = this.createVoxelTexture("#8B5A2B", "#654321", 16);
    this.blockTextures.stone = this.createVoxelTexture("#808080", "#505050", 16);
    this.blockTextures.sand = this.createVoxelTexture("#e2c084", "#c8a165", 16);
    this.blockTextures.snowSide = this.createVoxelTexture("#94a3b8", "#64748b", 16);
  }

  createVoxelTexture(baseColor, darkColor, size = 16) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // クラフト特有のドットノイズ
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if (Math.random() > 0.6) {
          ctx.fillStyle = darkColor;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  }

  // 都道府県名 / 国名入りの上面ボクセルテクスチャ生成
  createTopLabelTexture(name, icon, bgColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // 地形背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);

    // クラフト調の枠線
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 242);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 228, 228);

    // アイコン描画
    ctx.font = "72px 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon || "📍", 128, 85);

    // テキスト背景シャドウプレート
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    this.roundRect(ctx, 20, 155, 216, 75, 12, true, false);

    // テキスト描画 (県名/国名)
    ctx.fillStyle = "#ffffff";
    const fontSize = name.length > 5 ? 32 : (name.length > 3 ? 38 : 46);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText(name, 128, 195);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // クエスチョンブロック (?) のテクスチャ
  createQuestionTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f6ad55";
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = "#c05621";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 118, 118);

    // コーナービス
    ctx.fillStyle = "#7b341e";
    ctx.fillRect(10, 10, 12, 12);
    ctx.fillRect(106, 10, 12, 12);
    ctx.fillRect(10, 106, 12, 12);
    ctx.fillRect(106, 106, 12, 12);

    ctx.font = "bold 80px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#7b341e";
    ctx.shadowBlur = 8;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 64, 68);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  // ステージ構築 (日本 or 世界の指定リージョン)
  loadStage(mode, regionId, itemsList) {
    this.currentMode = mode;
    this.currentRegion = regionId;

    // 既存スロットのクリーンアップ
    this.slots.forEach((slot) => {
      this.scene.remove(slot.group);
      if (slot.qBlock) this.scene.remove(slot.qBlock);
    });
    this.slots.clear();

    const qTexture = this.createQuestionTexture();

    // 各アイテムの3Dボクセル構築
    itemsList.forEach((item) => {
      const group = new THREE.Group();
      group.position.set(item.grid.x, 0, item.grid.z);

      const width = 1.8;
      const height = item.grid.h || 1.4;
      const depth = 1.8;

      // 1. 未配置台座 (スロットベース)
      const slotGeo = new THREE.BoxGeometry(width, 0.4, depth);
      const slotMat = new THREE.MeshLambertMaterial({
        color: 0x4a5568,
        transparent: true,
        opacity: 0.5,
        wireframe: false
      });
      const baseMesh = new THREE.Mesh(slotGeo, slotMat);
      baseMesh.position.y = 0.2;
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      // ワイヤーフレーム枠線
      const edges = new THREE.EdgesGeometry(slotGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x63b3ed, linewidth: 2 });
      const wire = new THREE.LineSegments(edges, lineMat);
      wire.position.y = 0.2;
      group.add(wire);

      // 2. 空白時：上にふわふわ浮く「？」ブロック
      const qGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const qMat = new THREE.MeshLambertMaterial({ map: qTexture });
      const qBlock = new THREE.Mesh(qGeo, qMat);
      qBlock.position.set(item.grid.x, 1.8, item.grid.z);
      qBlock.castShadow = true;
      qBlock.userData = { id: item.id, initialY: 1.8, seed: Math.random() * 10 };
      this.scene.add(qBlock);

      // 3. 配置用ブロック (最初は非表示 / 空中待機)
      const blockGeo = new THREE.BoxGeometry(width, height, depth);
      const topTex = this.createTopLabelTexture(
        item.name,
        item.specialtyIcons ? item.specialtyIcons[0] : (item.flag || "📍"),
        item.color || "#48bb78"
      );

      const sideTex = item.biome === "snow"
        ? this.blockTextures.snowSide
        : item.biome === "desert"
        ? this.blockTextures.sand
        : this.blockTextures.dirt;

      const materials = [
        new THREE.MeshLambertMaterial({ map: sideTex }),
        new THREE.MeshLambertMaterial({ map: sideTex }),
        new THREE.MeshLambertMaterial({ map: topTex }), // 上面
        new THREE.MeshLambertMaterial({ map: this.blockTextures.stone }), // 底面
        new THREE.MeshLambertMaterial({ map: sideTex }),
        new THREE.MeshLambertMaterial({ map: sideTex })
      ];

      const pieceMesh = new THREE.Mesh(blockGeo, materials);
      pieceMesh.position.y = height / 2;
      pieceMesh.castShadow = true;
      pieceMesh.receiveShadow = true;
      pieceMesh.visible = false; // 最初は隠しておく
      group.add(pieceMesh);

      // 4. 正解後に出現するミニチュアオブジェクト (木、城、ビル、シンボル)
      const decoGroup = this.createDecoration(item, height);
      decoGroup.visible = false;
      group.add(decoGroup);

      // クリック判定用の大きな不可視コライダー
      const hitGeo = new THREE.BoxGeometry(width + 0.4, height + 2.5, depth + 0.4);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitBox = new THREE.Mesh(hitGeo, hitMat);
      hitBox.position.y = (height + 2) / 2;
      hitBox.userData = { id: item.id };
      group.add(hitBox);

      this.scene.add(group);

      this.slots.set(item.id, {
        id: item.id,
        data: item,
        group: group,
        baseMesh: baseMesh,
        wire: wire,
        qBlock: qBlock,
        pieceMesh: pieceMesh,
        decoGroup: decoGroup,
        hitBox: hitBox,
        height: height,
        isPlaced: false
      });
    });

    // カメラ位置をリージョン全体が見渡せる位置へ
    this.focusRegion(mode, regionId);
  }

  // 各都道府県・国に合ったかわいいボクセルミニチュア装飾を生成
  createDecoration(item, baseHeight) {
    const group = new THREE.Group();
    group.position.y = baseHeight;

    const biome = item.biome || "grass";

    if (biome === "city" || item.id === "tokyo" || item.id === "usa") {
      // ミニチュア・タワー/ビル
      const towerGeo = new THREE.BoxGeometry(0.45, 1.4, 0.45);
      const towerMat = new THREE.MeshLambertMaterial({ color: 0xe53e3e });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(0.4, 0.7, 0.4);
      tower.castShadow = true;
      group.add(tower);

      const antGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
      const antMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const ant = new THREE.Mesh(antGeo, antMat);
      ant.position.set(0.4, 1.6, 0.4);
      group.add(ant);
    } else if (biome === "mountain" || item.id === "shizuoka" || item.id === "yamanashi" || item.id === "switzerland") {
      // ミニ富士山 / アルプス
      const mtnGeo = new THREE.ConeGeometry(0.7, 1.2, 4);
      const mtnMat = new THREE.MeshLambertMaterial({ color: 0x3182ce, flatShading: true });
      const mtn = new THREE.Mesh(mtnGeo, mtnMat);
      mtn.position.set(0.3, 0.6, 0.3);
      mtn.rotation.y = Math.PI / 4;
      mtn.castShadow = true;
      group.add(mtn);

      // 雪の山頂
      const snowGeo = new THREE.ConeGeometry(0.3, 0.5, 4);
      const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      const snow = new THREE.Mesh(snowGeo, snowMat);
      snow.position.set(0.3, 0.95, 0.3);
      snow.rotation.y = Math.PI / 4;
      group.add(snow);
    } else if (biome === "desert" || item.id === "egypt") {
      // ミニピラミッド
      const pyrGeo = new THREE.ConeGeometry(0.75, 0.9, 4);
      const pyrMat = new THREE.MeshLambertMaterial({ color: 0xd69e2e, flatShading: true });
      const pyr = new THREE.Mesh(pyrGeo, pyrMat);
      pyr.position.set(0.3, 0.45, 0.3);
      pyr.rotation.y = Math.PI / 4;
      pyr.castShadow = true;
      group.add(pyr);
    } else if (biome === "ancient" || item.id === "kyoto" || item.id === "nara") {
      // お寺・鳥居風ミニチュア
      const roofGeo = new THREE.BoxGeometry(0.8, 0.15, 0.8);
      const roofMat = new THREE.MeshLambertMaterial({ color: 0xc53030 });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0.3, 0.7, 0.3);
      group.add(roof);

      const baseGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0xd69e2e });
      const b = new THREE.Mesh(baseGeo, baseMat);
      b.position.set(0.3, 0.3, 0.3);
      b.castShadow = true;
      group.add(b);
    } else {
      // クラフト風の木 (幹＋緑の葉ブロック)
      const trunkGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(0.4, 0.25, 0.4);
      trunk.castShadow = true;
      group.add(trunk);

      const leavesGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const leavesMat = new THREE.MeshLambertMaterial({ color: 0x38a169 });
      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.set(0.4, 0.7, 0.4);
      leaves.castShadow = true;
      group.add(leaves);
    }

    // 小さなフラッグポール（旗）
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xedf2f7 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(-0.55, 0.45, -0.55);
    group.add(pole);

    const flagGeo = new THREE.BoxGeometry(0.35, 0.2, 0.04);
    const flagMat = new THREE.MeshLambertMaterial({ color: item.color || 0x3182ce });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(-0.35, 0.75, -0.55);
    group.add(flag);

    return group;
  }

  // ピースをクラフト設置する (ドロップアニメーション＆パーティクル)
  craftPiece(id, onComplete) {
    const slot = this.slots.get(id);
    if (!slot || slot.isPlaced) return;

    slot.isPlaced = true;

    // 「？」ブロックを非表示
    if (slot.qBlock) {
      this.scene.remove(slot.qBlock);
      slot.qBlock = null;
    }

    // 台座のワイヤー枠線を非表示
    slot.wire.visible = false;
    slot.baseMesh.material.opacity = 0.2;

    // ピースを上空から落下させる
    const piece = slot.pieceMesh;
    const deco = slot.decoGroup;
    piece.visible = true;

    const startY = slot.height / 2 + 8;
    const targetY = slot.height / 2;
    piece.position.y = startY;

    let progress = 0;
    const dropDuration = 450; // ms
    const startTime = performance.now();

    const animateDrop = (now) => {
      const elapsed = now - startTime;
      progress = Math.min(elapsed / dropDuration, 1);

      // バウンスイージング
      const t = progress;
      let easeY;
      if (t < 0.7) {
        easeY = (t / 0.7) * (t / 0.7);
        piece.position.y = startY - easeY * (startY - targetY);
      } else {
        // 小さなバウンド
        const bounceT = (t - 0.7) / 0.3;
        const bounceH = Math.sin(bounceT * Math.PI) * 0.8;
        piece.position.y = targetY + bounceH;
      }

      if (progress < 1) {
        requestAnimationFrame(animateDrop);
      } else {
        piece.position.y = targetY;
        // ミニチュア装飾をポンッとポップアップ表示
        deco.visible = true;
        deco.scale.set(0.1, 0.1, 0.1);
        this.popInDeco(deco);

        // 星パーティクル生成
        this.spawnCraftParticles(slot.data.grid.x, targetY + 1.2, slot.data.grid.z, slot.data.color);

        if (window.soundManager) {
          window.soundManager.playPlace();
          window.soundManager.playCorrect();
        }

        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animateDrop);
  }

  // 装飾のポップインアニメーション
  popInDeco(group) {
    let s = 0.1;
    const popStart = performance.now();
    const animatePop = (now) => {
      const t = Math.min((now - popStart) / 250, 1);
      // overshoot イージング
      const scale = t < 0.8 ? (t / 0.8) * 1.25 : 1.25 - ((t - 0.8) / 0.2) * 0.25;
      group.scale.set(scale, scale, scale);
      if (t < 1) requestAnimationFrame(animatePop);
    };
    requestAnimationFrame(animatePop);
  }

  // クラフト成功時の星パーティクル
  spawnCraftParticles(x, y, z, colorHex) {
    const pCount = 18;
    const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const pMat = new THREE.MeshBasicMaterial({ color: colorHex || 0xffd700 });

    for (let i = 0; i < pCount; i++) {
      const p = new THREE.Mesh(pGeo, pMat);
      p.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.12;
      p.userData = {
        vx: Math.cos(angle) * speed,
        vy: 0.1 + Math.random() * 0.15,
        vz: Math.sin(angle) * speed,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 1.0
      };
      this.particles.push(p);
      this.scene.add(p);
    }
  }

  // リージョン全体を見渡すカメラ移動
  focusRegion(mode, regionId) {
    const regionInfo = mode === "japan" ? JAPAN_REGIONS[regionId] : WORLD_REGIONS[regionId];
    if (!regionInfo) return;

    this.smoothCameraTo(
      regionInfo.cameraPos.x,
      regionInfo.cameraPos.y,
      regionInfo.cameraPos.z,
      regionInfo.targetPos.x,
      regionInfo.targetPos.y,
      regionInfo.targetPos.z
    );
  }

  // 個別スロットにフォーカス
  focusSlot(id) {
    const slot = this.slots.get(id);
    if (!slot) return;

    const gx = slot.data.grid.x;
    const gz = slot.data.grid.z;

    this.smoothCameraTo(gx + 5, 8, gz + 7, gx, 1, gz);
  }

  smoothCameraTo(cx, cy, cz, tx, ty, tz, duration = 800) {
    const startCam = this.camera.position.clone();
    const endCam = new THREE.Vector3(cx, cy, cz);

    const startTarget = this.controls ? this.controls.target.clone() : this.cameraTarget.clone();
    const endTarget = new THREE.Vector3(tx, ty, tz);

    const startTime = performance.now();
    this.isAnimatingCamera = true;

    const animStep = (now) => {
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);
      // smoothstep
      const ease = p * p * (3 - 2 * p);

      this.camera.position.lerpVectors(startCam, endCam, ease);
      const curTarget = new THREE.Vector3().lerpVectors(startTarget, endTarget, ease);

      if (this.controls) {
        this.controls.target.copy(curTarget);
      } else {
        this.camera.lookAt(curTarget);
      }

      if (p < 1) {
        requestAnimationFrame(animStep);
      } else {
        this.isAnimatingCamera = false;
      }
    };

    requestAnimationFrame(animStep);
  }

  // ポインタークリック判定
  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // ヒットコライダーおよび「？」ブロックを判定
    const hitList = [];
    this.slots.forEach((slot) => {
      if (slot.hitBox) hitList.push(slot.hitBox);
      if (slot.qBlock) hitList.push(slot.qBlock);
      if (slot.pieceMesh && slot.pieceMesh.visible) hitList.push(slot.pieceMesh);
    });

    const intersects = this.raycaster.intersectObjects(hitList, true);

    if (intersects.length > 0) {
      let clickedId = null;
      let obj = intersects[0].object;
      while (obj) {
        if (obj.userData && obj.userData.id) {
          clickedId = obj.userData.id;
          break;
        }
        obj = obj.parent;
      }

      if (clickedId && this.slots.has(clickedId)) {
        const slot = this.slots.get(clickedId);
        if (this.onSlotClick) {
          this.onSlotClick(slot.data, slot.isPlaced);
        }
      }
    }
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // 毎フレームのアニメーション
  animate(time) {
    requestAnimationFrame(this.animate);

    // コントロール更新
    if (this.controls && !this.isAnimatingCamera) {
      this.controls.update();
    }

    // 浮遊雲の移動
    this.clouds.forEach((cloud) => {
      cloud.position.x += cloud.userData.speed;
      if (cloud.position.x > 70) cloud.position.x = -70;
    });

    // 「？」ブロックのふわふわアニメーション
    const now = time * 0.003;
    this.slots.forEach((slot) => {
      if (slot.qBlock) {
        slot.qBlock.rotation.y += 0.02;
        slot.qBlock.position.y = slot.qBlock.userData.initialY + Math.sin(now + slot.qBlock.userData.seed) * 0.25;
      }
    });

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.x += p.userData.vx;
      p.position.y += p.userData.vy;
      p.position.z += p.userData.vz;
      p.userData.vy -= 0.005; // 重力
      p.rotation.x += p.userData.rotSpeed;
      p.rotation.y += p.userData.rotSpeed;
      p.userData.life -= 0.02;
      p.scale.multiplyScalar(0.96);

      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.particles.splice(i, 1);
      }
    }

    // 水面の微細な波打ち
    if (this.waterMesh) {
      this.waterMesh.position.y = -0.6 + Math.sin(time * 0.0015) * 0.06;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
