// Sketchfab Data API v3 client for Trevolution 360 VT.
//
// SECURITY NOTE: The Sketchfab API token must NEVER be embedded in source.
// It is stored only in the browser's localStorage under 'SKETCHFAB_TOKEN',
// set by the user via the admin UI. Public model search does NOT require
// auth — the token is only used for the download endpoint.

(function (global) {
  const TOKEN_KEY = 'SKETCHFAB_TOKEN';
  const SEARCH_URL = 'https://api.sketchfab.com/v3/search';
  const MODEL_URL  = 'https://api.sketchfab.com/v3/models';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; }
    catch { return ''; }
  }
  function setToken(tok) {
    try {
      if (tok) localStorage.setItem(TOKEN_KEY, tok);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }
  function hasToken() { return !!getToken(); }

  // Public search — no auth required.
  async function search(query, options = {}) {
    const params = new URLSearchParams({
      type: 'models',
      downloadable: 'true',
      q: query || '',
      count: String(options.count || 12),
    });
    const url = `${SEARCH_URL}?${params.toString()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed: ' + res.status);
      const data = await res.json();
      return (data.results || []).slice(0, 12).map(r => ({
        uid: r.uid,
        name: r.name,
        thumbnail: (r.thumbnails && r.thumbnails.images && r.thumbnails.images.length)
          ? r.thumbnails.images.sort((a, b) => a.size - b.size).find(im => im.width >= 200) || r.thumbnails.images[0]
          : null,
        author: r.user && r.user.username,
        viewerUrl: r.viewerUrl,
      }));
    } catch (e) {
      console.error('Sketchfab.search error', e);
      return [];
    }
  }

  // Returns { gltfUrl } or null on failure / missing token.
  async function download(modelUid, token) {
    const tok = token || getToken();
    if (!tok) {
      if (global.toast) global.toast('Sketchfab token not configured');
      return null;
    }
    try {
      const res = await fetch(`${MODEL_URL}/${modelUid}/download`, {
        headers: { Authorization: `Token ${tok}` },
      });
      if (!res.ok) {
        if (global.toast) global.toast('Sketchfab download failed: ' + res.status);
        return null;
      }
      const data = await res.json();
      const url = (data.gltf && data.gltf.url) || (data.glb && data.glb.url);
      return url ? { gltfUrl: url, raw: data } : null;
    } catch (e) {
      console.error('Sketchfab.download error', e);
      return null;
    }
  }

  global.Sketchfab = { search, download, getToken, setToken, hasToken };
})(window);
