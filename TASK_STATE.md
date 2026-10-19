# Bouwstatus — versie 0.7

18 oktober 2026. Michel gaf opdracht verder te bouwen en vroeg expliciet tussentijds naar Git te pushen. De thread en bron zijn intact. Tussentijds checkpoint `2f3592f` is naar de eigen branch gepusht; checkpoint 0250fee rondde de 0.2-groepscorrecties af. Versie 0.3 voegt ruimtelijke tools en GLB toe.

## Gebouwd

- Bestaande React/TypeScript/Three.js-editor, synthetische cm-demo, PDF/XLSX/JSON, lokale autosave en herstelpunten.
- Node 24/native SQLite: projecten, onveranderlijke revisies, restore, per-tab leases/CAS-conflicten en seriële editor-opslagqueue.
- Lokale HTTP-API met sessie/CSRF, Origin-/Hostcontrole en optionele toegangscode. Eén serverproces per datamap.
- Server-side Claude-adapter: accountmodelcontrole, compacte scène/voorgaande vragen, tokenraming, gedateerde officiële prijzen, budget/reserveringen/ledger, proposal-preview en expliciet apply/reject/reconcile.
- Geen echte provider-calls/kosten; tests gebruiken uitsluitend fake providerresponses. Sleutels en datamap zijn Git-ignored.
- Automatisch afgeleide project-LOG/CONTEXT uit SQLite. Geen algemene kennisdistillatie.
- Geneste groepen, context/breadcrumbs, objectboom, inherited locks/zichtbaarheid, hiërarchisch duplicate/ungroup, selectiemateriaal. Groepen zijn nog geen gedeelde assembly-definities.

## Toegevoegd in versie 0.3

- Parametrische demo-sockets en optionele verbindingsrecords, backward-compatible binnen schema 1.
- Expliciete vlakuitlijning: hele selectie rigid draaien/verplaatsen, locks, hoogteakkoord, profielen, bounds en onafhankelijke preview/apply met stale-baseguard.
- Verbindingscontrole bij latere edits, pruning bij delete en interne links kopiëren bij duplicate. Geen echte fabrikantcompatibiliteit of constraint solver.
- Tijdelijke 2-puntsmeting met viewportlijn, 3D/horizontale afstand en exacte cm-invoer; shortcut T.
- GLB-export via dezelfde geometrie met meterconversie, hiërarchie/identiteit/materialen en expliciet include-hidden. Echte binary roundtrip; geen GLB-import.
- Importeerbaar voorbeeld examples/connected-demo-frames.json en gebruiksdocument docs/SPATIAL_TOOLS.md.

## Toegevoegd in versie 0.4 (mediacanvas)

- Projectiecanvas over een geordende paneelreeks, ook om een 90°-hoek: expliciete UV per paneel, gemeten naden/hoeken/gaten, pixeldichtheid en fit-modi. Zie docs/MEDIA.md.
- Afbeelding, video (gedeelde texture, frame-synchroon op alle wanden) en procedureel kalibratiepatroon. Mediabestanden blijven sessiegeheugen; project bewaart metadata + SHA-256.
- Hoekcanvas-demo (Nieuw / demo) en examples/corner-canvas-demo.json. 12 nieuwe tests (93 totaal).
- Eerste echte browserobservatie (ingebouwde browser, WebGL): Immersief-preset, kalibratiepatroon over de hoek, geüploade afbeelding met 'passend', gegenereerde webm-video die frames doorloopt.

## Toegevoegd in versie 0.5 (read-only VR)

- WebXR-sessie met stick-teleport (voorwaarts richten, loslaten = teleporteren), vloerdoelmarkering en spawn op vrije vloer. Zie docs/VR.md.
- Teleportregels zijn pure code (src/teleport.ts) met 7 tests: vloerstraal, wandmarge, geroteerde footprints, verborgen/hangende objecten, hoofdoffset, stick-hysterese, startpunt.
- De renderloop gebruikt nu `setAnimationLoop`; desktop-rendering is in de browser opnieuw bekeken. Sessiestart en controllers zijn **niet** op hardware bewezen; de VR-knop is uitgeschakeld zonder headset.

