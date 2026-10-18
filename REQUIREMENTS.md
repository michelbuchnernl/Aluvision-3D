# Specificatie en voortgang

Status **gebouwd** betekent dat de functie in de code bestaat. Waar browserbediening nodig is, blijft die bediening ongetest totdat de handmatige acceptatie is afgerond. De volledige productvisie is nog niet af.

| Oorspronkelijk onderdeel | Huidige invulling | Status / vervolg |
| --- | --- | --- |
| 1. Productvisie | Browsereditor, 4 × 8 m referentie, cm-scène, export | Handmatige editor en optionele conversationele scènevoorstellen. Beeldintake en automatische catalogusassemblage ontbreken. |
| 2. Principes | Deterministische geometrie, gescheiden modellen, synthetische onderdelen, handmatig zonder sleutel | Gebouwd. Geen echte leveranciersdata of constructieve claims. SQLite-backend en per-tab serverlock gebouwd; browseracceptatie open. |
| 3. Architectuur | React, TypeScript, Vite, Three.js; schema en objectreferenties; lokale opslag | Gebouwd. Node 24/native SQLite toegevoegd in plaats van een afzonderlijke Python-runtime. Assetopslag, queue, Blender en Docker ontbreken. GLB-export gebouwd; GLB-import ontbreekt. |
| 4. Ontwerpstadia | Ruimte, onderdelen plaatsen, verfijnen, views en exports | Gedeeltelijk. Claude kan scènevoorstellen geven met expliciete approval/preview; geen beeldintake, gegenereerde conceptbeelden of catalogusmatching. |
| 5. Ergonomie | Muis/touch controls; orthografische views; selectiekader; transforms; numeric cm; dupliceren; undo; shared/unique; nested groups; tags; locks; materials; bounds | Gebouwd, browseracceptatie open. Double-click nested editing, breadcrumbs en contextfading gebouwd. Twee-puntsmeting en expliciete demo-vlakuitlijning gebouwd. Geen face materials, automatisch magnetisch snapping of planmatige padnavigatie. Geen shared assembly definitions. |
| 6. Media/VR | Drie realtime kleur-/lichtpresets, fog in immersive, saved cameras, screenshotcode, eye-height camera | Gedeeltelijk en browserongetest. Geen media-upload, UV/corner mapping, videosynchronisatie, WebXR/teleport of Blender-final-renders. |
| 7. Onderdelen | Zeven procedurale synthetic demo-typen, afmetingen, DEMO-code, zichtbare bronstatus, editable definitions | Gebouwd. Parametrische demo-sockets en verbindingen als controlemarkeringen gebouwd. Geen fabrikant-CAD, importlicenties, echte connectorcompatibiliteit, custom solid CAD of STEP. Geen structurele verificatie. |
| 8. Export/versioning | XLSX BOM + instance detail, echte PDF conceptaanzichten, CSV, JSON, autosave, 10 herstelpunten | Gebouwd en data/exporttests slagen. PDF-scales gemodelleerd en proefexport gerenderd. Onveranderlijke SQLite-revisies en restore gebouwd. GLB-export gebouwd en binair roundtrip-getest. Geen GLB-import/media-zip/checksums of fabriekstekeningen. |
| 9. Claude/cost governance | Serveradapter, beschikbaarheidscheck, compacte context, tokenraming, USD-projectbudget/reserveringen/ledger, preview/apply/reject/reconcile | Gebouwd en met fake provider getest. Geen echte API-calls/kosten. Geen automatische router of multi-agent dashboard; echte provideracceptatie open. |
| 10. QA-loops | TypeScript/build, geometrie-, state-, selectie-, exporttests; PDF-proefrender | 81 tests slagen, inclusief echte HTTP en CLI-start/herstart. WebGL/browserinteractie, visual regression, Safari, hardware-VR en Blender niet uitgevoerd. Zie TEST_RESULTS.md. |
| 11. Memory | TASK_STATE, DECISIONS, REQUIREMENTS, TEST_RESULTS; projectcontext en playbook | Project-LOG/CONTEXT automatisch uit SQLite afgeleid en laatste dialoog compact meegenomen. Algemene kennisdistillatie en automatische playbookpromotie ontbreken. |
| 12. Implementatie | Vertical slice + componentsemantiek + tags/materials + lokale versies + PDF/XLSX | Versie 0.3-codecheckpoint; backend/Claude/nested editing toegevoegd. Visuele browseracceptatie blijft open en wordt niet uit headless tests afgeleid. |
| 13. Oplevering | Laptopstart, eigen GitHub-branch, bron, lockfile, importeerbare 4 × 8 demo en CSV; testverslag | Geen gehoste webpreview of beloofde achtergrondtaak. Zie TASK_STATE voor synchronisatie. |

