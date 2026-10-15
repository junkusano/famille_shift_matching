/* Scoped first-party recruitment measurement. Never read form values. */
(function () {
  if (window.__recruitmentTracking) { window.__recruitmentTracking(); return; }
  var endpoint = 'https://myfamille.shi-on.net/api/recruitment-events';
  var key = 'recruitment-journey-v1', context, seen = new Set(), expires = 0;
  function page() {
    if (location.hostname === 'myfamille.shi-on.net') return location.pathname === '/' ? 'myfamille_lp' : /^\/entry\/?$/.test(location.pathname) ? 'entry' : null;
    return /^(www\.)?shi-on\.net$/.test(location.hostname) && /^\/recruiting\/?$/.test(location.pathname) ? 'recruiting_lp' : null;
  }
  function init() {
    var p = page(); if (!p) return false;
    var incoming = location.hash.match(/^#rj=([0-9a-f-]{36})$/i);
    if (context && Date.now() < expires && !incoming) return true;
    seen.clear();
    try { var old = JSON.parse(sessionStorage.getItem(key)); if (!incoming && old && old.expires > Date.now()) { context = old.context; expires = old.expires; return true; } } catch (_) {}
    var ref; try { ref = new URL(document.referrer); } catch (_) {}
    var source = p === 'entry' ? (ref && /^(www\.)?shi-on\.net$/.test(ref.hostname) ? 'shi_on_content' : 'direct_unknown') : p;
    var query = new URLSearchParams(location.search).get('recruitment_source');
    if (p === 'entry' && ['myfamille_lp','recruiting_lp'].includes(query)) source = query;
    var id = incoming && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming[1]) ? incoming[1] : crypto.randomUUID();
    if (incoming) history.replaceState(history.state, '', location.pathname + location.search);
    context = { journeyId: id, source: source }; expires = Date.now() + 30 * 60 * 1000;
    try { sessionStorage.setItem(key, JSON.stringify({ context: context, expires: expires })); } catch (_) {}
    return true;
  }
  function send(event, placement) {
    try {
      if (!init()) return;
      var p = page(), tag = [event, p, placement || 'body'].join(':'); if (seen.has(tag)) return; seen.add(tag);
      var body = JSON.stringify({ journeyId: context.journeyId, source: context.source, event: event, page: p, placement: placement || 'body' });
      fetch(endpoint, { method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: body }).catch(function () { seen.delete(tag); });
    } catch (_) { /* Tracking must never prevent an application. */ }
  }
  window.__recruitmentTracking = function () { send('page_view'); };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a || !page()) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.hostname !== 'myfamille.shi-on.net' || !/^\/entry\/?$/.test(u.pathname)) return;
      send('cta_click', ['top','bottom'].includes(a.dataset.recruitmentPlacement) ? a.dataset.recruitmentPlacement : 'body');
      if (context) { u.searchParams.set('recruitment_source', context.source); u.hash = 'rj=' + context.journeyId; a.href = u.href; }
    } catch (_) {}
  }, true);
  window.addEventListener('recruitment:event', function (e) {
    if (['form_start','validation_error','submit_attempt','submit_error'].includes(e.detail)) send(e.detail);
  });
  send('page_view');
})();
