// Procedural call-centre workstation cluster.
// Built directly in three.js (no glTF needed for test tour).
// All meshes returned in a single Object3D so the viewer can position them inside the panorama sphere.

(function (global) {
  const THREE = global.THREE;

  // Materials — Trevolution palette
  const MAT = {
    desk:      new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.6, metalness: 0.1 }),
    deskTop:   new THREE.MeshStandardMaterial({ color: 0xF3F5F8, roughness: 0.4 }),
    divider:   new THREE.MeshStandardMaterial({ color: 0xC8102E, roughness: 0.85 }), // large red sidewall
    dividerEdge: new THREE.MeshStandardMaterial({ color: 0x10131A }),
    chair:     new THREE.MeshStandardMaterial({ color: 0x10131A, roughness: 0.5 }),
    monitor:   new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 }),
    monitorOn: new THREE.MeshStandardMaterial({ color: 0xFFD03F, emissive: 0xFFD03F, emissiveIntensity: 0.6 }),
  };

  // Single workstation — desk + tall red side divider + chair + monitor
  function buildWorkstation() {
    const g = new THREE.Group();

    // Desk leg/base
    const base = new THREE.Mesh(new THREE.BoxGeometry(120, 4, 70), MAT.desk);
    base.position.y = 75;
    g.add(base);

    // Desk top (lighter)
    const top = new THREE.Mesh(new THREE.BoxGeometry(120, 2, 70), MAT.deskTop);
    top.position.y = 78;
    g.add(top);

    // Front legs
    [-55, 55].forEach(x => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(4, 75, 4), MAT.desk);
      leg.position.set(x, 37, 30);
      g.add(leg);
      const leg2 = leg.clone(); leg2.position.z = -30; g.add(leg2);
    });

    // Large red sidewall divider (tall acoustic panel)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 120, 75), MAT.divider);
    wall.position.set(62, 80, 0);
    g.add(wall);
    const wallEdge = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 78), MAT.dividerEdge);
    wallEdge.position.set(62, 140, 0);
    g.add(wallEdge);

    // Monitor (screen + stand)
    const stand = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 6), MAT.desk);
    stand.position.set(0, 86, -10);
    g.add(stand);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(60, 35, 3), MAT.monitorOn);
    screen.position.set(0, 110, -12);
    g.add(screen);

    // Chair — seat + back
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 6, 24), MAT.chair);
    seat.position.set(0, 50, 50);
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(40, 50, 6), MAT.chair);
    back.position.set(0, 78, 70);
    g.add(back);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 50, 12), MAT.chair);
    post.position.set(0, 25, 50);
    g.add(post);

    return g;
  }

  // Cluster: rows × cols workstations sharing red dividers
  function buildCallCentreCluster({ rows = 2, cols = 3, spacingX = 130, spacingZ = 180 } = {}) {
    const cluster = new THREE.Group();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ws = buildWorkstation();
        ws.position.set(c * spacingX - ((cols - 1) * spacingX) / 2,
                        0,
                        r * spacingZ - ((rows - 1) * spacingZ) / 2);
        // Mirror every other row so workstations face each other
        if (r % 2 === 1) ws.rotation.y = Math.PI;
        cluster.add(ws);
      }
    }

    // Add ambient + key light so materials read correctly inside the panorama sphere
    cluster.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(200, 400, 200);
    cluster.add(key);

    return cluster;
  }

  // ---------------------------------------------------------------------------
  // Tier 1 — Procedural catalog (Wave C)
  // Each builder returns a THREE.Group ready to be positioned by the caller.
  // Dimensions are in centimetres to match the existing call-centre cluster.
  // ---------------------------------------------------------------------------

  function _mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...opts });
  }

  function buildDesk({ width = 120, depth = 60, height = 75, color = 0x444444, topColor = 0xF3F5F8 } = {}) {
    const g = new THREE.Group();
    const legMat = _mat(color);
    const topMat = _mat(topColor, { roughness: 0.4 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 3, depth), topMat);
    top.position.y = height;
    g.add(top);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(4, height, 4), legMat);
      leg.position.set(sx * (width/2 - 4), height/2, sz * (depth/2 - 4));
      g.add(leg);
    });
    g.userData.kind = 'desk';
    return g;
  }

  function buildChair({ color = 0x10131A } = {}) {
    const g = new THREE.Group();
    const m = _mat(color, { roughness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(48, 6, 48), m);
    seat.position.y = 48;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(48, 40, 5), m);
    back.position.set(0, 70, -22);
    g.add(back);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 42, 12), m);
    post.position.y = 24;
    g.add(post);
    const baseStar = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 3, 16), m);
    baseStar.position.y = 3;
    g.add(baseStar);
    g.userData.kind = 'chair';
    return g;
  }

  function buildMonitor({ width = 60, height = 35, on = true } = {}) {
    const g = new THREE.Group();
    const frame = _mat(0x0a0a0a, { roughness: 0.3 });
    const screenMat = on
      ? new THREE.MeshStandardMaterial({ color: 0xFFD03F, emissive: 0xFFD03F, emissiveIntensity: 0.7 })
      : _mat(0x111111);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 6), frame);
    stand.position.y = 8;
    g.add(stand);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 4), frame);
    neck.position.y = 22;
    g.add(neck);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(width, height, 3), screenMat);
    screen.position.y = 30 + height / 2;
    g.add(screen);
    g.userData.kind = 'monitor';
    return g;
  }

  function buildPlant({ size = 40 } = {}) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.35, size * 0.28, size * 0.4, 16),
      _mat(0x6b3f1d)
    );
    pot.position.y = size * 0.2;
    g.add(pot);
    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.55, 16, 12),
      _mat(0x2f7d3c, { roughness: 0.85 })
    );
    foliage.position.y = size * 0.4 + size * 0.45;
    foliage.scale.y = 1.2;
    g.add(foliage);
    g.userData.kind = 'plant';
    return g;
  }

  function buildSofa({ width = 180, depth = 80, color = 0x3a3a3a } = {}) {
    const g = new THREE.Group();
    const m = _mat(color, { roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 25, depth), m);
    base.position.y = 22;
    g.add(base);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(width - 10, 15, depth - 10), m);
    cushion.position.y = 42;
    g.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, 50, 18), m);
    back.position.set(0, 55, -depth / 2 + 9);
    g.add(back);
    [-1, 1].forEach(s => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(15, 38, depth), m);
      arm.position.set(s * (width / 2 - 7), 40, 0);
      g.add(arm);
    });
    g.userData.kind = 'sofa';
    return g;
  }

  function buildPhoneBooth({ width = 110, depth = 110, height = 210, color = 0x0A0A0A } = {}) {
    const g = new THREE.Group();
    const frame = _mat(color, { roughness: 0.4, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x10131A, roughness: 0.2, metalness: 0.5,
      transparent: true, opacity: 0.55,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 6, depth), frame);
    floor.position.y = 3;
    g.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width, 8, depth), frame);
    roof.position.y = height - 4;
    g.add(roof);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, height - 12, 3), glass);
    back.position.set(0, height / 2, -depth / 2 + 1.5);
    g.add(back);
    [-1, 1].forEach(s => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(3, height - 12, depth), glass);
      side.position.set(s * (width / 2 - 1.5), height / 2, 0);
      g.add(side);
    });
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(width, 4, depth),
      new THREE.MeshStandardMaterial({ color: 0xFFD03F, emissive: 0xFFD03F, emissiveIntensity: 0.4 })
    );
    accent.position.y = height - 12;
    g.add(accent);
    g.userData.kind = 'phoneBooth';
    return g;
  }

  function buildBookshelf({ width = 80, height = 180, depth = 30 } = {}) {
    const g = new THREE.Group();
    const m = _mat(0x3a2a1a, { roughness: 0.8 });
    [-1, 1].forEach(s => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(3, height, depth), m);
      side.position.set(s * (width / 2 - 1.5), height / 2, 0);
      g.add(side);
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 3, depth), m);
    top.position.y = height - 1.5;
    g.add(top);
    const bottom = top.clone();
    bottom.position.y = 1.5;
    g.add(bottom);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width - 6, height - 6, 1), m);
    back.position.set(0, height / 2, -depth / 2 + 0.5);
    g.add(back);
    const shelfCount = 4;
    const bookColors = [0xC8102E, 0xFFD03F, 0xF3F5F8, 0x2a7d3c, 0x10131A, 0x3a6fa0];
    for (let i = 1; i <= shelfCount; i++) {
      const y = (height / (shelfCount + 1)) * i;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 6, 2, depth - 4), m);
      shelf.position.y = y;
      g.add(shelf);
      let x = -width / 2 + 6;
      while (x < width / 2 - 6) {
        const bw = 3 + Math.random() * 5;
        const bh = 18 + Math.random() * 8;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, depth - 8),
          _mat(bookColors[Math.floor(Math.random() * bookColors.length)])
        );
        book.position.set(x + bw / 2, y + 1 + bh / 2, 0);
        g.add(book);
        x += bw + 0.5;
      }
    }
    g.userData.kind = 'bookshelf';
    return g;
  }

  const CATALOG = [
    { type: 'desk',        label: 'Desk',         build: buildDesk },
    { type: 'chair',       label: 'Task Chair',   build: buildChair },
    { type: 'monitor',     label: 'Monitor',      build: buildMonitor },
    { type: 'plant',       label: 'Pot Plant',    build: buildPlant },
    { type: 'sofa',        label: 'Sofa',         build: buildSofa },
    { type: 'phoneBooth',  label: 'Phone Booth',  build: buildPhoneBooth },
    { type: 'bookshelf',   label: 'Bookshelf',    build: buildBookshelf },
  ];

  function buildFromSpec(type, params) {
    const entry = CATALOG.find(c => c.type === type);
    if (!entry) return null;
    return entry.build(params || {});
  }

  global.TrevolutionFurniture = {
    buildWorkstation, buildCallCentreCluster,
    buildDesk, buildChair, buildMonitor, buildPlant, buildSofa, buildPhoneBooth, buildBookshelf,
    buildFromSpec, CATALOG,
  };
})(window);
