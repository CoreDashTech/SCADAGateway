/* CoreDash HydroLink — Thai / English
 * The UI is authored in Thai. In English mode every Thai text node and label attribute is
 * translated as it appears (exact entries first, then phrase rules for live/dynamic text).
 * Shared by the web app and the landing page.
 */
(function (g) {
  'use strict';
  var TH = /[฀-๿]/;
  function ls(k, d) { try { var v = localStorage.getItem('cdhl.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('cdhl.' + k, JSON.stringify(v)); } catch (e) { } }
  var lang = ls('lang', 'th');
  var DICT = g.I18N_DICT || {};
  var PH = (g.I18N_PHRASES || []).slice().sort(function (a, b) { return b[0].length - a[0].length; });
  var orig = new WeakMap();
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  function tr(s) {
    if (lang !== 'en' || !s || !TH.test(s)) return s;
    var t = s.trim();
    if (DICT[t] !== undefined) return s.replace(t, DICT[t]);
    var out = s;
    for (var i = 0; i < PH.length && TH.test(out); i++) if (out.indexOf(PH[i][0]) >= 0) out = out.split(PH[i][0]).join(PH[i][1]);
    return out;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !TH.test(v)) return;
    var p = n.parentNode; if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE')) return;
    var t = tr(v);
    if (t !== v) { orig.set(n, v); n.nodeValue = t; }
  }
  function doEl(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute && el.getAttribute(ATTRS[i]);
      if (a && TH.test(a)) { var t = tr(a); if (t === a) continue; var key = 'data-th-' + ATTRS[i]; if (!el.hasAttribute(key)) el.setAttribute(key, a); el.setAttribute(ATTRS[i], t); }   // write only on change: an untranslated label must not re-trigger the observer
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  function restore(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); } }
      else ATTRS.forEach(function (a) { var k = 'data-th-' + a; if (n.hasAttribute(k)) { n.setAttribute(a, n.getAttribute(k)); n.removeAttribute(k); } });
    }
  }
  var obs = new MutationObserver(function (ms) {
    if (lang !== 'en') return;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doEl(m.target);
      else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
    }
  });
  function marks() {
    document.documentElement.lang = lang;
    var t = document.title; if (lang === 'en' && TH.test(t)) { document.documentElement.setAttribute('data-th-title', t); document.title = tr(t); }
    Array.prototype.forEach.call(document.querySelectorAll('[data-langlabel]'), function (e) { e.textContent = lang === 'en' ? 'TH' : 'EN'; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-login-lang],[data-lang-btn]'), function (b) { var on = (b.getAttribute('data-login-lang') || b.getAttribute('data-lang-btn')) === lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  function set(l) {
    if (l === lang) return;
    lang = l; lsSet('lang', l);
    if (l === 'en') walk(document.body); else { restore(document.body); var tt = document.documentElement.getAttribute('data-th-title'); if (tt) document.title = tt; }
    marks();
    if (g.APP && g.APP.session && g.APP.session()) { g.APP.buildNav(); g.APP.route(); }
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }
  document.addEventListener('DOMContentLoaded', function () {
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (lang === 'en') walk(document.body);
    marks();
    var tObs = new MutationObserver(function () { if (lang === 'en' && TH.test(document.title)) document.title = tr(document.title); });
    var te = document.querySelector('title'); if (te) tObs.observe(te, { childList: true, characterData: true, subtree: true });
  });
  g.I18N = { tr: tr, set: set, lang: function () { return lang; }, walk: walk };
})(window);
