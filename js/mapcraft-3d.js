/**
 * 地図クラフト - 3Dエンジン (リアル日本パズル ＆ リアル3D地球儀)
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

    this.currentMode = "japan"; // "japan" | "world"
    this.currentRegion = "hokkaido_tohoku";
    this.difficultyLevel = "easy"; // "easy" | "normal" | "hard"

    // ジオメトリ＆ピース管理
    this.boardGroup = null;
    this.globeData = null; // { globeGroup, earthMesh, tiltGroup, radius }
    this.slots = new Map(); // id -> slot data
    this.pieceMeshes = new Map(); // id -> piece data

    // ドラッグ＆ドロップ状態管理
    this.dragPlane = new THREE.Plane();
    this.planeIntersect = new THREE.Vector3();
    this.draggedPiece = null;
    this.dragOffset = new THREE.Vector3();
    this.isDragging = false;
    this.pointerDownPos = new THREE.Vector2();

    // パーティクル＆アニメーション
    this.particles = [];
    this.isAnimatingCamera = false;

    // コールバック
    this.onSlotClick = null;     // (item) => void (空白クリックヒント)
    this.onPieceGrab = null;     // (item) => void (ドラッグ開始・シルエット表示)
    this.onPieceDrop = null;     // (item, success) => void
    this.onPiecePlaced = null;   // (item) => void (配置成功)

    this.init();
  }

  async init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // シーン
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe8f5);
    this.scene.fog = new THREE.FogExp2(0xbfe8f5, 0.012);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 36, 32);

    // レンダラー
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
      this.controls.minDistance = 6;
      this.controls.maxDistance = 90;
      this.controls.target.set(0, 0, 0);
    }

    // ライティング
    this.setupLighting();

    // 地理データの事前読み込み
    await window.geoUtils.loadData();

    // ドラッグ＆ドロップ用イベントリスナー
    this.setupInteractions();

    // リサイズ
    window.addEventListener("resize", () => this.onWindowResize());

    // アニメーションループ開始
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556677, 0.75);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff9e6, 1.15);
    dirLight.position.set(25, 45, 30);
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
    dirLight.shadow.bias = -0.0004;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x90cdf4, 0.4);
    fillLight.position.set(-25, 20, -25);
    this.scene.add(fillLight);
  }

  // ステージ読み込み (日本パズル or リアル地球儀)
  loadStage(mode, regionId, itemsList, level = "easy") {
    this.currentMode = mode;
    this.currentRegion = regionId;
    this.difficultyLevel = level;

    // クリーンアップ
    if (this.boardGroup) {
      this.scene.remove(this.boardGroup);
      this.boardGroup = null;
    }
    if (this.globeData) {
      this.scene.remove(this.globeData.globeGroup);
      this.globeData = null;
    }
    this.slots.forEach((s) => {
      if (s.qPin) this.scene.remove(s.qPin);
    });
    this.slots.clear();
    this.pieceMeshes.forEach((p) => {
      this.scene.remove(p.meshGroup);
    });
    this.pieceMeshes.clear();

    if (mode === "japan") {
      this.setupJapanStage(itemsList, level);
    } else {
      this.setupWorldGlobeStage(itemsList, level);
    }
  }

  // ==========================================
  // 1. 日本地図リアルパズルステージ
  // ==========================================
  setupJapanStage(itemsList, level) {
    // 完璧な形の白紙の日本地図ボード
    this.boardGroup = window.geoUtils.createJapanBoard(level);
    this.scene.add(this.boardGroup);

    // 水平ドラッグ平面の設定 (Y = 1.0)
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -1.0);

    const qTexture = this.createQuestionTexture();

    // アイテムごとのリアル立体ピースとスロットを構築
    itemsList.forEach((item, index) => {
      // 地方に応じたカラー、難易度（普通・達人は木製/白）
      let pieceColor = 0x38a169;
      if (level === "easy") {
        pieceColor = item.color || 0x48bb78;
      } else {
        pieceColor = 0xe2d4b7; // リアルな木製パズル調
      }

      const prefResult = window.geoUtils.createJapanPrefectureMesh(item.name, pieceColor);
      if (!prefResult) return;

      const { group: pieceGroup, centroid } = prefResult;

      // 正解位置 (スロット座標)
      const targetPos = new THREE.Vector3(centroid.x, 0.4, -centroid.y);

      // 手持ち待機位置 (トレイ風に下部または画面手前に並べる)
      const trayPos = this.calculateTrayPosition(index, itemsList.length);

      // ピースの初期配置（手持ち待機位置へ）
      pieceGroup.position.copy(trayPos);
      pieceGroup.userData = {
        id: item.id,
        item: item,
        targetPos: targetPos,
        trayPos: trayPos.clone(),
        isPlaced: false
      };
      this.scene.add(pieceGroup);

      // スロット側：「？」ピン（未配置の目印・ヒント用）
      const qPinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
      const qPinMat = new THREE.MeshStandardMaterial({ map: qTexture, roughness: 0.3 });
      const qPin = new THREE.Mesh(qPinGeo, qPinMat);
      qPin.position.set(centroid.x, 0.8, -centroid.y);
      qPin.castShadow = true;
      qPin.userData = { id: item.id, item: item, isPin: true, initialY: 0.8 };
      this.scene.add(qPin);

      // ミニチュア装飾 (正解時にポップアップ)
      const decoGroup = this.createMiniDeco(item);
      decoGroup.position.copy(targetPos);
      decoGroup.position.y += 0.5;
      decoGroup.visible = false;
      this.scene.add(decoGroup);

      // スロット情報
      this.slots.set(item.id, {
        id: item.id,
        item: item,
        targetPos: targetPos,
        qPin: qPin,
        decoGroup: decoGroup,
        isPlaced: false
      });

      // ピース情報
      this.pieceMeshes.set(item.id, {
        id: item.id,
        item: item,
        meshGroup: pieceGroup,
        targetPos: targetPos,
        trayPos: trayPos,
        isPlaced: false
      });
    });

    // カメラを日本全体または指定地方が見える位置へ
    this.focusRegion("japan", this.currentRegion);
  }

  // 手持ちトレイの位置計算 (手前に美しく整列)
  calculateTrayPosition(index, total) {
    const cols = Math.min(total, 9);
    const row = Math.floor(index / cols);
    const col = index % cols;

    const spacingX = 4.2;
    const startX = -((cols - 1) * spacingX) / 2;
    const startZ = 20 + row * 4.2;

    return new THREE.Vector3(startX + col * spacingX, 0.4, startZ);
  }

  // ==========================================
  // 2. 世界地図リアル3D地球儀ステージ
  // ==========================================
  setupWorldGlobeStage(itemsList, level) {
    // リアル3D地球儀の構築 (真鍮スタンド付き)
    this.globeData = window.geoUtils.createRealGlobe(12);
    this.scene.add(this.globeData.globeGroup);

    // 球面ドラッグ用
    const radius = this.globeData.radius;
    const qTexture = this.createQuestionTexture();

    itemsList.forEach((item, index) => {
      // 経度・緯度から地球儀上の球面3D位置を取得
      const spherePos = window.geoUtils.latLonToSphere(item.grid.z * -2, item.grid.x * 8, radius);

      // 国ピース（立体エンブレム・プレート）
      const pieceGroup = new THREE.Group();
      const geom = new THREE.BoxGeometry(2.0, 0.4, 2.0);
      const mat = new THREE.MeshStandardMaterial({
        color: item.color || 0x3182ce,
        roughness: 0.3,
        metalness: 0.2
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      pieceGroup.add(mesh);

      // 国旗・アイコンラベル
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 128;
      labelCanvas.height = 128;
      const ctx = labelCanvas.getContext("2d");
      ctx.fillStyle = item.color || "#3182ce";
      ctx.fillRect(0, 0, 128, 128);
      ctx.font = "60px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.flag || "📍", 64, 64);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTex });
      const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), labelMat);
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.y = 0.22;
      pieceGroup.add(labelMesh);

      // 待機位置
      const trayPos = this.calculateGlobeTrayPosition(index, itemsList.length);
      pieceGroup.position.copy(trayPos);
      pieceGroup.userData = {
        id: item.id,
        item: item,
        targetPos: spherePos.clone(),
        trayPos: trayPos.clone(),
        isPlaced: false
      };
      this.scene.add(pieceGroup);

      // 地球儀上の「？」ピン
      const qPinGeo = new THREE.ConeGeometry(0.5, 1.2, 16);
      const qPinMat = new THREE.MeshStandardMaterial({ color: 0xf6ad55, roughness: 0.3 });
      const qPin = new THREE.Mesh(qPinGeo, qPinMat);
      qPin.position.copy(spherePos);
      qPin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spherePos.clone().normalize());
      qPin.userData = { id: item.id, item: item, isPin: true };
      this.globeData.tiltGroup.add(qPin);

      // ミニチュア
      const deco = this.createMiniDeco(item);
      deco.position.copy(spherePos.clone().multiplyScalar(1.05));
      deco.visible = false;
      this.globeData.tiltGroup.add(deco);

      this.slots.set(item.id, {
        id: item.id,
        item: item,
        targetPos: spherePos,
        qPin: qPin,
        decoGroup: deco,
        isPlaced: false
      });

      this.pieceMeshes.set(item.id, {
        id: item.id,
        item: item,
        meshGroup: pieceGroup,
        targetPos: spherePos,
        trayPos: trayPos,
        isPlaced: false
      });
    });

    // 地球儀が見やすいカメラ位置へ
    this.camera.position.set(0, 12, 38);
    if (this.controls) this.controls.target.set(0, 0, 0);
  }

  calculateGlobeTrayPosition(index, total) {
    const angle = (index / total) * Math.PI * 1.5 - Math.PI * 0.75;
    const r = 24;
    return new THREE.Vector3(Math.sin(angle) * r, -8, Math.cos(angle) * r + 4);
  }

  // ==========================================
  // 3. 3D ドラッグ＆ドロップ インタラクション
  // ==========================================
  setupInteractions() {
    const dom = this.renderer.domElement;

    dom.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e));
  }

  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointerDownPos.set(event.clientX, event.clientY);

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. 手持ちピースのドラッグ判定
    const pieceMeshesList = [];
    this.pieceMeshes.forEach((p) => {
      if (!p.isPlaced) pieceMeshesList.push(p.meshGroup);
    });

    const intersects = this.raycaster.intersectObjects(pieceMeshesList, true);
    if (intersects.length > 0) {
      let root = intersects[0].object;
      while (root.parent && !root.userData.id) {
        root = root.parent;
      }

      if (root.userData && root.userData.id && !root.userData.isPlaced) {
        // ドラッグ開始！
        this.draggedPiece = root;
        this.isDragging = true;
        if (this.controls) this.controls.enabled = false; // カメラ回転を一時停止

        // ピースをふわっと持ち上げる
        root.position.y += 1.6;

        // ドラッグ平面の計算
        this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()).negate(), root.position);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersect)) {
          this.dragOffset.copy(this.planeIntersect).sub(root.position);
        }

        // 音声効果
        if (window.soundManager) window.soundManager.playPickup();

        // 形状ズームビューアの表示コールバック
        if (this.onPieceGrab) {
          this.onPieceGrab(root.userData.item);
        }
        return;
      }
    }

    // 2. 空白スロットの「？」ピンクリック判定 (ヒント表示)
    const pinList = [];
    this.slots.forEach((s) => {
      if (!s.isPlaced && s.qPin) pinList.push(s.qPin);
    });

    const pinIntersects = this.raycaster.intersectObjects(pinList, true);
    if (pinIntersects.length > 0) {
      const pinObj = pinIntersects[0].object;
      if (pinObj.userData && pinObj.userData.item) {
        if (this.onSlotClick) {
          this.onSlotClick(pinObj.userData.item);
        }
      }
    }
  }

  onPointerMove(event) {
    if (!this.isDragging || !this.draggedPiece) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 水平面またはドラッグ平面上をピースが追従
    if (this.currentMode === "japan") {
      const horizontalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.0);
      if (this.raycaster.ray.intersectPlane(horizontalPlane, this.planeIntersect)) {
        this.draggedPiece.position.x = this.planeIntersect.x;
        this.draggedPiece.position.z = this.planeIntersect.z;
        this.draggedPiece.position.y = 2.0; // 浮いた状態
      }
    } else {
      // 地球儀モード
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersect)) {
        this.draggedPiece.position.copy(this.planeIntersect).sub(this.dragOffset);
      }
    }
  }

  onPointerUp(event) {
    if (!this.isDragging || !this.draggedPiece) {
      if (this.controls) this.controls.enabled = true;
      return;
    }

    const piece = this.draggedPiece;
    this.isDragging = false;
    this.draggedPiece = null;
    if (this.controls) this.controls.enabled = true;

    const targetPos = piece.userData.targetPos;
    // 距離判定 (日本ならXZ平面、地球儀なら球面距離)
    let dist;
    if (this.currentMode === "japan") {
      dist = Math.hypot(piece.position.x - targetPos.x, piece.position.z - targetPos.z);
    } else {
      dist = piece.position.distanceTo(targetPos);
    }

    // スナップ許容距離 (3.8単位以内なら正解として吸着！)
    const snapThreshold = this.currentMode === "japan" ? 3.8 : 5.0;

    if (dist <= snapThreshold) {
      // 🎉 正解！カチッと吸着配置！
      this.snapPieceToSlot(piece.userData.id);
    } else {
      // ❌ 不正解！元のトレイへポヨンと戻る
      this.bouncePieceBack(piece);
    }
  }

  // スロットへの吸着ドロップ
  snapPieceToSlot(id) {
    const pieceData = this.pieceMeshes.get(id);
    const slotData = this.slots.get(id);
    if (!pieceData || !slotData) return;

    pieceData.isPlaced = true;
    slotData.isPlaced = true;
    pieceData.meshGroup.userData.isPlaced = true;

    // 「？」ピンを非表示
    if (slotData.qPin) {
      if (this.currentMode === "japan") this.scene.remove(slotData.qPin);
      else if (this.globeData) this.globeData.tiltGroup.remove(slotData.qPin);
      slotData.qPin = null;
    }

    // スロット位置へピタッと吸着アニメーション
    const startPos = pieceData.meshGroup.position.clone();
    const endPos = pieceData.targetPos.clone();
    endPos.y = this.currentMode === "japan" ? 0.4 : pieceData.targetPos.y;

    const startTime = performance.now();
    const animSnap = (now) => {
      const p = Math.min((now - startTime) / 180, 1);
      pieceData.meshGroup.position.lerpVectors(startPos, endPos, p);
      if (p < 1) {
        requestAnimationFrame(animSnap);
      } else {
        pieceData.meshGroup.position.copy(endPos);

        // ミニチュア装飾をポップイン
        if (slotData.decoGroup) {
          slotData.decoGroup.visible = true;
          this.popInDeco(slotData.decoGroup);
        }

        // 星パーティクル
        this.spawnParticles(endPos.x, endPos.y + 1, endPos.z, pieceData.item.color);

        // 音声効果 (カチッ＋正解音＋音声読み上げ)
        if (window.soundManager) {
          window.soundManager.playPlace();
          window.soundManager.playCorrect();
          const capText = this.currentMode === "japan" ? `県庁所在地は${pieceData.item.capital}` : `首都は${pieceData.item.capital}`;
          window.soundManager.speakName(`正解！${pieceData.item.name}！${capText}`);
        }

        // コールバック
        if (this.onPiecePlaced) {
          this.onPiecePlaced(pieceData.item);
        }
      }
    };
    requestAnimationFrame(animSnap);
  }

  // 不正解時のポヨン復帰アニメーション
  bouncePieceBack(pieceMesh) {
    if (window.soundManager) window.soundManager.playWrong();

    const startPos = pieceMesh.position.clone();
    const targetPos = pieceMesh.userData.trayPos.clone();
    const startTime = performance.now();
    const duration = 350;

    const animBack = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // バウンスイージング
      const ease = t * t * (3 - 2 * t);
      pieceMesh.position.lerpVectors(startPos, targetPos, ease);

      if (t < 1) {
        requestAnimationFrame(animBack);
      } else {
        pieceMesh.position.copy(targetPos);
      }
    };
    requestAnimationFrame(animBack);
  }

  // 装飾のポップイン
  popInDeco(group) {
    let s = 0.1;
    const start = performance.now();
    const anim = (now) => {
      const t = Math.min((now - start) / 250, 1);
      const scale = t < 0.8 ? (t / 0.8) * 1.25 : 1.25 - ((t - 0.8) / 0.2) * 0.25;
      group.scale.set(scale, scale, scale);
      if (t < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  // ミニチュア装飾オブジェクト生成
  createMiniDeco(item) {
    const group = new THREE.Group();
    // 旗ポール
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    group.add(pole);

    const flagGeo = new THREE.BoxGeometry(0.5, 0.3, 0.04);
    const flagMat = new THREE.MeshStandardMaterial({ color: item.color || 0xe53e3e });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.3, 0.45, 0);
    group.add(flag);

    return group;
  }

  // クエスチョンブロック (?) のテクスチャ
  createQuestionTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ecc94b";
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = "#b7791f";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 118, 118);

    ctx.font = "bold 80px sans-serif";
    ctx.fillStyle = "#744210";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 64, 68);

    return new THREE.CanvasTexture(canvas);
  }

  // 星パーティクル
  spawnParticles(x, y, z, colorHex) {
    const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const pMat = new THREE.MeshBasicMaterial({ color: colorHex || 0xffd700 });
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Mesh(pGeo, pMat);
      p.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.08 + Math.random() * 0.12;
      p.userData = {
        vx: Math.cos(angle) * speed,
        vy: 0.12 + Math.random() * 0.15,
        vz: Math.sin(angle) * speed,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 1.0
      };
      this.particles.push(p);
      this.scene.add(p);
    }
  }

  // リージョンにフォーカス
  focusRegion(mode, regionId) {
    if (mode === "japan") {
      const reg = JAPAN_REGIONS[regionId];
      if (reg) {
        this.smoothCameraTo(reg.cameraPos.x, reg.cameraPos.y, reg.cameraPos.z, reg.targetPos.x, 0, reg.targetPos.z);
      }
    } else {
      if (this.globeData) {
        this.smoothCameraTo(0, 12, 38, 0, 0, 0);
      }
    }
  }

  smoothCameraTo(cx, cy, cz, tx, ty, tz, duration = 800) {
    const startCam = this.camera.position.clone();
    const endCam = new THREE.Vector3(cx, cy, cz);
    const startTarget = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    const endTarget = new THREE.Vector3(tx, ty, tz);

    const startTime = performance.now();
    this.isAnimatingCamera = true;

    const step = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = p * p * (3 - 2 * p);
      this.camera.position.lerpVectors(startCam, endCam, ease);
      const curTarget = new THREE.Vector3().lerpVectors(startTarget, endTarget, ease);
      if (this.controls) this.controls.target.copy(curTarget);
      if (p < 1) requestAnimationFrame(step);
      else this.isAnimatingCamera = false;
    };
    requestAnimationFrame(step);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate(time) {
    requestAnimationFrame(this.animate);

    if (this.controls && !this.isAnimatingCamera && !this.isDragging) {
      this.controls.update();
    }

    // 地球儀モード時：ゆっくりと微細に自転
    if (this.globeData && !this.isDragging) {
      this.globeData.earthMesh.rotation.y += 0.001;
    }

    // 「？」ピンのふわふわ浮遊
    const now = time * 0.003;
    this.slots.forEach((slot) => {
      if (slot.qPin && this.currentMode === "japan") {
        slot.qPin.rotation.y += 0.02;
        slot.qPin.position.y = slot.qPin.userData.initialY + Math.sin(now + slot.id.length) * 0.15;
      }
    });

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.x += p.userData.vx;
      p.position.y += p.userData.vy;
      p.position.z += p.userData.vz;
      p.userData.vy -= 0.005;
      p.rotation.x += p.userData.rotSpeed;
      p.rotation.y += p.userData.rotSpeed;
      p.userData.life -= 0.02;
      p.scale.multiplyScalar(0.96);

      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.particles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
