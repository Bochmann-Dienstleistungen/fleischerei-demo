/**
 * Der Fleischerei — Bestell-Backend (Cloudflare Worker)
 *
 * Ersetzt die Mock-Logik in shop.html (Kontingent + Bestellung) und
 * portal.html (Theken-Board). Speichert Bestellungen persistent in KV,
 * benachrichtigt Inhaber per E-Mail (Resend) und liefert dem Theken-Portal
 * die echten Bestellungen (Token-geschützt).
 *
 * Endpunkte:
 *   GET  /slots?date=YYYY-MM-DD          → freie Abhol-Kontingente an dem Tag  (öffentlich)
 *   POST /order                          → Bestellung anlegen                  (öffentlich)
 *   GET  /orders                         → Bestellungen fürs Portal            (Bearer PORTAL_TOKEN)
 *   POST /order/:id/status               → Status (pack/done) setzen           (Bearer PORTAL_TOKEN)
 *
 * Hausmuster wie richter-automation: KV, CORS, Resend-Mail, Rate-Limit, XSS-Escaping.
 */

// ── KONFIG (Spiegel von SHOPCFG in shop.html) ────────────────────────────────
const CFG = {
  MAX_ORDERS_PER_DAY: 10,   // Tageskontingent Abhol-Bestellungen
  PICKUP_LEAD_DAYS:    2,   // Vorlauf bis frühester Abholtermin
  RUHETAGE: [0, 1],         // 0 = Sonntag (zu), 1 = Montag (Ruhetag)
  RL_MAX:             15,    // max. Bestellungen pro IP/Stunde (schützt vor Abuse; verschiedene Kunden = verschiedene IPs)
  RL_WINDOW:        3600,
  // Partyservice (Wochenend-Kapazität Fr–So, geteilt pro Wochenende)
  PARTY_GRILL:         2,    // max. Grill-Events pro Wochenende
  PARTY_NORMAL:        1,    // max. normale Buffets pro Wochenende
  PARTY_LEAD_DAYS:    14,    // Vorlauf in Tagen bis frühester Event-Termin
};

const ALLOWED_ORIGINS = [
  'https://bochmann-dienstleistungen.github.io',
  'https://musterbetrieb.de',
  'https://www.musterbetrieb.de',
  'http://localhost',
  'http://127.0.0.1',
  'file://',
];

// ── HELPERS ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cors(origin) {
  const ok = ALLOWED_ORIGINS.some(o => (origin || '').startsWith(o));
  return {
    'Access-Control-Allow-Origin':  ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

// Berlin-lokales Datum als YYYY-MM-DD
function todayISO() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  return now.toISOString().slice(0, 10);
}

function isRuhetag(iso) {
  const d = new Date(iso + 'T12:00:00');
  return CFG.RUHETAGE.includes(d.getDay());
}

function validPickupDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const min = new Date(todayISO() + 'T00:00:00');
  min.setDate(min.getDate() + CFG.PICKUP_LEAD_DAYS);
  const d = new Date(iso + 'T00:00:00');
  return d >= min && !isRuhetag(iso);
}

// Zähler für lesbare Bestellnummern: B-2026-0001
async function nextOrderNr(env) {
  const year = todayISO().slice(0, 4);
  const key  = `counter:${year}`;
  const n    = parseInt(await env.SHOP_KV.get(key).catch(() => null) || '0', 10) + 1;
  await env.SHOP_KV.put(key, String(n)).catch(() => {});
  return `B-${year}-${String(n).padStart(4, '0')}`;
}

async function dayCount(env, iso) {
  return parseInt(await env.SHOP_KV.get(`daycount:${iso}`).catch(() => null) || '0', 10);
}

