# Werkelijk uitgevoerde verificatie

Datum: 18 oktober 2026. Omgeving: Linux, Node 24.19.0, npm 11.9.0.

## Geslaagd

| Controle | Werkelijk resultaat |
| --- | --- |
| `npm test` | 81 tests, 81 geslaagd, 0 gefaald |
| `npm run build` | TypeScript-check en Vite-productie-build geslaagd |
| `npm run format:check` / `git diff --check` | Formatter en whitespacecontrole geslaagd |
| CLI-start/herstart | Echte Node-server via child process gestart, HTTP-project opgeslagen, tweede schrijver afgewezen, schoon gestopt, SQLite-project na herstart teruggelezen |
| Client/API/Claude-keten | Werkelijke editorconnection → HTTP → fake provider → preview → toepassen als revisie 2; geen betaalde aanvraag |
| `npm audit --omit=dev --json` | 0 gemelde kwetsbaarheden in productiedependencytree na uuid-override |
| XLSX-roundtrip | Bestand in geheugen gegenereerd en opnieuw geopend; BOM-totaal en instanceblad tellen alle 36 demo-objecten |
| GLB-roundtrip | Echte binary GLB met Three.js geëxporteerd en opnieuw geladen; 36 demo-instances en alle wereld-bounds gecontroleerd in meters, ook rotatie/nesting/visibility en lege scène |
| Ruimtelijke bewerkingen | 9 tests voor demo-uitlijning, meting, validatie, locks, hele groepen, stale preview en verbindingslevenscyclus |
| PDF-data | 4 pagina's zonder browserbeeld: drie technische aanzichten en controleblad; A4 landscape, 1:50 voor de demo |
| PDF-proefrender | Gegenereerd met de app-exporter en met Poppler gerenderd; zichtbare proefpagina's gecontroleerd op leesbaarheid en maatlabels |

## Dekking

- Eenheden, geroteerde AABB, vloer/plafond en exacte grenswaarden.
- Geen stille correctie bij overschrijding.
- Duplicaten met eigen ID, gedeelde versus unieke definitie, materiaaloverrides.
- Object-/laaglock, groups, layer visibility en BOM-telling van verborgen objecten.
- JSON roundtrip en afwijzen van dubbele IDs, ontbrekende verwijzingen en ongeldige dimensies/camera/materialen.
- Undo/redo en begrensde historie.
- Richting van selectiekader, group/pivot rotation en expliciete vrije hoogte.
- CSV-formuletekst, camerazoom/frustum in JSON.
- Concrete Three.js-geometrie tegenover fysieke omhullingen bij catalogusmaten en twee afwijkende maatreeksen.
- Excel met unieke definities, maatwijzigingen en lege projecten.
- PDF-waarschuwingen bij een ongeldige scène zonder scene-mutatie.

- SQLite-transacties, onveranderlijke revisies, restore, heropenen en afgeleide projectlogs.
- Sessie/CSRF/Origin/Host-toegang, optionele toegangscode, per-tab leases en takeover.
- Werkelijke editor-opslagqueue bij overlappende saves, revisieconflict, late response voor oud project en restore met onopgeslagen wijzigingen.
- Claude-modelcontrole, strikt toolformaat, compacte vervolgvragen, tokenraming, atomaire budgetreserveringen, stale proposal en expliciete ruimtegoedkeuring, allemaal met fake provider.
- Gemeten kosten bij ongeldige output, cacheprijzen, onbekende kosten, reconciliatie, quote-/prijsexpiratie en geen automatische inference-retry.
- Geneste groepen: selectie per niveau, inherited locks/zichtbaarheid, duplicatie met nieuwe groeps-IDs, ungroup, verwijderen/pruning, cyclus-/referentievalidatie en AI-verwijderen met behoud van parent groups.

- Parametrische sockets, face-/normaalvalidatie, incompatibele profielen en bezette/ontbrekende eindpunten.
- Uitlijnen van groepen met behoud van afstanden/hoogten, expliciete vrije hoogte, bounds en stale-previewguard.
- Verbindingen blijven bij JSON/unique behouden; duplicate kopieert alleen interne links en delete prunet referenties.
- Exacte 3D-/horizontale meting met signed assen en afwijzen van ongeldige punten.
- GLB-header/versie, binair reload, 0,01-conversie naar meters, nested identity/materialen en include-hiddenkeuze. Tests gebruiken alleen een Blob-reader shim; geen canvas, WebGL of UI wordt nagebootst.