## Toegevoegd in versie 0.6 (browser-UX-lus)

- Playwright-suite (`npm run test:e2e`, systeem-Chrome, 6 tests): presets, selectiekader-richtingen, groep/uniek/lock, handmatig bewerken + herstel, hoekcanvas, exports. Zie docs/E2E.md.
- Alleen-lezen `window.__studio`-hook onder `?e2e=1`; `measureBoxes` in de viewport wordt gedeeld door selectiekader en tests.

## Toegevoegd in versie 0.7 (Blender voorbereid, pakket, isometrie)

- **Blender voorbereid, niet geprobeerd:** jobschema + validatie, SQLite-wachtrij met drie-pogingenregel en herstelgedrag, geverifieerde uitvoer, HTTP-routes, renderpaneel, `render_worker.py` (alleen syntaxis-gecontroleerd) en `npm run blender:dry`. Zie docs/BLENDER.md met de eerste-testchecklist.
- **Portable projectpakket (.zip):** project.json, scene.glb, bom.xlsx, manifest met SHA-256; strikte heropening (beschadiging, ontbrekende/extra bestanden, onjuiste aantallen worden geweigerd); media wordt als "opnieuw koppelen" gemeld.
- **Isometrisch lijnaanzicht in de PDF** (assen op volle schaal, standaardschaal, alle randen; geen verborgen-lijnverwijdering). PDF heeft nu 5 pagina's.
- 22 nieuwe Node-tests (122) en 2 nieuwe e2e-tests (8).

## Bewijs

81 tests slagen, inclusief client → echte HTTP → fake Claude → preview → revisie, CLI-start/herstart, proceslock, budgetconcurrency, hiërarchie, uitlijning, meten en echte GLB-roundtrips. TypeScript/productie-build, formatter, diff-whitespacecontrole slagen. Productieaudit meldt 0 kwetsbaarheden. Browserobservatie blijft geblokkeerd door het eerder gemelde URL-beveiligingsbeleid. Geen WebGL/UI/Safari-acceptatie geclaimd. Zie TEST_RESULTS.

## Bestemming en hervatten

Repository: https://github.com/michelbuchnernl/Aluvision-3D
Branch: `sol/aluvision-prototype`
Claude's `Aluvision-3D-tool` wordt niet gewijzigd. Geen force-push, merge of publieke webdeployment.

```bash
git fetch origin
git switch sol/aluvision-prototype
git pull --ff-only
npm ci
npm run dev
```

Editor: http://localhost:4173. API: 8787. Productie: `npm run build` en `npm start`, daarna http://localhost:8787. Claude staat uit. Optionele `.env` vereist `npm run dev:env` of `npm run start:env`. Zie docs/SERVER_AND_AI.md voor gebruik en consistente back-up bij gestopte server.

## Vervolg naar volledige specificatie

1. Resterende MANUAL_QA-punten buiten de e2e-dekking, plus visuele regressie met referentiebeelden.
2. Catalogusadapters, gedeelde assembly-definities, socket-editor en magnetische sleep-snapping.
3. Echte headset-/emulatorcontrole van VR; media-export in projectpakket; schermafbeelding-/regressielus.
4. Eerste echte Blender-run (docs/BLENDER.md), GLB-import/assetpackage, media-bestanden in het pakket.
5. Modelroutering/kennisdistillatie en volledige referentieacceptatie.

Een geslaagde API-/buildtest is geen browseracceptatie. Dit bestand belooft geen zelfstandig achtergrondproces nadat de beurt is beëindigd. Bij hervatten: inspecteer de echte branch/status en de actuele documenten voordat je verder bouwt.