// ── PARTYSERVICE-HELFER ─────────────────────────────────────────────────────
// Samstag des zugehörigen Wochenendes (Fr/Sa/So teilen sich die Kapazität)
function satOfWeekend(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();            // 0 So, 5 Fr, 6 Sa
  if (dow === 5) d.setDate(d.getDate() + 1);
  else if (dow === 0) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function isWeekendISO(iso) {
  const dow = new Date(iso + 'T12:00:00').getDay();
  return dow === 5 || dow === 6 || dow === 0;
}
function validPartyDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const min = new Date(todayISO() + 'T00:00:00');
  min.setDate(min.getDate() + CFG.PARTY_LEAD_DAYS);
  const d = new Date(iso + 'T00:00:00');
  return d >= min && isWeekendISO(iso);
}
async function nextPartyNr(env) {
  const year = todayISO().slice(0, 4);
  const key  = `pcounter:${year}`;
  const n    = parseInt(await env.SHOP_KV.get(key).catch(() => null) || '0', 10) + 1;
  await env.SHOP_KV.put(key, String(n)).catch(() => {});
  return `P-${year}-${String(n).padStart(4, '0')}`;
}
// Alle Anfragen laden (für Portal + Kapazitätsrechnung)
async function allPartyRequests(env) {
  const list = await env.SHOP_KV.list({ prefix: 'party:', limit: 500 });
  const reqs = (await Promise.all(
    list.keys.map(k => env.SHOP_KV.get(k.name).then(v => v ? JSON.parse(v) : null))
  )).filter(Boolean);
  reqs.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return reqs;
}
// Bestätigte Belegung je Wochenende { satISO: {grill, normal} }
function confirmedByWeekend(reqs) {
  const map = {};
  for (const r of reqs) {
    if (r.status !== 'bestätigt' || !r.satISO) continue;
    const w = map[r.satISO] || (map[r.satISO] = { grill: 0, normal: 0 });
    if (r.kind === 'normal') w.normal++; else w.grill++;
  }
  return map;
}
function weekendFree(w) {
  const g = w ? w.grill : 0, n = w ? w.normal : 0;
  const free = Math.max(0, CFG.PARTY_GRILL - g) + Math.max(0, CFG.PARTY_NORMAL - n);
  return { grill: g, normal: n, free, full: free <= 0 };
}

// ── E-MAIL an Inhaber: Partyservice-Anfrage ────────────────────────────────────
async function mailPartyRequest(env, r) {
  if (!env.RESEND_API_KEY) return { ok: false, skipped: true };
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;">
      <h2 style="color:#A81820;margin:0 0 4px;">Neue Partyservice-Anfrage — ${escHtml(r.id)}</h2>
      <p style="margin:0 0 14px;color:#555;">${escHtml(r.anlass || 'Event')} · <b>${escHtml(r.datumText || r.eventISO)}</b> · ${escHtml(String(r.personen))} Personen</p>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:3px 12px 3px 0;color:#888;">Paket</td><td>${escHtml(r.paket || '—')}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#888;">Ort</td><td>${escHtml(r.ort || '—')}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#888;">Schätzung</td><td>${escHtml(r.kalkulation || '—')}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #eee;margin:14px 0;">
      <p style="margin:0;"><b>${escHtml(r.name)}</b><br>${escHtml(r.telefon)}${r.email ? '<br>' + escHtml(r.email) : ''}</p>
      ${r.nachricht ? `<p style="margin:10px 0 0;background:#faf6ef;padding:8px 11px;border-radius:8px;">📝 ${escHtml(r.nachricht)}</p>` : ''}
      <p style="margin:16px 0 0;font-size:12px;color:#999;">Im Partyservice-Portal bestätigen oder ablehnen.</p>
    </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${env.SHOP_NAME || 'Der Fleischerei'} <${env.MAIL_FROM || 'bestellung@musterbetrieb.de'}>`,
        to: [env.INHABER_EMAIL || 'info@musterbetrieb.de'],
        ...(env.COPY_EMAIL ? { bcc: [env.COPY_EMAIL] } : {}),   // stille Kopie an Frederic
        subject: `Partyservice-Anfrage ${r.id} — ${r.name} (${r.datumText || r.eventISO})`,
        html,
      }),
    });
    return { ok: res.ok };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── E-MAIL an Inhaber (Resend, wie im Richter-Worker) ──────────────────────────
async function mailInhaber(env, order) {
  if (!env.RESEND_API_KEY) return { ok: false, skipped: true };
  const itemsHtml = order.items.map(it =>
    `<tr><td style="padding:4px 10px 4px 0;font-weight:700;color:#A81820;">${escHtml(it.qty)}</td><td style="padding:4px 0;">${escHtml(it.name)}</td></tr>`
  ).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;">
      <h2 style="color:#A81820;margin:0 0 4px;">Neue Bestellung — ${escHtml(order.id)}</h2>
      <p style="margin:0 0 14px;color:#555;">${escHtml(order.deliveryMode)} · Abholung/Termin: <b>${escHtml(order.datum || '—')}</b></p>
      <table style="border-collapse:collapse;margin-bottom:12px;">${itemsHtml}</table>
      <p style="margin:0 0 4px;"><b>Summe:</b> ${escHtml(order.sum)}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:14px 0;">
      <p style="margin:0;"><b>${escHtml(order.name)}</b><br>${escHtml(order.telefon)}${order.adresse ? '<br>' + escHtml(order.adresse) : ''}</p>
      ${order.notiz ? `<p style="margin:10px 0 0;background:#faf6ef;padding:8px 11px;border-radius:8px;">📝 ${escHtml(order.notiz)}</p>` : ''}
      <p style="margin:16px 0 0;font-size:12px;color:#999;">Theken-Portal öffnen, um die Bestellung abzuhaken.</p>
    </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${env.SHOP_NAME || 'Der Fleischerei'} <${env.MAIL_FROM || 'bestellung@musterbetrieb.de'}>`,
        to: [env.INHABER_EMAIL || 'info@musterbetrieb.de'],
        ...(env.COPY_EMAIL ? { bcc: [env.COPY_EMAIL] } : {}),   // stille Kopie an Frederic
        subject: `Neue Bestellung ${order.id} — ${order.name}`,
        html,
      }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function requirePortalAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  return env.PORTAL_TOKEN && token && token === env.PORTAL_TOKEN;
}

