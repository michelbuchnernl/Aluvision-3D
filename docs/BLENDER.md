# Blender-renderwachtrij (voorbereid, niet op Blender geprobeerd)

Status: **gebouwd en getest met een nep-runner; Blender zelf is nooit gestart.** `blender/render_worker.py` is alleen syntaxis-gecontroleerd (`python3 -m py_compile`).

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

## Eerste echte test (later)

```bash
export BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender
npm run blender:dry -- --run
```

Controleer daarna handmatig, want niets hiervan is bewezen:

- [ ] Start de worker zonder Python-fout? (Blender-versie in `result.json`.)
- [ ] Staat het model rechtop, juiste kant op, in meters? (GLB-import zet Y-up om naar Z-up; camera's gebruiken `x, −z, y`.)
- [ ] Kloppen camerastanden en brandpuntshoek met de browser?
- [ ] EEVEE-engine-id: `BLENDER_EEVEE_NEXT` (4.2+) of `BLENDER_EEVEE`; werkt `taa_render_samples`?
- [ ] Gloeien de projectiepanelen in Presentatie/Immersief (`kind = panel` als custom property uit de GLB-extras)? Zo niet, pas `apply_panel_emission` aan.
- [ ] Haze: wereldvolume werkt in EEVEE Next; in oudere EEVEE kan een volume-instelling nodig zijn.
- [ ] Rendertijd en geheugen op de beoogde resolutie.

## Bewust niet gedaan

Media/video op panelen in Blender, line-art/Freestyle, Blender-assemblage van aangepaste onderdelen, STEP-export, annuleren van een lopende render, een aparte workerprocesmodus, authenticatie van de renderdownloads buiten sessie/CSRF.
