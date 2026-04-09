/* Trevolution 360 VT — WebXR module (Wave D)
 * Vanilla browser script. Exposes window.TrevolutionXR.
 * Adds VR enter button + dual XR controllers with line pointers.
 * On controller select, fires the nearest hotspot's onClick (within ~10°).
 */
(function (global) {
  'use strict';

  var state = {
    renderer: null,
    scene: null,
    camera: null,
    controllers: [],
    pointerLines: [],
    hotspotProvider: null,
    available: false,
    vrButton: null
  };

  // Minimal inline VRButton fallback (used if CDN VRButton not present).
  function createInlineVRButton(renderer) {
    var btn = document.createElement('button');
    btn.style.cssText =
      'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);' +
      'padding:12px 18px;border:1px solid #fff;background:rgba(0,0,0,0.6);' +
      'color:#fff;font:13px sans-serif;border-radius:4px;cursor:pointer;' +
      'z-index:999;display:none;';
    btn.textContent = 'ENTER VR';
    var currentSession = null;

    function onSessionStarted(session) {
      session.addEventListener('end', onSessionEnded);
      renderer.xr.setSession(session).then(function () {
        btn.textContent = 'EXIT VR';
        currentSession = session;
      });
    }
    function onSessionEnded() {
      if (currentSession) currentSession.removeEventListener('end', onSessionEnded);
      btn.textContent = 'ENTER VR';
      currentSession = null;
    }
    btn.addEventListener('click', function () {
      if (!navigator.xr) return;
      if (currentSession === null) {
        var opts = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
        navigator.xr.requestSession('immersive-vr', opts).then(onSessionStarted).catch(function (e) {
          console.warn('[TrevolutionXR] requestSession failed:', e);
        });
      } else {
        currentSession.end();
      }
    });

    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
        btn.style.display = ok ? 'block' : 'none';
      }).catch(function () { btn.style.display = 'none'; });
    }
    return btn;
  }

  function makePointerLine() {
    var geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5)
    ]);
    var mat = new THREE.LineBasicMaterial({ color: 0xffd400 });
    var line = new THREE.Line(geom, mat);
    line.name = 'xr-pointer';
    line.scale.z = 5;
    return line;
  }

  function angularDistance(yaw1, pitch1, yaw2, pitch2) {
    // Spherical angle between two (yaw, pitch) directions in radians.
    var s = Math.sin(pitch1) * Math.sin(pitch2) +
            Math.cos(pitch1) * Math.cos(pitch2) * Math.cos(yaw1 - yaw2);
    if (s > 1) s = 1; if (s < -1) s = -1;
    return Math.acos(s);
  }

  function dirToYawPitch(dir) {
    // dir is a normalized THREE.Vector3 in world space.
    // Match index.html convention where pitch = lat, yaw = lon (radians).
    var pitch = Math.asin(dir.y);
    var yaw = Math.atan2(dir.z, dir.x);
    return { yaw: yaw, pitch: pitch };
  }

  function getControllerWorldDir(controller) {
    var dir = new THREE.Vector3(0, 0, -1);
    var q = new THREE.Quaternion();
    controller.getWorldQuaternion(q);
    dir.applyQuaternion(q).normalize();
    return dir;
  }

  function findNearestHotspot(controller) {
    if (!state.hotspotProvider) return null;
    var list = state.hotspotProvider() || [];
    if (!list.length) return null;
    var dir = getControllerWorldDir(controller);
    var yp = dirToYawPitch(dir);
    var best = null;
    var bestAng = Infinity;
    var threshold = 10 * Math.PI / 180; // ~10°
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (typeof h.yawRad !== 'number' || typeof h.pitchRad !== 'number') continue;
      var ang = angularDistance(yp.yaw, yp.pitch, h.yawRad, h.pitchRad);
      if (ang < bestAng) { bestAng = ang; best = h; }
    }
    if (best && bestAng <= threshold) return best;
    return null;
  }

  function highlightHotspot(h) {
    if (!h || !h.el) return;
    if (h.el.dataset && h.el.dataset.xrHighlighted === '1') return;
    if (h.el.dataset) h.el.dataset.xrHighlighted = '1';
    var prev = h.el.style.boxShadow;
    h.el.dataset._xrPrevShadow = prev || '';
    h.el.style.boxShadow = '0 0 0 4px rgba(255,212,0,0.9)';
  }
  function clearHotspotHighlights() {
    if (!state.hotspotProvider) return;
    var list = state.hotspotProvider() || [];
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h && h.el && h.el.dataset && h.el.dataset.xrHighlighted === '1') {
        h.el.style.boxShadow = h.el.dataset._xrPrevShadow || '';
        delete h.el.dataset.xrHighlighted;
        delete h.el.dataset._xrPrevShadow;
      }
    }
  }

  function onSelectStart(ev) {
    var controller = ev.target;
    var h = findNearestHotspot(controller);
    if (h && typeof h.onClick === 'function') {
      try { h.onClick(); } catch (e) { console.warn('[TrevolutionXR] hotspot onClick error', e); }
    }
  }

  function onXRFrame() {
    // Called from renderer.setAnimationLoop via host animate()
    if (!state.renderer || !state.renderer.xr || !state.renderer.xr.isPresenting) return;
    clearHotspotHighlights();
    for (var i = 0; i < state.controllers.length; i++) {
      var h = findNearestHotspot(state.controllers[i]);
      if (h) highlightHotspot(h);
    }
  }

  function init(renderer, scene, camera) {
    if (!renderer || !scene || !camera) return { available: false, reason: 'missing args' };
    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;

    if (typeof navigator === 'undefined' || !navigator.xr) {
      state.available = false;
      return { available: false, reason: 'no navigator.xr' };
    }

    renderer.xr.enabled = true;
    state.available = true;

    // VRButton: prefer three.js's VRButton if loaded; else inline fallback.
    try {
      if (typeof THREE !== 'undefined' && THREE.VRButton && typeof THREE.VRButton.createButton === 'function') {
        state.vrButton = THREE.VRButton.createButton(renderer);
        document.body.appendChild(state.vrButton);
      } else if (typeof VRButton !== 'undefined' && typeof VRButton.createButton === 'function') {
        state.vrButton = VRButton.createButton(renderer);
        document.body.appendChild(state.vrButton);
      } else {
        state.vrButton = createInlineVRButton(renderer);
        document.body.appendChild(state.vrButton);
      }
    } catch (e) {
      console.warn('[TrevolutionXR] VRButton creation failed, using inline:', e);
      state.vrButton = createInlineVRButton(renderer);
      document.body.appendChild(state.vrButton);
    }

    // Two XR controllers with line pointers.
    for (var i = 0; i < 2; i++) {
      var controller = renderer.xr.getController(i);
      controller.addEventListener('selectstart', onSelectStart);
      var line = makePointerLine();
      controller.add(line);
      scene.add(controller);
      state.controllers.push(controller);
      state.pointerLines.push(line);
    }

    // Hook into rAF on window so onXRFrame fires even if host animate() doesn't call us.
    function tick() {
      try { onXRFrame(); } catch (e) { /* swallow */ }
      if (state.renderer && state.renderer.xr && state.renderer.xr.isPresenting) {
        state.renderer.xr.getSession().requestAnimationFrame(tick);
      } else {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);

    return { available: true };
  }

  function setHotspotProvider(fn) {
    if (typeof fn === 'function') state.hotspotProvider = fn;
  }

  function getVRButton() { return state.vrButton; }
  function isAvailable() { return state.available; }

  global.TrevolutionXR = {
    init: init,
    setHotspotProvider: setHotspotProvider,
    getVRButton: getVRButton,
    isAvailable: isAvailable
  };
})(typeof window !== 'undefined' ? window : this);
