# Specificatie en voortgang

Status **gebouwd** betekent dat de functie in de code bestaat. Waar browserbediening nodig is, blijft die bediening ongetest totdat de handmatige acceptatie is afgerond. De volledige productvisie is nog niet af.

| Oorspronkelijk onderdeel | Huidige invulling | Status / vervolg |
| --- | --- | --- |
| 1. Productvisie | Browsereditor, 4 × 8 m referentie, cm-scène, export | Handmatige eerste versie. Conversational design, intake en catalogusassemblage ontbreken. |
| 2. Principes | Deterministische geometrie, gescheiden modellen, synthetische onderdelen, handmatig zonder sleutel | Gebouwd. Geen echte leveranciersdata of constructieve claims. Server-lock/backend/API nog niet gebouwd. |
| 3. Architectuur | React, TypeScript, Vite, Three.js; schema en objectreferenties; lokale opslag | Gebouwd. FastAPI/SQLite, assetopslag, queue, Blender, GLB-uitwisseling en Docker ontbreken. |
| 4. Ontwerpstadia | Ruimte, onderdelen plaatsen, verfijnen, views en exports | Gedeeltelijk. Geen beeldintake, AI-concepten, automatische catalogusmatching of AI-approval gates. |
| 5. Ergonomie | Muis/touch controls; orthografische views; selectiekader; transforms; numeric cm; dupliceren; undo; shared/unique; flat groups; tags; locks; materials; bounds | Gebouwd, browseracceptatie open. Geen double-click nested editing/breadcrumbs, face materials, measure tool, connection snapping, doorlopend context-editing of planmatige padnavigatie. |
| 6. Media/VR | Drie realtime kleur-/lichtpresets, fog in immersive, saved cameras, screenshotcode, eye-height camera | Gedeeltelijk en browserongetest. Geen media-upload, UV/corner mapping, videosynchronisatie, WebXR/teleport of Blender-final-renders. |
| 7. Onderdelen | Zeven procedurale synthetic demo-typen, afmetingen, DEMO-code, zichtbare bronstatus, editable definitions | Gebouwd. Geen fabrikant-CAD, importlicenties, sockets/verbindingen, custom solid CAD of STEP. Geen structurele verificatie. |
| 8. Export/versioning | XLSX BOM + instance detail, echte PDF conceptaanzichten, CSV, JSON, autosave, 10 herstelpunten | Gebouwd en data/exporttests slagen. PDF-scales gemodelleerd en proefexport gerenderd. Geen GLB/media-zip/checksums/serverrevision history of fabriekstekeningen. |
| 9. Claude/cost governance | Geen LLM-calls; handmatige editor is volledig onafhankelijk | Nog niet gebouwd. Backendadapter, models/router, agent dashboard, budget/cost ledger volgen na browseracceptatie. Geen kosten gemaakt. |
| 10. QA-loops | TypeScript/build, geometrie-, state-, selectie-, exporttests; PDF-proefrender | 33 tests slagen. WebGL/browserinteractie, visual regression, Safari, hardware-VR en Blender niet uitgevoerd. Zie TEST_RESULTS.md. |
| 11. Memory | TASK_STATE, DECISIONS, REQUIREMENTS, TEST_RESULTS; projectcontext en playbook | Handmatig ontwikkellog. Nog geen automatisch projectkennisbeheer of contextdistillatie in de app. |
| 12. Implementatie | Vertical slice + componentsemantiek + tags/materials + lokale versies + PDF/XLSX | Eerste checkpoint. Eerst echte browseracceptatie en geobserveerde fouten herstellen, daarna backend/Claude. |
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

## Eerstvolgende fasen

1. Voer docs/MANUAL_QA.md uit; leg werkelijke browserresultaten vast en herstel fouten.
2. Voeg server-side persistence, revisions en edit lock toe met een expliciet privaat toegangsmodel.
3. Voeg een server-side Claude-adapter toe; sleutels blijven buiten frontend en Git. Betaalde calls vereisen afzonderlijke autorisatie.
4. Implementeer geneste componentcontext, connection metadata en catalogusadapters.
5. Media/UV/corner canvas en read-only WebXR.
6. Blender queue, hoogwaardige renders, GLB/assetpackage en exportverfijning.
7. API-budgetdashboard, kennislogs en volledige referentieacceptatie.