## Acceptatie van de eerste versie

- [x] Canoniek schema in cm; 800 × 400 × 300 cm demo, expliciete hoogteaanname.
- [x] Frame/paneel/connector/furniture placeholders zonder echte fabrikantclaims.
- [x] Objectoperaties, grensfouten, shared/unique en locks hebben tests.
- [x] Scène-JSON roundtrip, undo/redo en BOM-reconciliatie hebben tests.
- [x] De gegenereerde Three.js-geometrie past ook na wijzigen van dimensies binnen haar gedeclareerde fysieke omhulling.
- [x] XLSX wordt teruggelezen en telt exact evenveel exemplaren als de scène.
- [x] PDF op A4 met schaalconversie en zichtbaar benoemde conceptstatus.
- [x] TypeScript-controle en productie-build slagen.
- [ ] WebGL werkelijk geopend en visueel gecontroleerd.
- [ ] Volledige muis-/touchworkflow werkelijk in browser uitgevoerd.
- [ ] JSON-download/upload, camera/screenshot/PDF-download en lokale tab-lock via echte browser geverifieerd.
- [ ] Fysieke iPhone/Safari-controle.

## Aanvullende acceptatie versie 0.2

- [x] SQLite opslaan/heropenen, onveranderlijke revisies en restore als nieuwe revisie getest.
- [x] Lease/CAS-conflicten en per-tab overname getest via echte HTTP.
- [x] Werkelijke editorconnection getest op overlappende saves en late responses.
- [x] Volledig client → HTTP → fake Claude → preview → apply traject getest.
- [x] Budgetreserveringen, onbekend verbruik, herhaalaanvragen en verouderde voorstellen getest.
- [x] Geneste groepsselectie, locks, zichtbaarheid, dupliceren en ungroup getest.
- [x] CLI-start/herstart, persistentie en afwijzen van een tweede serverproces getest.
- [ ] Nieuwe server-/Claude-/groep-UI werkelijk in browser uitgevoerd.
- [ ] Echte provideracceptatie; betaalde calls zijn niet in deze bouwronde geautoriseerd.

## Aanvullende acceptatie versie 0.3

- [x] Demo-socketmetadata en verbindingsreferenties worden gevalideerd en in JSON bewaard.
- [x] Vlakuitlijning met rigid group transform, locks, expliciete hoogte, profiles en ruimtecontrole getest.
- [x] Stale uitlijnpreview kan latere edits niet overschrijven.
- [x] Verbindingen dupliceren/prunen en verbroken uitlijning waarschuwt zonder correctie.
- [x] 3D-/horizontale meetafstand en signed assen getest.
- [x] GLB echt binair geëxporteerd en opnieuw geladen; 36 instance-bounds in meters kloppen.
- [ ] Klikmetingen, preview/apply en downloads werkelijk in browser bediend.
- [ ] GLB geopend en visueel beoordeeld in externe viewer/Blender.

## Eerstvolgende fasen

1. Voer docs/MANUAL_QA.md uit en herstel geobserveerde browserfouten.
2. Catalogusadapters, gedeelde assembly-definities, socket-editor en magnetische sleep-snapping.
3. Media-intake, UV/corner canvas en read-only WebXR.
4. Blender queue, hoogwaardige renders, GLB/assetpackage en exportverfijning.
5. Modelroutering, kennisdistillatie en volledige referentieacceptatie.
