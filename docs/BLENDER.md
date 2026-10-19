# Blender-renderwachtrij (eerste echte run gedaan)

Status: de wachtrij is getest met een nep-runner. **De worker is op 19 oktober 2026 voor het eerst echt uitgevoerd op Blender 5.1.1 (macOS, headless)**; zie 'Resultaten eerste run'. De wachtrij is nog niet met een echte Blender als runner end-to-end doorlopen (HTTP → wachtrij → Blender).

## Onderdelen

| Bestand | Rol |
| --- | --- |
| `src/renderSpec.ts` | Opdrachtschema, bouwt de job uit project + GLB, valideert strikt (cm → m, assen Studio → Blender) |
| `server/renders.ts` | SQLite-wachtrij (`render_jobs`), herstart-veilig, max. 3 pogingen, verificatie van uitvoer op schijf, Blender-runner |
| `blender/render_worker.py` | Draait *in* Blender: GLB importeren, wereld/licht per stijl, camera's, renderen, SHA-256 van uitvoer |
| `src/RenderPanel.tsx` | Exporteer → Blender-render: stijl, camera's, resolutie, engine, voortgang, download |
| `scripts/blender-dry-run.mjs` | `npm run blender:dry`: bouwt echte job + GLB, valideert, syntaxiscontrole; `-- --run` voert Blender uit |

## Stroom

1. De editor slaat op en exporteert dezelfde GLB als de GLB-export; de job bevat de checksum.
2. `POST /api/projects/:id/renders` (bewerkingslock + huidige revisie vereist) → server controleert checksum, GLB-header en schema.
3. De service pakt jobs één voor één; zonder `BLENDER_PATH` blijven ze in de wachtrij.
4. Het rapport van de worker wordt niet vertrouwd: bestanden moeten bestaan, een PNG-header hebben en de checksum moet kloppen.
5. Mislukking: poging 1 en 2 gaan terug in de wachtrij, poging 3 beëindigt de job met het foutbewijs (drie-pogingenregel). Een herstart zet lopende jobs terug, tot dezelfde limiet.

## Opzetten

1. Blender 4.2 of nieuwer installeren (getest: 5.1.1). Pad op macOS: `/Applications/Blender.app/Contents/MacOS/Blender`.
2. In `.env`: `BLENDER_PATH=<dat pad>` en de server starten met `npm run dev:env` (of `npm run start:env`). Zonder dit blijven opdrachten in de wachtrij.
3. Zonder server uitproberen:

```bash
export BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender
npm run blender:dry -- --run        # demo-kamer, Immersief, 640×360
npm run blender:orientation         # asymmetrische scène + bounding boxes + PNG
```

De Blender-MCP (`mcp__Blender__*`) praat met een **open Blender-venster** met de MCP-add-on aan en de server gestart (poort 9876); die is voor het bekijken van een scène in de interface. De headless worker heeft hem niet nodig. Tijdens de eerste run stond er geen Blender-venster open, dus de MCP is niet gebruikt.

## Resultaten eerste run (Blender 5.1.1)

| Controle | Uitkomst |
| --- | --- |
| Worker start, importeert GLB, rendert PNG, schrijft `STUDIO_RESULT` | Ja |
| Engine-id | `BLENDER_EEVEE` (5.x gebruikt weer deze naam; de code accepteert ook `BLENDER_EEVEE_NEXT`) |
| Eenheden | Metrisch, schaal 1.0; bounding boxes in meters (tafel 140 cm breed = 1,4 m) |
| Asmapping | Studio z → Blender −y bevestigd met bounding boxes (tafel op z = +100 cm staat op y = −1,0 m; truss op z = −100 cm op y = +1,0 m) |
| Links/rechts | Bevestigd: bij een camera op −x die naar +x kijkt staat het object op +z rechts in de render |
| Panelen gloeien in Presentatie/Immersief | Ja: 16 panelen in de demo kregen emissie (de `kind = panel` uit de GLB-extras komt als custom property aan) |
| Gezichtsveld | **Gevonden en hersteld:** Blender paste de 42° horizontaal toe, de editor verticaal; nu `sensor_fit = VERTICAL` |
| Hoekcanvas-demo, Immersief | De hoek van 90° rendert als verwacht (linkerwand, hoekpaneel, rechterwand) |
| Haze | Bij 0,004 (standaard) geen zichtbaar effect; bij 0,02 lichte demping op afstand; bij 0,25 een volledig zwart beeld. Het werkt dus alleen als afstandsdemping; er is **geen lichtverstrooiing/bundels** te zien en emissieve panelen verlichten de haze niet. De waarde moet op het oog worden afgesteld |
| Dichte belichting in Immersief | Frames en deuren zijn bijna zwart; alleen de glooiende panelen zijn zichtbaar. Dat is de stijl, maar hij is donkerder dan de browserpreview |

## Nog open

- [ ] Wachtrij end-to-end met echte Blender als runner (server met `BLENDER_PATH`, opdracht via het paneel).
- [ ] Rendertijd en geheugen op 1920×1080 en 4K, en met Cycles (niet geprobeerd).
- [ ] Haze afstellen of vervangen door lichtbronnen met volumetrische kegels.
- [ ] Vergelijking naast de browserpreview (kleur, helderheid) en een Blender 4.2/4.5-controle.
- [ ] Oudere Blender-versies; Linux/Windows.

## Bewust niet gedaan

Media/video op panelen in Blender, line-art/Freestyle, Blender-assemblage van aangepaste onderdelen, STEP-export, annuleren van een lopende render, een aparte workerprocesmodus, authenticatie van de renderdownloads buiten sessie/CSRF.
