# Der Fleischerei — Bestell-Backend (Cloudflare Worker)

Persistentes Bestell-Backend für Shop + Theken-Portal. Ersetzt die Mock-Logik.
Speichert Bestellungen in KV, benachrichtigt Inhaber per E-Mail (Resend), liefert
dem Theken-Portal die echten Bestellungen (Token-geschützt).

## Endpunkte

**Shop / Theke:**
| Methode | Pfad | Zweck | Auth |
|---|---|---|---|
| GET  | `/slots?date=YYYY-MM-DD` | freie Abhol-Kontingente | öffentlich |
| POST | `/order` | Bestellung anlegen | öffentlich (Honeypot + Rate-Limit) |
| GET  | `/orders` | Bestellungen fürs Theken-Portal | `Bearer PORTAL_TOKEN` |
| POST | `/order/:id/status` | pack/done setzen | `Bearer PORTAL_TOKEN` |

**Partyservice (Buchungssystem):**
| Methode | Pfad | Zweck | Auth |
|---|---|---|---|
| GET  | `/party/availability` | freie Wochenend-Plätze (bestätigte belegen) | öffentlich |
| POST | `/party/request` | Anfrage anlegen (Status „angefragt") | öffentlich (Honeypot + Rate-Limit) |
| GET  | `/party/requests` | Anfragen fürs Partyservice-Portal | `Bearer PORTAL_TOKEN` |
| POST | `/party/:id/decision` | bestätigen (grill/normal) / ablehnen | `Bearer PORTAL_TOKEN` |

Konfig oben in `index.js` (`CFG`): Shop 10 Bestellungen/Tag, 2 Tage Vorlauf, Mo/So zu.
Party: 2 Grill + 1 normales Buffet pro Wochenende, 14 Tage Vorlauf, nur Fr–So. 15 Anfragen/IP/h.
Der PIN (`PORTAL_TOKEN`) gilt für BEIDE Portale (`portal.html` + `portal-party.html`).

## Lokal testen
```bash
cd worker
# .dev.vars anlegen (schon vorhanden, in .gitignore): PORTAL_TOKEN=test-pin-1234
npx wrangler dev --local --port 8787
```
Verifiziert 05.08.2026: Slots, Bestellung+Nr, Kontingent→409, Rate-Limit→429,
Ruhetag, Honeypot, Portal-Auth 401/ok, Status-Update, Render mit echten Daten.

## Deploy (Freigabe-Queue — braucht Frederics Zugänge)
1. **Cloudflare-Login:** `npx wrangler login`
2. **KV anlegen:** `npx wrangler kv namespace create SHOP_KV` → ausgegebene `id`
   und (mit `--preview`) `preview_id` in `wrangler.toml` eintragen. `account_id` setzen.
3. **Secrets setzen:**
   ```bash
   npx wrangler secret put PORTAL_TOKEN     # frei wählbarer PIN fürs Theken-Tablet
   npx wrangler secret put RESEND_API_KEY   # aus resend.com (siehe unten)
   ```
4. **Deploy:** `npx wrangler deploy` → liefert die Worker-URL
   (z. B. `https://fleischerei-bestell-backend.<subdomain>.workers.dev`).
5. **Frontend verdrahten:** in `../js/api-config.js` die `window.FLEISCHI_API`-Zeile
   auf die Worker-URL setzen. Cache-Version der Seiten hochzählen (`?v=rk24`).
6. **Theken-Tablet:** `portal.html` öffnen, beim ersten Mal den PORTAL_TOKEN-PIN eingeben
   (wird lokal gespeichert). Inhaber diesen PIN geben.

## Offene externe Blocker (nicht durch Code lösbar)
- **Resend-Konto + Absenderdomain:** `bestellung@musterbetrieb.de` muss bei resend.com
  per DNS (Strato) verifiziert werden, sonst kommt die Bestell-Mail nicht raus.
  → **Ohne Resend läuft alles weiter** (Bestellung speichert, Portal zeigt sie),
  nur die E-Mail an Inhaber wird sauber übersprungen. Portal ist dann der Kanal.
- **INHABER_EMAIL** steht auf `info@musterbetrieb.de` (Kundenadresse eintragen) — bei Bedarf in
  `wrangler.toml` [vars] anpassen.
- **Cloudflare-Hygiene:** falls das je ein Förder-Projekt berührt → nicht öffentliches
  GitHub-Pages, siehe Förder-Hosting-Regel. Hier unkritisch.

## Datenschutz
- Bestelldaten (Name, Tel, ggf. Adresse) liegen in Cloudflare KV (EU-Data-Location
  im Cloudflare-Dashboard auf EU stellen). In Datenschutzerklärung aufnehmen:
  Auftragsverarbeitung Cloudflare + Resend, AVV abschließen.
