# AluVision-bibliotheek (versie 1.4)

De ontwerpbibliotheek is de lokale map `library/aluvision/` (GLB's uit de SketchUp 3D Warehouse van Aluvision Exhibits, geconverteerd met `scripts/library/`). De map is **git-ignored** (`/library/`) en wordt nooit gecommit, gepusht of in een pakket opgenomen; `tests/library.test.mjs` bewaakt dat.

## Wat de app nu doet

- **De synthetische onderdelen en demo's zijn uit het product.** De bibliotheek toont alleen de AluVision-modellen; een nieuw ontwerp is een lege ruimte (8 × 4 × 3 m) zonder onderdelen. (De oude synthetische definities staan nog in de code voor eerder opgeslagen projecten en voor testfixtures; `window.__studio.load(...)` laadt ze in browsertests. Ze zijn nergens meer te kiezen.)
- **Bibliotheek → een model kiezen** haalt het GLB van de lokale server, controleert de SHA-256 uit het manifest, parseert het en voegt een definitie plus één exemplaar toe. Zoeken werkt op naam en op de beschrijving uit de Warehouse (vaak artikelnummers). "Toon geweigerde" laat zien welke 33 niet kunnen en waarom.
- Projecten bewaren alleen **een verwijzing**: bestandsnaam, SHA-256, herkomst, Warehouse-id en beschrijving. De bytes worden bij het openen opnieuw van de server gehaald en op checksum gecontroleerd; een gewijzigd bestand wordt geweigerd (oranje draadkader van de juiste maat + melding).
- Status overal: **"Geïmporteerd · niet geverifieerd"**, code `IMP-<8 hex>`, herkomst "Aluvision Exhibits, SketchUp 3D Warehouse: <url>". De app beweert geen artikelnummers, leverbaarheid, certificering of draagkracht; de tekst uit de Warehouse-beschrijving wordt alleen als data doorgegeven.

## Bouwen van het manifest

```bash
python3 scripts/library/build_manifest.py     # schrijft library/aluvision/manifest.json (strikte JSON)
```

Huidige uitkomst: 555 bruikbaar, 33 geweigerd (29 groter dan 25 MB, 4 plat of leeg), 10 zonder GLB. De server leest `manifest.json` (pad via `STUDIO_LIBRARY_DIR`, standaard `library/aluvision`) en serveert alleen bestanden met status *ready* waarvan de grootte nog klopt.

API: `GET /api/library` (lijst) en `GET /api/library/files/<bestand>` (GLB, met `X-Content-SHA256`).

## Beperkingen

- **De bibliotheek staat op de server**: zonder `npm run dev` of `npm start` is de lijst leeg en worden bestaande bibliotheekmodellen als oranje kader getoond.
- **Pakketten bevatten geen bibliotheekmodellen**, alleen een lijst (`libraryAssets`: bestand + controlesom). De ontvanger heeft dezelfde bibliotheek nodig.
- **GLB-export en Blender-render van scènes met veel of zware modellen** lopen tegen de grens van 8 MB per scène-GLB. Voor de bibliotheek is een renderroute nodig die de bestanden op de server koppelt; die bestaat nog niet.
- De 29 modellen boven 25 MB (hele standen) en 4 lege/platte modellen worden geweigerd. Een Warehouse-afmeting en de gemeten afmeting verschillen soms een paar procent (deuren met een geopend blad); de app meldt pas boven 5 %.
- Rechten: de app controleert niet of je de modellen mag gebruiken of verspreiden. Dat blijft jouw verantwoordelijkheid.