// ── ROUTER ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    try {
      // ── GET /slots?date= ────────────────────────────────────────────────
      if (request.method === 'GET' && path === '/slots') {
        const date = url.searchParams.get('date') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date fehlt' }, 400, origin);
        if (isRuhetag(date)) return json({ geschlossen: true, frei: 0, max: CFG.MAX_ORDERS_PER_DAY }, 200, origin);
        const belegt = await dayCount(env, date);
        const frei = Math.max(0, CFG.MAX_ORDERS_PER_DAY - belegt);
        return json({ geschlossen: false, frei, belegt, max: CFG.MAX_ORDERS_PER_DAY }, 200, origin);
      }

      // ── POST /order ─────────────────────────────────────────────────────
      if (request.method === 'POST' && path === '/order') {
        // Rate-Limit pro IP
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `rl:${ip}`;
        const count = parseInt(await env.SHOP_KV.get(rlKey).catch(() => null) || '0', 10);
        if (count >= CFG.RL_MAX) return json({ error: 'Zu viele Bestellungen. Bitte später erneut.' }, 429, origin);

        const body = await request.json().catch(() => ({}));

        // Honeypot (verstecktes Feld muss leer sein)
        if (body.website) return json({ ok: true, id: 'B-IGNORED' }, 200, origin);

        // Validierung
        const name    = String(body.name || '').trim();
        const telefon = String(body.telefon || '').trim();
        const items   = Array.isArray(body.items) ? body.items.filter(i => i && i.qty && i.name) : [];
        const mode    = body.deliveryMode === 'Versand' ? 'Versand' : 'Abholung';
        const datum   = String(body.datum || '').trim();
        if (!name || !telefon || !items.length) return json({ error: 'Name, Telefon und Artikel sind Pflicht.' }, 400, origin);

        // Kontingent nur bei Abholung mit Datum
        if (mode === 'Abholung' && datum) {
          if (!validPickupDate(datum)) return json({ error: 'Abholtermin ungültig oder zu kurzfristig.' }, 400, origin);
          const belegt = await dayCount(env, datum);
          if (belegt >= CFG.MAX_ORDERS_PER_DAY) return json({ error: 'Dieser Tag ist ausgebucht. Bitte anderen Termin wählen.' }, 409, origin);
        }

        const order = {
          id: await nextOrderNr(env),
          name, telefon,
          adresse: String(body.adresse || '').trim(),
          deliveryMode: mode,
          datum,
          items: items.map(i => ({ qty: String(i.qty), name: String(i.name) })),
          sum: String(body.sum || 'auf Anfrage'),
          notiz: String(body.notiz || '').trim(),
          created: new Date().toISOString(),
          pickISO: (mode === 'Abholung' && datum) ? datum : '',
          pack: false, done: false,
        };

        // Persistieren + Tageszähler + Rate-Limit hochsetzen
        await env.SHOP_KV.put(`order:${order.id}`, JSON.stringify(order));
        if (order.pickISO) {
          await env.SHOP_KV.put(`daycount:${order.pickISO}`, String((await dayCount(env, order.pickISO)) + 1));
        }
        await env.SHOP_KV.put(rlKey, String(count + 1), { expirationTtl: CFG.RL_WINDOW });

        const mail = await mailInhaber(env, order);

        const frei = order.pickISO ? Math.max(0, CFG.MAX_ORDERS_PER_DAY - await dayCount(env, order.pickISO)) : null;
        return json({ ok: true, id: order.id, frei, mailed: mail.ok }, 200, origin);
      }

      // ── POST /order/manual  (Portal — Telefon/Laufkundschaft) ───────────
      if (request.method === 'POST' && path === '/order/manual') {
        if (!requirePortalAuth(request, env)) return json({ error: 'Nicht autorisiert' }, 401, origin);
        const body = await request.json().catch(() => ({}));
        const name    = String(body.name || '').trim();
        const telefon = String(body.telefon || '').trim();
        const text    = String(body.bestellung || '').trim();   // Freitext-Bestellung
        if (!name || !text) return json({ error: 'Name und Bestellung sind Pflicht.' }, 400, origin);
        // Freitext in Zeilen -> Items
        const items = text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).map(line => {
          const m = line.match(/^(\d+\s*[×xX]?)\s*(.*)$/);
          return m && m[2] ? { qty: m[1].replace(/[xX]/, '×'), name: m[2] } : { qty: '•', name: line };
        });
        const datum = String(body.datum || '').trim();
        const order = {
          id: await nextOrderNr(env),
          name, telefon,
          adresse: '',
          deliveryMode: 'Abholung',
          datum,
          items,
          sum: String(body.sum || 'auf Anfrage'),
          notiz: String(body.notiz || '').trim(),
          created: new Date().toISOString(),
          pickISO: '',            // manuell: belegt bewusst KEIN Kontingent
          source: 'manuell',
          pack: false, done: false,
        };
        await env.SHOP_KV.put(`order:${order.id}`, JSON.stringify(order));
        return json({ ok: true, id: order.id }, 200, origin);
      }

      // ── GET /orders  (Portal) ───────────────────────────────────────────
      if (request.method === 'GET' && path === '/orders') {
        if (!requirePortalAuth(request, env)) return json({ error: 'Nicht autorisiert' }, 401, origin);
        const list = await env.SHOP_KV.list({ prefix: 'order:', limit: 400 });
        const orders = (await Promise.all(
          list.keys.map(k => env.SHOP_KV.get(k.name).then(v => v ? JSON.parse(v) : null))
        )).filter(Boolean);
        // neueste zuerst
        orders.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
        return json({ ok: true, orders }, 200, origin);
      }

      // ── POST /order/:id/status  (Portal) ────────────────────────────────
      const mStatus = path.match(/^\/order\/([^/]+)\/status$/);
      if (request.method === 'POST' && mStatus) {
        if (!requirePortalAuth(request, env)) return json({ error: 'Nicht autorisiert' }, 401, origin);
        const id = decodeURIComponent(mStatus[1]);
        const raw = await env.SHOP_KV.get(`order:${id}`).catch(() => null);
        if (!raw) return json({ error: 'Bestellung nicht gefunden' }, 404, origin);
        const order = JSON.parse(raw);
        const body = await request.json().catch(() => ({}));
        if (typeof body.pack === 'boolean') order.pack = body.pack;
        if (typeof body.done === 'boolean') order.done = body.done;
        if (order.done) order.pack = true;      // abgeholt setzt abgepackt voraus
        if (!order.pack) order.done = false;
        await env.SHOP_KV.put(`order:${id}`, JSON.stringify(order));
        return json({ ok: true, order }, 200, origin);
      }

      // ── GET /party/availability  → freie Wochenend-Plätze (öffentlich) ──
      if (request.method === 'GET' && path === '/party/availability') {
        const reqs = await allPartyRequests(env);
        const conf = confirmedByWeekend(reqs);
        const weekends = {};
        for (const sat of Object.keys(conf)) weekends[sat] = weekendFree(conf[sat]);
        return json({ ok: true, weekends, cap: { grill: CFG.PARTY_GRILL, normal: CFG.PARTY_NORMAL } }, 200, origin);
      }

      // ── POST /party/request  → Anfrage anlegen (öffentlich) ─────────────
      if (request.method === 'POST' && path === '/party/request') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `rlp:${ip}`;
        const count = parseInt(await env.SHOP_KV.get(rlKey).catch(() => null) || '0', 10);
        if (count >= CFG.RL_MAX) return json({ error: 'Zu viele Anfragen. Bitte später erneut.' }, 429, origin);

        const body = await request.json().catch(() => ({}));
        if (body.website) return json({ ok: true, id: 'P-IGNORED' }, 200, origin);   // Honeypot

        const name     = String(body.name || '').trim();
        const telefon  = String(body.telefon || '').trim();
        const personen = parseInt(body.personen, 10);
        const eventISO = String(body.datumISO || '').trim();
        if (!name || !telefon || !personen) return json({ error: 'Name, Telefon und Personenzahl sind Pflicht.' }, 400, origin);
        if (eventISO && !validPartyDate(eventISO)) return json({ error: 'Termin ungültig (nur Fr–So, mind. 14 Tage Vorlauf).' }, 400, origin);

        const r = {
          id: await nextPartyNr(env),
          name, telefon,
          email:    String(body.email || '').trim(),
          anlass:   String(body.anlass || '').trim(),
          personen,
          paket:    String(body.paket || '').trim(),
          ort:      String(body.ort || '').trim(),
          nachricht: String(body.nachricht || '').trim(),
          kalkulation: String(body.kalkulation || '').trim(),
          eventISO,
          datumText: String(body.datumText || '').trim(),
          satISO:   eventISO ? satOfWeekend(eventISO) : '',
          status:   'angefragt',      // angefragt | bestätigt | abgelehnt
          kind:     '',               // grill | normal (bei Bestätigung)
          created:  new Date().toISOString(),
        };
        await env.SHOP_KV.put(`party:${r.id}`, JSON.stringify(r));
        await env.SHOP_KV.put(rlKey, String(count + 1), { expirationTtl: CFG.RL_WINDOW });
        const mail = await mailPartyRequest(env, r);
        return json({ ok: true, id: r.id, mailed: mail.ok }, 200, origin);
      }

      // ── GET /party/requests  (Portal) ──────────────────────────────────
      if (request.method === 'GET' && path === '/party/requests') {
        if (!requirePortalAuth(request, env)) return json({ error: 'Nicht autorisiert' }, 401, origin);
        const reqs = await allPartyRequests(env);
        const conf = confirmedByWeekend(reqs);
        // je Anfrage die aktuelle Wochenend-Belegung mitgeben (für Ampel im Portal)
        const enriched = reqs.map(r => ({ ...r, weekend: r.satISO ? weekendFree(conf[r.satISO]) : null }));
        return json({ ok: true, requests: enriched, cap: { grill: CFG.PARTY_GRILL, normal: CFG.PARTY_NORMAL } }, 200, origin);
      }

      // ── POST /party/:id/decision  (Portal) ─────────────────────────────
      const mDec = path.match(/^\/party\/([^/]+)\/decision$/);
      if (request.method === 'POST' && mDec) {
        if (!requirePortalAuth(request, env)) return json({ error: 'Nicht autorisiert' }, 401, origin);
        const id = decodeURIComponent(mDec[1]);
        const raw = await env.SHOP_KV.get(`party:${id}`).catch(() => null);
        if (!raw) return json({ error: 'Anfrage nicht gefunden' }, 404, origin);
        const r = JSON.parse(raw);
        const body = await request.json().catch(() => ({}));
        const decision = body.decision === 'abgelehnt' ? 'abgelehnt'
                       : body.decision === 'angefragt' ? 'angefragt' : 'bestätigt';

        if (decision === 'bestätigt') {
          const kind = body.kind === 'normal' ? 'normal' : 'grill';
          // Kapazität des Wochenendes prüfen (andere bestätigte ausgenommen dieser selbst)
          const reqs = (await allPartyRequests(env)).filter(x => x.id !== id);
          const w = confirmedByWeekend(reqs)[r.satISO] || { grill: 0, normal: 0 };
          if (kind === 'grill' && w.grill >= CFG.PARTY_GRILL)
            return json({ error: `Wochenende voll: bereits ${w.grill} Grill-Events bestätigt.` }, 409, origin);
          if (kind === 'normal' && w.normal >= CFG.PARTY_NORMAL)
            return json({ error: `Wochenende voll: bereits ${w.normal} normales Buffet bestätigt.` }, 409, origin);
          r.status = 'bestätigt'; r.kind = kind;
        } else {
          r.status = decision; r.kind = '';
        }
        await env.SHOP_KV.put(`party:${id}`, JSON.stringify(r));
        return json({ ok: true, request: r }, 200, origin);
      }

      // Health-Check
      if (request.method === 'GET' && path === '/') {
        return json({ ok: true, service: 'fleischerei-bestell-backend', ts: todayISO() }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'Serverfehler', detail: String(e) }, 500, origin);
    }
  },
};
