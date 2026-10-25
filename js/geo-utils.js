/**
 * 地図クラフト - リアル地理データ・形状エンジン (GeoUtils)
 * TopoJSONからThree.jsの立体押し出しポリゴンおよびリアル地球儀を生成
 */

class GeoUtils {
  constructor() {
    this.japanTopo = null;
    this.worldTopo = null;
    this.japanGeo = null;
    this.worldGeo = null;
    this.isLoaded = false;

    // 日本地図の投影パラメーター (中心: 東経137.5, 北緯36.8)
    this.japanCenterLon = 137.5;
    this.japanCenterLat = 36.8;
    this.japanScale = 2.4;
  }

  async loadData() {
    if (this.isLoaded) return;

    try {
      const [resJapan, resWorld] = await Promise.all([
        fetch("data/japan.topojson").then((r) => r.json()),
        fetch("data/world.topojson").then((r) => r.json())
      ]);

      this.japanTopo = resJapan;
      this.worldTopo = resWorld;

      if (window.topojson) {
        this.japanGeo = topojson.feature(this.japanTopo, this.japanTopo.objects.japan);
        this.worldGeo = topojson.feature(this.worldTopo, this.worldTopo.objects.countries);
      }
      this.isLoaded = true;
    } catch (e) {
      console.error("Failed to load topojson data", e);
    }
  }

  // 緯度経度から日本地図の2D平面座標への投影
  projectJapan(lon, lat) {
    const x = (lon - this.japanCenterLon) * this.japanScale;
    const y = (lat - this.japanCenterLat) * (this.japanScale * 1.24);
    return { x, y };
  }

  // 緯度経度から地球儀（半径R）上の3D座標への変換
  latLonToSphere(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  }

  // 都道府県名からGeoJSON Featureを取得
  getJapanFeature(prefName) {
    if (!this.japanGeo) return null;
    return this.japanGeo.features.find((f) => f.properties.nam_ja === prefName);
  }

  // 国名（英語）からGeoJSON Featureを取得
  getWorldFeature(countryNameEn) {
    if (!this.worldGeo) return null;
    return this.worldGeo.features.find((f) => {
      const n = f.properties.name;
      if (!n) return false;
      return n.toLowerCase() === countryNameEn.toLowerCase() ||
             n.toLowerCase().includes(countryNameEn.toLowerCase());
    });
  }