## Gevonden en hersteld tijdens bouwen

1. Floating-point roundtrip had een onterechte test met exacte decimale gelijkheid; vervangen door een passende numerieke tolerantie.
2. Lege Excel-BOM kreeg een zinloze nulformule zonder cached resultaat; gebruikt nu numerieke nul.
3. Projectorlens en tafelpoten konden bij extreme maatwijzigingen buiten hun nominale envelop vallen; procedurale geometrie begrensd en concrete Three.js-bounds getest.
4. Behouden hoogte bij horizontaal verplaatsen expliciet gemaakt; een reeds verhoogde projector valt niet stilzwijgend op de vloer.
5. uuid-advisory in ExcelJS-dependencytree met compatibele override aangepakt en exporttests herhaald.
6. Naamvelden committen op blur/Enter zodat elke letter niet een complete undo-stap verbruikt.
7. Oudere serverresponses kunnen na projectwissel de huidige scène niet vervangen; saves gebruiken een seriële queue en generation guards.
8. Een tab-id is apart van de gedeelde sessiecookie, zodat twee tabs niet onbedoeld dezelfde lease delen.
9. Groepsverwijderen in de AI-preview gebruikt dezelfde hiërarchische pruning als handmatig verwijderen. De inspector gebruikt nu echt ungroup op het huidige niveau.
10. Verborgen kinderen van een geselecteerde groep krijgen bij gizmo-commit dezelfde transformatie uit modeldata; de visuele uitvoering hiervan blijft onderdeel van handmatige QA.

## Niet geverifieerd

De cloudbrowser wees observatie af via het URL-beveiligingsbeleid. Deze afwijzing is niet omzeild. Het lokale previewhulpmiddel meldde een gestart previewadres, maar er is **geen succesvolle browserobservatie** geweest. In de eerste ronde bereikte een loopback-probe geen previewserver. In versie 0.2 is serverstart wél apart met echte CLI-/HTTP-tests bevestigd; dit levert nog geen browserobservatie op. Testprocessen worden na afloop gestopt.

Daarom zijn WebGL-weergave, echte controls, downloadinteractie, camera/frustumherstel in browser, autosave/herstel en leasegedrag tussen echte tabs nog niet empirisch bevestigd. Ook de server-/Claude-/groeppanelen, de nieuwe meet-/uitlijnbediening en GLB-download zijn nog niet visueel getest. Externe GLB-viewers/Blender zijn niet geopend; alleen echte data-roundtrips zijn uitgevoerd. Echte Claude-providerintegratie, fysieke iPhone/Safari, WebXR en Blender zijn niet getest. Er zijn geen echte API-calls uitgevoerd. Er zijn geen browser-screenshots of verzonnen visuele resultaten.

Vite meldt grote chunks door Three.js en de lazy-loaded Excel/PDF-exporter. De build slaagt, maar werkelijke laadtijd en mobiele performance zijn niet gemeten. Een schone npm-audit is geen volledige security review.

Voer de concrete acceptatieprocedure in docs/MANUAL_QA.md uit voordat dit prototype in gebruik wordt genomen.

## Versie 0.4 — mediacanvas (18 oktober 2026, Node 25.9 lokaal)

- `npm test`: 93 tests, alle geslaagd. `npm run check`, `format:check` en `npm run build` slagen.
- tests/media.test.mjs: hoekgeometrie (7 vlakke naden 0°, laatste 90°, alle gaten 0 cm), ketenvolgorde bij geschudde selectie, gat van 4 cm exact gemeld, niet-vierkante pixels, fit-modi, slice-UV, pruning bij verwijderen, JSON-roundtrip en afwijzing van kapotte verwijzingen, voorbeeldbestand.
- Handmatig in de ingebouwde browser (WebGL, Chrome-engine): kalibratiepatroon loopt door op de hoekpaneel; afbeelding met 'passend' toont zwarte randen en juiste leesrichting; webm-video speelde (frame 32 → 74 binnen ~1 s) op het hele canvas.
- Niet gedaan: Safari/Firefox, hardwarematige VR, geluid, mediapakket in export, geautomatiseerde screenshotregressie.

## Versie 0.5 — VR-teleport (18 oktober 2026)

