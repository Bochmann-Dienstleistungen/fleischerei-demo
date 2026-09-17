# Fleischerei Eichenhof — VALORIS Showcase (Fleischerhandwerk)

**Was das ist:** die Referenz-Demo für die Fleischerei-Akquise. Musterbetrieb, kein reales
Unternehmen. Entstanden aus dem Build, der bei VALORIS geblieben ist — komplett de-brandet.

**Live-Zweck:** einem Fleischermeister in 30 Sekunden zeigen, was möglich ist, ohne für ihn
vorher etwas zu bauen. Siehe Memory `project_fleischerei_kampagne`.

## Seiten
| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Loader, Hero, Produkt-Teaser, Meister-Story, USP-Strecke, Zahlen, Partyservice, Bewertungen, Standort |
| `shop.html` | Bestell-Shop: 10 Produkte, Cart-Drawer, Quick-View, Mindestbestellwert, Abholtermin mit Tageskontingent |
| `partyservice.html` | Preiskalkulator (Personen/Pakete/Anfahrt/Personal) + Belegungskalender + Anfrageformular |
| `ueber-uns.html` | Meister-Porträt, Auszeichnungen, Timeline |
| `kontakt.html` | Kontaktformular, Öffnungszeiten, Karte als Zwei-Klick-Lösung |
| `portal.html` | **Theken-Portal** (Tablet): Tagesliste, Status abgepackt → abgeholt, Ton bei neuer Bestellung, Telefon-Bestellung manuell erfassen |
| `portal-party.html` | **Partyservice-Portal**: Anfragen als Grill/Buffet bestätigen oder ablehnen, Wochenend-Kapazität |

## Demo-Modus (wichtig)
`js/api-config.js` setzt `DEMO_MODE = true`. Dann fängt `js/demo-backend.js` alle Backend-Aufrufe
ab und beantwortet sie aus dem `localStorage` des Besuchers. **Es läuft kein Server.** Trotzdem ist
die ganze Kette klickbar: Bestellung im Shop → erscheint im Theken-Portal · Partyservice-Anfrage →
erscheint im Party-Portal → bestätigen belegt den Kalender. Das Portal fragt im Demo keine PIN ab.

**Für ein echtes Kundenprojekt:**
1. `js/demo-backend.js` aus den vier `<script>`-Zeilen entfernen (shop, partyservice, portal, portal-party)
2. in `js/api-config.js` `DEMO_MODE = false` und die deployte Worker-URL eintragen
3. `css/valoris-demo.css` und den `<div class="vd-bar">` am Seitenende ersatzlos löschen
4. `worker/` deployen (siehe `worker/README.md`) und Kundendaten überall ersetzen

## Was zur Demo gehört und beim Kunden raus muss
- `css/valoris-demo.css` + `vd-bar` → die VALORIS-Leiste unten mit WhatsApp-CTA
- `js/demo-backend.js` → Mock-Backend
- Demo-Hinweis in Impressum und Datenschutz

## Rechtliches / Herkunft
- Der Code stammt aus einem VALORIS-Build, für den **kein Nutzungsrecht abgetreten** wurde (§ 31 UrhG).
  Name, Logo, Fotos, Titel und Texte des damaligen Kunden sind **vollständig entfernt**.
- Alle Fotos: Pexels, **lokal gehostet** (keine Hotlinks, DSGVO).
- Schriften über **fonts.bunny.net** (kein Google-Fonts-Hotlink).
- Karte auf `kontakt.html` lädt Google erst nach ausdrücklichem Klick (Zwei-Klick).
- Kontaktformular läuft auf Formspree `mlgpooqw` — Anfragen aus der Demo landen **bei VALORIS**. Das ist so gewollt.

## Getestet (17.09.2026)
Alle 7 Seiten: keine Konsolenfehler, keine 404, kein Horizontal-Overflow (1440 px und 390 px),
keine blank gebliebenen Reveal-Elemente nach vollem Durchscrollen.
Durchgespielt: Shop-Bestellung → Theken-Portal · Partyservice-Anfrage → Party-Portal → „Als Grill" bestätigt.