  // 都道府県のリアルな立体ピース（THREE.Group）を生成
  createJapanPrefectureMesh(prefName, colorHex = 0x38a169) {
    const feature = this.getJapanFeature(prefName);
    if (!feature) return null;

    const group = new THREE.Group();
    const polygons = this._extractPolygons(feature.geometry);

    // 重心を計算 (主ポリゴンの重心)
    const centroid = this._computeCentroid(polygons);

    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: false
    });

    const extrudeSettings = {
      depth: 0.55,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.08
    };

    polygons.forEach((poly) => {
      // 面積が極端に小さい孤立小島は省略してパフォーマンスを維持
      if (polygons.length > 3 && this._polygonArea(poly.exterior) < 0.005) return;

      const shape = new THREE.Shape();
      const ext = poly.exterior;

      ext.forEach((pt, idx) => {
        const p = this.projectJapan(pt[0], pt[1]);
        // 重心基準にオフセット
        const lx = p.x - centroid.x;
        const ly = p.y - centroid.y;
        if (idx === 0) shape.moveTo(lx, ly);
        else shape.lineTo(lx, ly);
      });

      // 穴（湖など）
      if (poly.holes) {
        poly.holes.forEach((holePts) => {
          const hole = new THREE.Path();
          holePts.forEach((pt, hIdx) => {
            const p = this.projectJapan(pt[0], pt[1]);
            const lx = p.x - centroid.x;
            const ly = p.y - centroid.y;
            if (hIdx === 0) hole.moveTo(lx, ly);
            else hole.lineTo(lx, ly);
          });
          shape.holes.push(hole);
        });
      }

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // 水平面(XZ平面)に寝かせる
      mesh.rotation.x = -Math.PI / 2;
      group.add(mesh);
    });

    return {
      group: group,
      centroid: centroid, // XZ平面上での中心位置 { x, y: 0, z: -centroid.y }
      prefName: prefName
    };
  }

  // 白紙の日本地図ボード（土台プレート ＋ 全都道府県の境界線）を生成
  createJapanBoard(level = "easy") {
    const boardGroup = new THREE.Group();

    // 1. 木製/大理石風の白い盤面台座
    const boardGeo = new THREE.BoxGeometry(60, 0.8, 52);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.4,
      metalness: 0.05
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.y = -0.4;
    boardMesh.receiveShadow = true;
    boardGroup.add(boardMesh);

    // 台座のエッジ装飾フレーム
    const frameGeo = new THREE.BoxGeometry(61, 0.6, 53);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.5 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = -0.6;
    boardGroup.add(frame);

    // 2. 白地図上の都道府県境界線 (レーザー刻印調)
    // level === "hard" (達人モード) の場合は境界線を描かず、海岸線（日本列島の外枠）のみ！
    if (this.japanGeo) {
      const lineMat = new THREE.LineBasicMaterial({
        color: level === "hard" ? 0x94a3b8 : 0x718096,
        linewidth: 1.5,
        transparent: true,
        opacity: level === "hard" ? 0.3 : 0.65
      });

      this.japanGeo.features.forEach((feature) => {
        // 達人モードの場合、各県の境界線は描かない
        if (level === "hard") return;

        const polys = this._extractPolygons(feature.geometry);
        polys.forEach((poly) => {
          const pts = [];
          poly.exterior.forEach((pt) => {
            const p = this.projectJapan(pt[0], pt[1]);
            pts.push(new THREE.Vector3(p.x, 0.02, -p.y));
          });
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(lineGeo, lineMat);
          boardGroup.add(line);
        });
      });

      // 海岸線の強調輪郭
      const coastMat = new THREE.LineBasicMaterial({ color: 0x3182ce, linewidth: 2, transparent: true, opacity: 0.7 });
      this.japanGeo.features.forEach((feature) => {
        const polys = this._extractPolygons(feature.geometry);
        polys.forEach((poly) => {
          if (this._polygonArea(poly.exterior) < 0.02) return;
          const pts = [];
          poly.exterior.forEach((pt) => {
            const p = this.projectJapan(pt[0], pt[1]);
            pts.push(new THREE.Vector3(p.x, 0.03, -p.y));
          });
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          boardGroup.add(new THREE.Line(lineGeo, coastMat));
        });
      });
    }

    return boardGroup;
  }

  // リアルな3D地球儀（Globe）メッシュとスタンドを生成
  createRealGlobe(radius = 12) {
    const globeGroup = new THREE.Group();

    // 1. 地球儀の球体テクスチャをCanvasで高解像度自動生成
    const globeTexture = this._generateGlobeTexture();

    const sphereGeo = new THREE.SphereGeometry(radius, 64, 64);
    const sphereMat = new THREE.MeshStandardMaterial({
      map: globeTexture,
      roughness: 0.5,
      metalness: 0.1
    });

    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.castShadow = true;
    sphereMesh.receiveShadow = true;

    // 地球の自転軸の傾き (23.4度)
    const earthTiltGroup = new THREE.Group();
    earthTiltGroup.rotation.z = THREE.MathUtils.degToRad(-23.4);
    earthTiltGroup.add(sphereMesh);
    globeGroup.add(earthTiltGroup);

    // 2. クラシックな真鍮製地球儀スタンド（半円リング＋支柱＋台座）
    const standMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // 真鍮ゴールド
      roughness: 0.25,
      metalness: 0.8
    });

    // 半円リング (Torus)
    const ringGeo = new THREE.TorusGeometry(radius + 0.8, 0.3, 16, 64, Math.PI);
    const ringMesh = new THREE.Mesh(ringGeo, standMat);
    ringMesh.rotation.z = Math.PI / 2;
    earthTiltGroup.add(ringMesh);

    // 南極・北極の軸ピン
    const axisPinGeo = new THREE.CylinderGeometry(0.18, 0.18, radius * 2 + 2.5, 16);
    const axisPin = new THREE.Mesh(axisPinGeo, standMat);
    earthTiltGroup.add(axisPin);

    // スタンド支柱とベース台座
    const standPoleGeo = new THREE.CylinderGeometry(0.5, 0.6, 6, 16);
    const standPole = new THREE.Mesh(standPoleGeo, standMat);
    standPole.position.y = -(radius + 4);
    globeGroup.add(standPole);

    const baseGeo = new THREE.CylinderGeometry(8, 9, 1.2, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.4 }); // 木製台座
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -(radius + 7);
    baseMesh.receiveShadow = true;
    globeGroup.add(baseMesh);

    return {
      globeGroup: globeGroup,
      earthMesh: sphereMesh,
      tiltGroup: earthTiltGroup,
      radius: radius
    };
  }

  // 高解像度地球儀テクスチャ生成 (Canvas: 2048x1024)
  _generateGlobeTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // 海（深みのあるグラデーションブルー）
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    oceanGrad.addColorStop(0, "#1a365d");
    oceanGrad.addColorStop(0.3, "#2b6cb0");
    oceanGrad.addColorStop(0.5, "#3182ce");
    oceanGrad.addColorStop(0.7, "#2b6cb0");
    oceanGrad.addColorStop(1, "#1a365d");
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // 経緯度グリッド線
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    // 緯線
    for (let lat = -80; lat <= 80; lat += 20) {
      const y = ((90 - lat) / 180) * 1024;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(2048, y);
      ctx.stroke();
    }
    // 経線
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * 2048;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }

    // 赤道（強調線）
    ctx.strokeStyle = "rgba(236, 201, 75, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    ctx.lineTo(2048, 512);
    ctx.stroke();

    // 世界の大陸・国境線の描画
    if (this.worldGeo) {
      ctx.fillStyle = "#edf2f7"; // 白紙の陸地色
      ctx.strokeStyle = "#718096"; // 国境線
      ctx.lineWidth = 1.2;

      this.worldGeo.features.forEach((feature) => {
        const polys = this._extractPolygons(feature.geometry);
        polys.forEach((poly) => {
          ctx.beginPath();
          poly.exterior.forEach((pt, idx) => {
            const x = ((pt[0] + 180) / 360) * 2048;
            const y = ((90 - pt[1]) / 180) * 1024;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }

  // 形状拡大ビューア用のリアルSVGパス生成
  generatePrefectureSVG(prefName, size = 180, color = "#3182ce") {
    const feature = this.getJapanFeature(prefName);
    if (!feature) return "";

    const polys = this._extractPolygons(feature.geometry);
    if (!polys.length) return "";

    // バウンディングボックス計算
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    polys.forEach((poly) => {
      poly.exterior.forEach((pt) => {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      });
    });

    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const scale = (size - 24) / Math.max(w, h);
    const offsetX = (size - w * scale) / 2;
    const offsetY = (size - h * scale) / 2;

    let pathD = "";
    polys.forEach((poly) => {
      poly.exterior.forEach((pt, idx) => {
        const x = offsetX + (pt[0] - minX) * scale;
        // 緯度は上が大きいので反転
        const y = size - (offsetY + (pt[1] - minY) * scale);
        pathD += idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)} ` : `L ${x.toFixed(1)} ${y.toFixed(1)} `;
      });
      pathD += "Z ";
    });

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity="0.3"/>
        </filter>
        <path d="${pathD}" fill="${color}" stroke="#1a202c" stroke-width="2.5" filter="url(#shadow)" stroke-linejoin="round"/>
      </svg>
    `;
  }

  // ポリゴンの正規化抽出 helper
  _extractPolygons(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") {
      return [{
        exterior: geometry.coordinates[0],
        holes: geometry.coordinates.slice(1)
      }];
    } else if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.map((poly) => ({
        exterior: poly[0],
        holes: poly.slice(1)
      }));
    }
    return [];
  }

  // 重心計算 helper
  _computeCentroid(polygons) {
    let sumX = 0, sumY = 0, totalPts = 0;
    polygons.forEach((poly) => {
      poly.exterior.forEach((pt) => {
        const p = this.projectJapan(pt[0], pt[1]);
        sumX += p.x;
        sumY += p.y;
        totalPts++;
      });
    });
    return {
      x: totalPts ? sumX / totalPts : 0,
      y: totalPts ? sumY / totalPts : 0
    };
  }

  // ポリゴン面積計算 helper (簡易外積)
  _polygonArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += (ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]);
    }
    return Math.abs(area / 2);
  }
}

window.geoUtils = new GeoUtils();