- `npm test`: 100 tests geslaagd; `npm run check` en `npm run build` slagen.
- tests/teleport.test.mjs: 7 hardwarevrije tests (zie docs/VR.md).
- Browser: renderloop na de overstap naar `setAnimationLoop` getoond, geen consolefouten; VR-knop uitgeschakeld zonder headset (`navigator.xr` aanwezig, `immersive-vr` niet ondersteund).
- Niet geverifieerd: daadwerkelijke XR-sessie, controllerinput, schaalrig, Safari/Vision Pro.

## Versie 0.6 — Playwright (18 oktober 2026)

- `npm run test:e2e`: 6 van 6 geslaagd in ~52 s (systeem-Chrome, headless/SwiftShader). Eerste run had 3 mislukkingen door testfouten (verkeerde knoplabels, dubbelzinnige selector, 404 van de afwezige API als consolefout); aangepast, niet de app.
- Mutatiecontrole: selectierichting tijdelijk omgedraaid → selectiekadertest faalde; teruggezet.
- `npm test` (Node-tests) en `check`/`build`: zie hieronder bij de laatste run.
- Niet gedekt: zie docs/E2E.md.

## Versie 0.7 (19 oktober 2026)

- `npm test`: 122 tests geslaagd (render 11, package 6, isometric 5 nieuw). Wachtrijtests gebruiken een nep-runner die echte PNG-bestanden schrijft; **Blender is niet gestart.**
- `npm run blender:dry`: job + 48 kB GLB gebouwd en gevalideerd; `render_worker.py` compileert.
- e2e: pakket-roundtrip en beschadigd-pakkettest; de eerste leverde een echte fout op (zip-detectie op bestandsnaam), hersteld met detectie op magic bytes.
- PDF: isometrische pagina bekeken via Poppler-render: rechte assen, schaal 1:100, geen verborgen-lijnverwijdering.
- Niet geverifieerd: alles wat Blender zelf doet, rendertijden, panelen-emissie in Blender.

## Versie 0.8 (19 oktober 2026)

- `npm test`: 137 tests (routing 8, knowledge 7 nieuw). Alles met nepprovider; geen echte API-aanroep of kosten.
- `npm run knowledge:check` geslaagd op het echte PLAYBOOK.md. Een eerste, te losse lintregel (elke "niet" schakelde de controle uit) is aangescherpt met regressietests.
- Niet geverifieerd: modelkeuze tegen echte promptkwaliteit/kosten, `retrieveContext` in een echte promptketen.

## Versie 0.9 — GLB-import (19 oktober 2026)

- Nieuwe Node-tests: assets (13), package (+3). Gebruiken echte GLB's uit de Three.js-exporter; containerfouten met handgebouwde GLB's.
- e2e (2 nieuw): import met eenhedenkeuze en verplichte herkomst, decoratief buiten de Excel-onderdelenbladen, herstel na herladen uit IndexedDB, en pakketroundtrip na het wissen van de assetopslag.
- Handmatig bekeken in Chrome: model verschijnt op de vloer met eigen kleuren; bibliotheeklay-out had een overlap die is hersteld.
- Niet geverifieerd: grote modellen/prestaties, modellen met textures in de browser, Safari/Firefox, IndexedDB-quota.

## Versie 1.0 — assembly's (19 oktober 2026)

- tests/assemblies.test.mjs (15, incl. serveropslag en revisieherstel): gesloten-vorm-posities bij plaatsen met draaiing, rigide verplaatsing/draaiing is geen afwijking, afwijkingen benoemd, reset/apply/unique, weigeringen, validatie, groepsbewerkingen.
- e2e: opslaan, tweede exemplaar plaatsen, lid verwijderen, afwijking tonen, terugzetten, uniek maken, herstel na herladen.
- Een eerste e2e-fout kwam doordat een scripted wijziging na formattering niet was toegepast (selectieherstel); daarna daadwerkelijk toegepast en getest.
- Niet geverifieerd: grote assembly's/prestaties, samenspel met AI-voorstellen, serveropslag-roundtrip met assembly's in de browser.

## Versie 1.1 — eerste echte Blender-run (19 oktober 2026)

- Blender 5.1.1 (build 2026-04-14), macOS, headless: `npm run blender:dry -- --run` en `npm run blender:orientation` geslaagd; resultaten in docs/BLENDER.md.
- Gevonden: gezichtsveld horizontaal in plaats van verticaal; hersteld en opnieuw gerenderd. Haze-gedrag vastgelegd (alleen demping).
- Niet getest: wachtrij met echte Blender, Cycles, 4K, andere Blender-versies, Blender-MCP.
