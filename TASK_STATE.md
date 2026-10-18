# Bouwstatus — versie 0.2

18 oktober 2026. Michel gaf opdracht verder te bouwen en vroeg expliciet tussentijds naar Git te pushen. De thread en bron zijn intact. Tussentijds checkpoint `2f3592f` is naar de eigen branch gepusht; deze afronding bevat groepscorrecties, formattering en actuele overdracht.

## Gebouwd

- Bestaande React/TypeScript/Three.js-editor, synthetische cm-demo, PDF/XLSX/JSON, lokale autosave en herstelpunten.
- Node 24/native SQLite: projecten, onveranderlijke revisies, restore, per-tab leases/CAS-conflicten en seriële editor-opslagqueue.
- Lokale HTTP-API met sessie/CSRF, Origin-/Hostcontrole en optionele toegangscode. Eén serverproces per datamap.
- Server-side Claude-adapter: accountmodelcontrole, compacte scène/voorgaande vragen, tokenraming, gedateerde officiële prijzen, budget/reserveringen/ledger, proposal-preview en expliciet apply/reject/reconcile.
- Geen echte provider-calls/kosten; tests gebruiken uitsluitend fake providerresponses. Sleutels en datamap zijn Git-ignored.
- Automatisch afgeleide project-LOG/CONTEXT uit SQLite. Geen algemene kennisdistillatie.
- Geneste groepen, context/breadcrumbs, objectboom, inherited locks/zichtbaarheid, hiërarchisch duplicate/ungroup, selectiemateriaal. Groepen zijn nog geen gedeelde assembly-definities.

## Bewijs

68 tests slagen, inclusief client → echte HTTP → fake Claude → preview → revisie, CLI-start/herstart, proceslock, budgetconcurrency en hiërarchie. TypeScript/productie-build, formatter, diff-whitespacecontrole slagen. Productieaudit meldt 0 kwetsbaarheden. Browserobservatie blijft geblokkeerd door het eerder gemelde URL-beveiligingsbeleid. Geen WebGL/UI/Safari-acceptatie geclaimd. Zie TEST_RESULTS.

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

1. Echte browseracceptatie van docs/MANUAL_QA.md en geobserveerde fouten herstellen.
2. Connection metadata/snapping, meetgereedschap, catalogusadapters en gedeelde assembly-definities.
3. Media-intake, UV/corner canvas, video en read-only WebXR.
4. Blender-renderqueue, GLB/assetpackage en exportverfijning.
5. Modelroutering/kennisdistillatie en volledige referentieacceptatie.

Een geslaagde API-/buildtest is geen browseracceptatie. Dit bestand belooft geen zelfstandig achtergrondproces nadat de beurt is beëindigd. Bij hervatten: inspecteer de echte branch/status en de actuele documenten voordat je verder bouwt.
