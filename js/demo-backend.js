/* ============================================================
   DEMO-BACKEND — nur für die Showcase-Version
   ------------------------------------------------------------
   Fängt alle Aufrufe an window.EICHENHOF_API ab und beantwortet
   sie aus dem localStorage. So sind Shop, Partyservice und beide
   Portale ohne Server voll durchklickbar.
   Beim echten Kundenprojekt: diese Datei NICHT einbinden und in
   js/api-config.js die Worker-URL eintragen.
   ============================================================ */
(function () {
  if (!window.DEMO_MODE) return;

  // Portale ohne PIN-Abfrage öffnen — im Demo prüft niemand den Token
  try {
    ['eichenhof_portal_token','eichenhof_party_token'].forEach(function (k) {
      if (!localStorage.getItem(k)) localStorage.setItem(k, 'demo');
    });
  } catch (e) {}

  var KEY = 'eichenhof_demo_v1';
  var CFG = { MAX_ORDERS_PER_DAY: 10, PICKUP_LEAD_DAYS: 2, RUHETAGE: [0, 1],
              PARTY_GRILL: 2, PARTY_NORMAL: 1, PARTY_LEAD_DAYS: 14 };

  function db() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { orders: [], party: [], nO: 0, nP: 0 }; }
    catch (e) { return { orders: [], party: [], nO: 0, nP: 0 }; }
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function nr(p, n) { return p + '-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0'); }
  function satOf(isoStr) {                       // Fr/Sa/So → Samstag des Wochenendes
    var d = new Date(isoStr + 'T00:00:00'), w = d.getDay();
    if (w === 5) d.setDate(d.getDate() + 1);
    if (w === 0) d.setDate(d.getDate() - 1);
    return iso(d);
  }
  function wkLoad(d, sat) {
    var g = 0, n = 0;
    d.party.forEach(function (r) {
      if (r.status === 'bestätigt' && r.satISO === sat) { if (r.kind === 'grill') g++; else n++; }
    });
    var free = Math.max(0, CFG.PARTY_GRILL - g) + Math.max(0, CFG.PARTY_NORMAL - n);
    return { grill: g, normal: n, free: free, full: free <= 0 };
  }

  /* Beim allerersten Aufruf ein paar Beispiel-Bestellungen anlegen,
     damit das Theken-Portal nicht leer wirkt. */
  function seed() {
    var d = db();
    if (d.orders.length || d.party.length) return d;
    var t = new Date(); t.setDate(t.getDate() + CFG.PICKUP_LEAD_DAYS);
    while (CFG.RUHETAGE.indexOf(t.getDay()) > -1) t.setDate(t.getDate() + 1);
    var day = iso(t);
    [['Familie Krause', '0170 1234567', [['2×', 'Glutwurst (500 g)'], ['1×', 'Nackensteak mariniert']], '21,70 €'],
     ['Bäckerei Sommer', '0151 9876543', [['5×', 'Bratwurst Klassisch (500 g)']], '29,50 €'],
     ['Herr Lindner', '0375 555123', [['1×', 'Hausmacher Sülze'], ['2×', 'Fleischwurst am Stück']], '18,40 €']
    ].forEach(function (o, i) {
      d.nO++;
      d.orders.push({ id: nr('B', d.nO), name: o[0], telefon: o[1], adresse: '', deliveryMode: 'Abholung',
        datum: day, pickISO: day, items: o[2].map(function (x) { return { qty: x[0], name: x[1] }; }),
        sum: o[3], notiz: i === 0 ? 'Bitte vakuumieren' : '', created: new Date().toISOString(),
        pack: i === 2, done: false, source: 'demo' });
    });
    save(d); return d;
  }

  function dayCount(d, isoStr) {
    return d.orders.filter(function (o) { return o.pickISO === isoStr; }).length;
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var base = window.EICHENHOF_API || '';
    if (!base || url.indexOf(base) !== 0) return origFetch(input, init);

    var path = url.slice(base.length).split('?')[0].replace(/\/+$/, '') || '/';
    var query = (url.split('?')[1] || '');
    var opts = init || {};
    var body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) {}
    var d = seed();

    function reply(data, status) {
      return Promise.resolve(new Response(JSON.stringify(data),
        { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
    }

    /* ---------- Shop ---------- */
    if (path === '/slots') {
      var date = (query.match(/date=([\d-]+)/) || [])[1] || '';
      if (!date) return reply({ error: 'date fehlt' }, 400);
      var dow = new Date(date + 'T00:00:00').getDay();
      if (CFG.RUHETAGE.indexOf(dow) > -1) return reply({ geschlossen: true, frei: 0, max: CFG.MAX_ORDERS_PER_DAY });
      var belegt = dayCount(d, date);
      return reply({ geschlossen: false, belegt: belegt, frei: Math.max(0, CFG.MAX_ORDERS_PER_DAY - belegt), max: CFG.MAX_ORDERS_PER_DAY });
    }
    if (path === '/order' && (opts.method || '').toUpperCase() === 'POST') {
      if (body.website) return reply({ ok: true, id: 'B-IGNORED' });
      if (!body.name || !body.telefon || !(body.items || []).length)
        return reply({ error: 'Name, Telefon und Artikel sind Pflicht.' }, 400);
      if (body.deliveryMode === 'Abholung' && body.datum && dayCount(d, body.datum) >= CFG.MAX_ORDERS_PER_DAY)
        return reply({ error: 'Dieser Tag ist ausgebucht. Bitte anderen Termin wählen.' }, 409);
      d.nO++;
      var o = { id: nr('B', d.nO), name: body.name, telefon: body.telefon, adresse: body.adresse || '',
        deliveryMode: body.deliveryMode, datum: body.datum || '', pickISO: body.deliveryMode === 'Abholung' ? (body.datum || '') : '',
        items: body.items, sum: body.sum || 'auf Anfrage', notiz: body.notiz || '',
        created: new Date().toISOString(), pack: false, done: false };
      d.orders.push(o); save(d);
      return reply({ ok: true, id: o.id, frei: o.pickISO ? Math.max(0, CFG.MAX_ORDERS_PER_DAY - dayCount(d, o.pickISO)) : null, mailed: false });
    }
    if (path === '/order/manual') {
      d.nO++;
      var items = String(body.text || '').split('\n').filter(Boolean).map(function (line) {
        var m = line.match(/^\s*(\d+\s*[xX×]?)\s*(.+)$/);
        return m && m[2] ? { qty: m[1].replace(/[xX]/, '×'), name: m[2] } : { qty: '•', name: line };
      });
      var mo = { id: nr('B', d.nO), name: body.name, telefon: body.telefon || '', adresse: '',
        deliveryMode: 'Abholung', datum: body.datum || '', pickISO: body.datum || '', items: items,
        sum: body.sum || 'auf Anfrage', notiz: body.notiz || '', created: new Date().toISOString(),
        pack: false, done: false, source: 'manuell' };
      d.orders.push(mo); save(d);
      return reply({ ok: true, id: mo.id });
    }
    if (path === '/orders') {
      var list = d.orders.slice().sort(function (a, b) { return b.created.localeCompare(a.created); });
      return reply({ ok: true, orders: list });
    }
    var ms = path.match(/^\/order\/(.+)\/status$/);
    if (ms) {
      var ord = d.orders.filter(function (x) { return x.id === decodeURIComponent(ms[1]); })[0];
      if (!ord) return reply({ error: 'Bestellung nicht gefunden' }, 404);
      if ('pack' in body) ord.pack = !!body.pack;
      if ('done' in body) ord.done = !!body.done;
      save(d); return reply({ ok: true, order: ord });
    }

    /* ---------- Partyservice ---------- */
    if (path === '/party/availability') {
      var weekends = {}, cur = new Date();
      for (var i = 0; i < 26; i++) {
        var sat = new Date(cur); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7) + i * 7);
        weekends[iso(sat)] = wkLoad(d, iso(sat));
      }
      return reply({ ok: true, weekends: weekends, cap: { grill: CFG.PARTY_GRILL, normal: CFG.PARTY_NORMAL } });
    }
    if (path === '/party/request') {
      if (body.website) return reply({ ok: true, id: 'P-IGNORED' });
      if (!body.name || !body.telefon || !body.personen)
        return reply({ error: 'Name, Telefon und Personenzahl sind Pflicht.' }, 400);
      d.nP++;
      var r = { id: nr('P', d.nP), name: body.name, telefon: body.telefon, email: body.email || '',
        anlass: body.anlass || '', personen: body.personen, paket: body.paket || '', ort: body.ort || '',
        nachricht: body.nachricht || '', kalkulation: body.kalkulation || '', eventISO: body.eventISO || '',
        datumText: body.datumText || '', satISO: body.eventISO ? satOf(body.eventISO) : '',
        status: 'angefragt', kind: '', created: new Date().toISOString() };
      d.party.push(r); save(d);
      return reply({ ok: true, id: r.id, mailed: false });
    }
    if (path === '/party/requests') {
      var reqs = d.party.slice().sort(function (a, b) { return b.created.localeCompare(a.created); })
        .map(function (r) { return Object.assign({}, r, { weekend: r.satISO ? wkLoad(d, r.satISO) : null }); });
      return reply({ ok: true, requests: reqs, cap: { grill: CFG.PARTY_GRILL, normal: CFG.PARTY_NORMAL } });
    }
    var md = path.match(/^\/party\/(.+)\/decision$/);
    if (md) {
      var req = d.party.filter(function (x) { return x.id === decodeURIComponent(md[1]); })[0];
      if (!req) return reply({ error: 'Anfrage nicht gefunden' }, 404);
      var decision = body.decision === 'abgelehnt' ? 'abgelehnt'
                   : body.decision === 'angefragt' ? 'angefragt' : 'bestätigt';
      if (decision === 'bestätigt') {
        var kind = body.kind === 'normal' ? 'normal' : 'grill';
        var others = d.party.filter(function (x) { return x.id !== req.id; });
        var g = 0, n = 0;
        others.forEach(function (x) {
          if (x.status === 'bestätigt' && x.satISO === req.satISO) { if (x.kind === 'grill') g++; else n++; }
        });
        if (kind === 'grill'  && g >= CFG.PARTY_GRILL)  return reply({ error: 'Wochenende voll: bereits ' + g + ' Grill-Events bestätigt.' }, 409);
        if (kind === 'normal' && n >= CFG.PARTY_NORMAL) return reply({ error: 'Wochenende voll: bereits ' + n + ' normales Buffet bestätigt.' }, 409);
        req.status = 'bestätigt'; req.kind = kind;
      } else { req.status = decision; req.kind = ''; }
      save(d); return reply({ ok: true, request: req });
    }

    return reply({ error: 'Unbekannter Endpunkt (Demo)' }, 404);
  };
})();
