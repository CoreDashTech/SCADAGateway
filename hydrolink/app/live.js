/* CoreDash HydroLink — live data source (Edge Gateway REST API)
 * Used when the mode bar is set to "ทำงานจริง". Polls GET /api/v1/latest every 2 s and maps the
 * values into the same state the screens read (mapping: points.js). Commands go to POST /api/v1/control.
 */
(function (g) {
  'use strict';
  var S = SIM.state;
  function ls(k, d) { try { var v = localStorage.getItem('cdhl.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('cdhl.' + k, JSON.stringify(v)); } catch (e) { } }
  var cfg = ls('liveCfg', { url: '', key: '' }), connected = false, lastErr = '', busy = false, lastOk = 0;
  // the point names and their mapping to the screens live in points.js (shared with the JSON test files)
  var PTS = POINTS.list;
  function base() { return (cfg.url || '').replace(/\/+$/, ''); }
  function poll() {
    if (S.src !== 'live') return;
    if (!base()) { connected = false; lastErr = 'not-configured'; SIM._emit('tick', S); return; }
    if (busy) return; busy = true;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    fetch(base() + '/api/v1/latest?points=' + encodeURIComponent(PTS.join(',')), { headers: { 'X-API-Key': cfg.key }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { POINTS.applyList(j.data || []); connected = true; lastErr = ''; lastOk = Date.now(); S.lastUpdate = lastOk; })
      .catch(function (e) { connected = false; lastErr = String(e && e.message || e); })
      .then(function () { clearTimeout(to); busy = false; SIM._emit('tick', S); });
  }
  setInterval(poll, 2000);
  g.LIVE = {
    connected: function () { return connected; },
    error: function () { return lastErr; },
    cfg: function () { return { url: cfg.url, key: cfg.key }; },
    setCfg: function (c) { cfg = { url: (c.url || '').trim(), key: (c.key || '').trim() }; lsSet('liveCfg', cfg); connected = false; poll(); },
    test: function (c) {
      var u = (c.url || '').replace(/\/+$/, '');
      return fetch(u + '/api/v1/meta/last-update', { headers: { 'X-API-Key': c.key } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    send: function (cmd, args) {
      if (!connected) return false;
      fetch(base() + '/api/v1/control', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.key }, body: JSON.stringify({ command: cmd, args: args }) })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); })
        .catch(function (e) { if (g.APP) g.APP.toast('ส่งคำสั่งไม่สำเร็จ', String(e.message || e), 'warning'); });
      return true;
    },
    poll: poll
  };
})(window);
