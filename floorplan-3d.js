// floorplan-3d.js — parse SVG floor plan into THREE.Shape walls and extrude
// Exposes a global Floorplan3D with parse() and buildMesh().
(function (global) {
  'use strict';

  // Reject paths containing curves or arcs — we only handle M/L/Z.
  var CURVE_RE = /[CcQqAaSsTt]/;

  function parse(svgText) {
    var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    var pathEls = doc.querySelectorAll('path');
    var total = pathEls.length;
    var kept = [];
    for (var i = 0; i < pathEls.length; i++) {
      var p = pathEls[i];
      var d = p.getAttribute('d');
      if (!d) continue;
      if (CURVE_RE.test(d)) continue;
      var pts = parseDToPoints(d);
      if (pts.length < 2) continue;
      var bbox = bboxOf(pts);
      var diag = Math.hypot(bbox.w, bbox.h);
      if (diag < 30) continue;
      kept.push({ points: pts, bbox: bbox });
    }
    return { paths: kept, total: total, kept: kept.length };
  }

  // Parse a simple "M x y L x y L x y Z" string into [[x,y],...]
  function parseDToPoints(d) {
    var tokens = d.match(/[MLZmlz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if (!tokens) return [];
    var pts = [];
    var i = 0;
    var cmd = null;
    while (i < tokens.length) {
      var t = tokens[i];
      if (/[MLZmlz]/.test(t)) {
        cmd = t;
        i++;
        if (cmd === 'Z' || cmd === 'z') {
          if (pts.length) pts.push([pts[0][0], pts[0][1]]);
        }
      } else {
        var x = parseFloat(tokens[i]);
        var y = parseFloat(tokens[i + 1]);
        i += 2;
        pts.push([x, y]);
      }
    }
    return pts;
  }

  function bboxOf(pts) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i][0], y = pts[i][1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  function buildMesh(parsed, options) {
    options = options || {};
    var height = options.height || 270;
    var group = new THREE.Group();
    group.name = 'Floorplan3D';
    var mat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.9,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    var extrudeSettings = { depth: height, bevelEnabled: false, steps: 1 };
    var built = 0, failed = 0;
    for (var i = 0; i < parsed.paths.length; i++) {
      var pts = parsed.paths[i].points;
      try {
        var shape = new THREE.Shape();
        shape.moveTo(pts[0][0], pts[0][1]);
        for (var j = 1; j < pts.length; j++) {
          shape.lineTo(pts[j][0], pts[j][1]);
        }
        var geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        var mesh = new THREE.Mesh(geom, mat);
        group.add(mesh);
        built++;
      } catch (e) {
        failed++;
      }
    }
    group.userData.stats = { built: built, failed: failed, total: parsed.paths.length };
    return group;
  }

  global.Floorplan3D = { parse: parse, buildMesh: buildMesh };
})(window);
