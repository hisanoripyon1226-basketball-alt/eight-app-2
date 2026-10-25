/**
 * 地図クラフト - 3Dエンジン (リアル日本パズル ＆ リアル世界国形パズル＆地球儀)
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

    this.boardGroup = null;
    this.globeData = null;
    this.slots = new Map();
    this.pieceMeshes = new Map();

    this.dragPlane = new THREE.Plane();
    this.planeIntersect = new THREE.Vector3();
    this.draggedPiece = null;
    this.dragOffset = new THREE.Vector3();
    this.isDragging = false;

    this.particles = [];
    this.isAnimatingCamera = false;

    this.onSlotClick = null;
    this.onPieceGrab = null;
    this.onPiecePlaced = null;

    this.init();
  }

  async init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe8f5);
    this.scene.fog = new THREE.FogExp2(0xbfe8f5, 0.012);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 32, 28);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
      this.controls.minDistance = 6;
      this.controls.maxDistance = 90;
      this.controls.target.set(0, 0, 0);
    }

    this.setupLighting();
    await window.geoUtils.loadData();
    this.setupInteractions();

    window.addEventListener("resize", () => this.onWindowResize());

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556677, 0.8);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff9e6, 1.2);
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
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x90cdf4, 0.45);
    fillLight.position.set(-25, 20, -25);
    this.scene.add(fillLight);
  }

  loadStage(mode, regionId, itemsList, level = "easy") {
    this.currentMode = mode;
    this.currentRegion = regionId;
    this.difficultyLevel = level;

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
  // 日本パズルステージ (待機位置を地図のすぐ横にスマート配置)
  // ==========================================
  setupJapanStage(itemsList, level) {
    this.boardGroup = window.geoUtils.createJapanBoard(level);
    this.scene.add(this.boardGroup);

    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -1.2);
    const qTexture = this.createQuestionTexture();

    itemsList.forEach((item, index) => {
      let pieceColor = 0x38a169;
      if (level === "easy") pieceColor = item.color || 0x48bb78;
      else pieceColor = 0xe2d4b7;

      const prefResult = window.geoUtils.createJapanPrefectureMesh(item.name, pieceColor);
      if (!prefResult) return;

      const { group: pieceGroup, centroid } = prefResult;
      const targetPos = new THREE.Vector3(centroid.x, 0.4, -centroid.y);

      // 地図のすぐ手前・左右に近づけて配置 (移動距離を大幅短縮！)
      const trayPos = this.calculateSmartTrayPosition(index, itemsList.length, centroid);

      pieceGroup.position.copy(trayPos);
      pieceGroup.userData = {
        id: item.id,
        item: item,
        targetPos: targetPos,
        trayPos: trayPos.clone(),
        isPlaced: false
      };
      this.scene.add(pieceGroup);

      // 「？」ピン
      const qPinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.12, 16);
      const qPinMat = new THREE.MeshStandardMaterial({ map: qTexture, roughness: 0.3 });
      const qPin = new THREE.Mesh(qPinGeo, qPinMat);
      qPin.position.set(centroid.x, 0.8, -centroid.y);
      qPin.castShadow = true;
      qPin.userData = { id: item.id, item: item, isPin: true, initialY: 0.8 };
      this.scene.add(qPin);

      // ミニチュア装飾
      const decoGroup = this.createMiniDeco(item);
      decoGroup.position.copy(targetPos);
      decoGroup.position.y += 0.5;
      decoGroup.visible = false;
      this.scene.add(decoGroup);

      this.slots.set(item.id, {
        id: item.id,
        item: item,
        targetPos: targetPos,
        qPin: qPin,
        decoGroup: decoGroup,
        isPlaced: false
      });

      this.pieceMeshes.set(item.id, {
        id: item.id,
        item: item,
        meshGroup: pieceGroup,
        targetPos: targetPos,
        trayPos: trayPos,
        isPlaced: false
      });
    });

    this.focusRegion("japan", this.currentRegion);
  }

  // 地図のすぐ近く（手前または両サイド）に待機させるスマート位置計算
  calculateSmartTrayPosition(index, total, centroid) {
    // 地図のすぐ手前 (Z: 14〜18) に横並びで配置し、移動距離を短縮
    const cols = Math.min(total, 8);
    const row = Math.floor(index / cols);
    const col = index % cols;

    const spacingX = 3.8;
    const startX = -((cols - 1) * spacingX) / 2;
    const startZ = 13.5 + row * 3.8; // 従来の20から13.5に大幅に近づけた！

    return new THREE.Vector3(startX + col * spacingX, 0.4, startZ);
  }

  // ==========================================
  // 世界地図ステージ (本物の国のリアル形状ポリゴンを完全生成！)
  // ==========================================
  setupWorldGlobeStage(itemsList, level) {
    this.globeData = window.geoUtils.createRealGlobe(12);
    this.scene.add(this.globeData.globeGroup);

    const radius = this.globeData.radius;
    const qTexture = this.createQuestionTexture();

    itemsList.forEach((item, index) => {
      // 経度・緯度から地球儀上の3D位置を算出
      const spherePos = window.geoUtils.latLonToSphere(item.grid.z * -2, item.grid.x * 8, radius);

      // ★重要★ 本物の国の形状（ExtrudeGeometry）ポリゴンを生成！
      let pieceGroup = null;
      const countryResult = window.geoUtils.createWorldCountryMesh(item.nameEn, item.color || 0x3182ce);

      if (countryResult) {
        pieceGroup = countryResult.group;
        pieceGroup.scale.set(0.65, 0.65, 0.65); // 地球儀に合わせてスケール調整
      } else {
        // フォールバック
        pieceGroup = new THREE.Group();
        const geom = new THREE.BoxGeometry(2.2, 0.4, 2.2);
        const mat = new THREE.MeshStandardMaterial({ color: item.color || 0x3182ce });
        pieceGroup.add(new THREE.Mesh(geom, mat));
      }

      // 国旗・エンブレムの追加
      const flagGeo = new THREE.BoxGeometry(0.8, 0.5, 0.05);
      const flagMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const flagMesh = new THREE.Mesh(flagGeo, flagMat);
      flagMesh.position.set(0, 0.6, 0);
      pieceGroup.add(flagMesh);

      // 待機位置：地球儀の手前・左右に近づけて配置
      const trayPos = this.calculateGlobeCloseTrayPosition(index, itemsList.length);

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

    this.camera.position.set(0, 10, 32);
    if (this.controls) this.controls.target.set(0, 0, 0);
  }

  calculateGlobeCloseTrayPosition(index, total) {
    const angle = (index / total) * Math.PI * 1.3 - Math.PI * 0.65;
    const r = 18; // 従来の24から18に近づけた！
    return new THREE.Vector3(Math.sin(angle) * r, -4, Math.cos(angle) * r + 2);
  }

  // ==========================================
  // ドラッグ＆ドロップ操作 (移動のしやすさを極限まで改善！)
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

    this.raycaster.setFromCamera(this.mouse, this.camera);

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
        this.draggedPiece = root;
        this.isDragging = true;
        if (this.controls) this.controls.enabled = false;

        root.position.y += 2.0;

        this.dragPlane.setFromNormalAndCoplanarPoint(
          this.camera.getWorldDirection(new THREE.Vector3()).negate(),
          root.position
        );
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersect)) {
          this.dragOffset.copy(this.planeIntersect).sub(root.position);
        }

        if (window.soundManager) window.soundManager.playPickup();
        if (this.onPieceGrab) this.onPieceGrab(root.userData.item);
        return;
      }
    }

    // 「？」ピン判定
    const pinList = [];
    this.slots.forEach((s) => {
      if (!s.isPlaced && s.qPin) pinList.push(s.qPin);
    });

    const pinIntersects = this.raycaster.intersectObjects(pinList, true);
    if (pinIntersects.length > 0) {
      const pinObj = pinIntersects[0].object;
      if (pinObj.userData && pinObj.userData.item) {
        if (this.onSlotClick) this.onSlotClick(pinObj.userData.item);
      }
    }
  }

  onPointerMove(event) {
    if (!this.isDragging || !this.draggedPiece) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.currentMode === "japan") {
      const horizontalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.2);
      if (this.raycaster.ray.intersectPlane(horizontalPlane, this.planeIntersect)) {
        this.draggedPiece.position.x = this.planeIntersect.x;
        this.draggedPiece.position.z = this.planeIntersect.z;
        this.draggedPiece.position.y = 2.2;
      }
    } else {
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
    let dist;
    if (this.currentMode === "japan") {
      dist = Math.hypot(piece.position.x - targetPos.x, piece.position.z - targetPos.z);
    } else {
      dist = piece.position.distanceTo(targetPos);
    }

    // スナップ許容範囲を 4.5（広め）にして快適操作！
    const snapThreshold = this.currentMode === "japan" ? 4.5 : 5.5;

    if (dist <= snapThreshold) {
      this.snapPieceToSlot(piece.userData.id);
    } else {
      this.bouncePieceBack(piece);
    }
  }

  snapPieceToSlot(id) {
    const pieceData = this.pieceMeshes.get(id);
    const slotData = this.slots.get(id);
    if (!pieceData || !slotData) return;

    pieceData.isPlaced = true;
    slotData.isPlaced = true;
    pieceData.meshGroup.userData.isPlaced = true;

    if (slotData.qPin) {
      if (this.currentMode === "japan") this.scene.remove(slotData.qPin);
      else if (this.globeData) this.globeData.tiltGroup.remove(slotData.qPin);
      slotData.qPin = null;
    }

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

        if (slotData.decoGroup) {
          slotData.decoGroup.visible = true;
          this.popInDeco(slotData.decoGroup);
        }

        this.spawnParticles(endPos.x, endPos.y + 1, endPos.z, pieceData.item.color);

        if (window.soundManager) {
          window.soundManager.playPlace();
          window.soundManager.playCorrect();
          const capText = this.currentMode === "japan" ? `県庁所在地は${pieceData.item.capital}` : `首都は${pieceData.item.capital}`;
          window.soundManager.speakName(`正解！${pieceData.item.name}！${capText}`);
        }

        if (this.onPiecePlaced) this.onPiecePlaced(pieceData.item);
      }
    };
    requestAnimationFrame(animSnap);
  }

  bouncePieceBack(pieceMesh) {
    if (window.soundManager) window.soundManager.playWrong();

    const startPos = pieceMesh.position.clone();
    const targetPos = pieceMesh.userData.trayPos.clone();
    const startTime = performance.now();
    const duration = 320;

    const animBack = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
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

  createMiniDeco(item) {
    const group = new THREE.Group();
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

  focusRegion(mode, regionId) {
    if (mode === "japan") {
      const reg = JAPAN_REGIONS[regionId];
      if (reg) {
        this.smoothCameraTo(reg.cameraPos.x, reg.cameraPos.y, reg.cameraPos.z, reg.targetPos.x, 0, reg.targetPos.z);
      }
    } else {
      if (this.globeData) {
        this.smoothCameraTo(0, 10, 32, 0, 0, 0);
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

    if (this.globeData && !this.isDragging) {
      this.globeData.earthMesh.rotation.y += 0.0012;
    }

    const now = time * 0.003;
    this.slots.forEach((slot) => {
      if (slot.qPin && this.currentMode === "japan") {
        slot.qPin.rotation.y += 0.02;
        slot.qPin.position.y = slot.qPin.userData.initialY + Math.sin(now + slot.id.length) * 0.15;
      }
    });

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
