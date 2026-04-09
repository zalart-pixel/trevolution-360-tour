/* Trevolution 360 VT — Analytics (Wave D)
 * Vanilla browser script. No deps. localStorage-backed event log.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'trevolution_analytics_v1';
  var MAX_EVENTS = 5000;
  var CAM_THROTTLE_MS = 2000;

  var enabled = false;
  var sessionStart = Date.now();
  var lastSceneLoadTs = 0;
  var lastCamSampleTs = 0;

  function loadLog() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveLog(log) {
    try {
      if (log.length > MAX_EVENTS) log = log.slice(log.length - MAX_EVENTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch (e) { /* quota — drop silently */ }
  }

  function push(evt) {
    if (!enabled) return;
    var log = loadLog();
    log.push(evt);
    saveLog(log);
  }

  function start() {
    enabled = true;
    sessionStart = Date.now();
    lastSceneLoadTs = 0;
    lastCamSampleTs = 0;
  }

  function stop() { enabled = false; }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    lastSceneLoadTs = 0;
  }

  function logSceneLoad(sceneId) {
    var now = Date.now();
    var prevDwell = lastSceneLoadTs ? (now - lastSceneLoadTs) : 0;
    lastSceneLoadTs = now;
    push({ ts: now, type: 'scene_load', sceneId: sceneId, prevDwell: prevDwell });
  }

  function logHotspotClick(sceneId, hsIdx, target) {
    push({ ts: Date.now(), type: 'hotspot', sceneId: sceneId, hsIdx: hsIdx, target: target });
  }

  function sampleCamera(sceneId, yaw, pitch) {
    var now = Date.now();
    if (now - lastCamSampleTs < CAM_THROTTLE_MS) return;
    lastCamSampleTs = now;
    push({ ts: now, type: 'cam', sceneId: sceneId, yaw: yaw, pitch: pitch });
  }

  function getStats() {
    var log = loadLog();
    var byScene = {};
    var lastTs = 0, lastId = null;
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.type !== 'scene_load') continue;
      if (lastId && lastTs) {
        byScene[lastId] = byScene[lastId] || { id: lastId, visits: 0, totalDwell: 0 };
        byScene[lastId].totalDwell += (e.ts - lastTs);
      }
      byScene[e.sceneId] = byScene[e.sceneId] || { id: e.sceneId, visits: 0, totalDwell: 0 };
      byScene[e.sceneId].visits += 1;
      lastId = e.sceneId;
      lastTs = e.ts;
    }
    var arr = Object.keys(byScene).map(function (k) { return byScene[k]; });
    arr.sort(function (a, b) { return b.visits - a.visits; });
    return {
      totalEvents: log.length,
      topScenes: arr.slice(0, 5),
      totalSessionMs: Date.now() - sessionStart
    };
  }

  function csvEscape(v) {
    if (v == null) return '';
    var s = String(v);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportCSV() {
    var log = loadLog();
    var rows = ['timestamp,sceneId,event,details'];
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      var details = '';
      if (e.type === 'scene_load') details = 'prevDwell=' + (e.prevDwell || 0) + 'ms';
      else if (e.type === 'hotspot') details = 'hsIdx=' + e.hsIdx + ';target=' + (e.target || '');
      else if (e.type === 'cam') details = 'yaw=' + (Math.round((e.yaw || 0) * 10) / 10) + ';pitch=' + (Math.round((e.pitch || 0) * 10) / 10);
      rows.push([
        new Date(e.ts).toISOString(),
        csvEscape(e.sceneId || ''),
        e.type,
        csvEscape(details)
      ].join(','));
    }
    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'trevolution_analytics_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Heatmap colour ramp: blue -> yellow -> red
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    var r, g, b;
    if (t < 0.5) {
      var u = t / 0.5;
      r = Math.round(0 + u * 255);
      g = Math.round(0 + u * 255);
      b = Math.round(255 * (1 - u));
    } else {
      var u2 = (t - 0.5) / 0.5;
      r = 255;
      g = Math.round(255 * (1 - u2));
      b = 0;
    }
    return [r, g, b];
  }

  function renderHeatmap(canvas, sceneId) {
    if (!canvas) return;
    var W = 200, H = 100;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    var log = loadLog();
    var samples = [];
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.type === 'cam' && e.sceneId === sceneId) samples.push(e);
    }
    if (!samples.length) {
      ctx.fillStyle = '#888';
      ctx.font = '10px system-ui,sans-serif';
      ctx.fillText('No camera samples for this scene', 10, 50);
      return;
    }

    // Accumulate Gaussian blobs into a float intensity buffer
    var intensity = new Float32Array(W * H);
    var radius = 8;
    var sigma2 = (radius / 2) * (radius / 2);

    for (var s = 0; s < samples.length; s++) {
      var ev = samples[s];
      // yaw in degrees [-180,180]-ish, map to x [0..W); pitch [-85..85] map to y
      var yawNorm = ((ev.yaw % 360) + 360) % 360; // 0..360
      var x = Math.round((yawNorm / 360) * W);
      var pitch = Math.max(-90, Math.min(90, ev.pitch));
      var y = Math.round(((90 - pitch) / 180) * H);
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          var px = x + dx;
          var py = y + dy;
          if (px < 0 || px >= W || py < 0 || py >= H) continue;
          var d2 = dx * dx + dy * dy;
          if (d2 > radius * radius) continue;
          var w = Math.exp(-d2 / (2 * sigma2)) * 0.15;
          intensity[py * W + px] += w;
        }
      }
    }

    // Normalize and paint
    var max = 0;
    for (var k = 0; k < intensity.length; k++) if (intensity[k] > max) max = intensity[k];
    if (max <= 0) max = 1;

    var img = ctx.getImageData(0, 0, W, H);
    var data = img.data;
    for (var p = 0; p < intensity.length; p++) {
      var t = intensity[p] / max;
      if (t <= 0.001) continue;
      var c = ramp(t);
      var off = p * 4;
      // additive over dark bg
      data[off]     = Math.min(255, data[off]     + c[0]);
      data[off + 1] = Math.min(255, data[off + 1] + c[1]);
      data[off + 2] = Math.min(255, data[off + 2] + c[2]);
      data[off + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  global.TrevolutionAnalytics = {
    start: start,
    stop: stop,
    clear: clear,
    logSceneLoad: logSceneLoad,
    logHotspotClick: logHotspotClick,
    sampleCamera: sampleCamera,
    getStats: getStats,
    exportCSV: exportCSV,
    renderHeatmap: renderHeatmap
  };
})(window);
