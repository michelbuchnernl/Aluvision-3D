# AluVision-bibliotheek in de app (versie 1.5)

Dit document beschrijft hoe de studio de bibliotheek gebruikt. Hoe de GLB's uit de 3D Warehouse zijn gemaakt staat in [LIBRARY.md](LIBRARY.md).

De ontwerpbibliotheek is de lokale map `library/aluvision/` (GLB's uit de SketchUp 3D Warehouse van Aluvision Exhibits, geconverteerd met `scripts/library/`). De map is **git-ignored** (`/library/`) en wordt nooit gecommit, gepusht of in een pakket opgenomen; `tests/library.test.mjs` bewaakt dat.

## Wat de app nu doet

- **De synthetische onderdelen en demo's zijn uit het product.** De bibliotheek toont alleen de AluVision-modellen; een nieuw ontwerp is een lege ruimte (8 × 4 × 3 m) zonder onderdelen. (De oude synthetische definities staan nog in de code voor eerder opgeslagen projecten en voor testfixtures; `window.__studio.load(...)` laadt ze in browsertests. Ze zijn nergens meer te kiezen.)
- **Bibliotheek → een model kiezen** haalt het GLB van de lokale server, controleert de SHA-256 uit het manifest, parseert het en voegt een definitie plus één exemplaar toe. Zoeken werkt op naam en op de beschrijving uit de Warehouse (vaak artikelnummers). "Toon geweigerde" laat zien welke 33 niet kunnen en waarom.
- Projecten bewaren alleen **een verwijzing**: bestandsnaam, SHA-256, herkomst, Warehouse-id en beschrijving. De bytes worden bij het openen opnieuw van de server gehaald en op checksum gecontroleerd; een gewijzigd bestand wordt geweigerd (oranje draadkader van de juiste maat + melding).
- Status overal: **"Geïmporteerd · niet geverifieerd"**, code `IMP-<8 hex>`, herkomst "Aluvision Exhibits, SketchUp 3D Warehouse: <url>". De app beweert geen artikelnummers, leverbaarheid, certificering of draagkracht; de tekst uit de Warehouse-beschrijving wordt alleen als data doorgegeven.

## Klassen en voorbeelden (versie 1.5)

De bibliotheek is in 16 logische klassen verdeeld op basis van de modelnamen (`scripts/library/classify.py` → `library/aluvision/classes.json`). De indeling is een praktisch hulpmiddel om te bladeren, geen officiële Aluvision-productindeling; de letters in standcodes (C, L, P, S) blijven staan zoals in de naam, hun betekenis is niet geverifieerd.

| Klasse | Inhoud |
| --- | --- |
| Standconcepten & collecties | complete standontwerpen (6x3P 001…, per maat) en themacollecties |
| QuiXy-modules | wanden, balies, bogen, opslag, lightboxen |
| Flexbox, Flexdeck & etages | meerlaagse constructies, dekken, trappen, leuningen |
| Vloeren & podia | Step-podia, hoekmodules, hellingen, subfloor |
| LED-schermen | Hi-LED panelen, gebogen en hoekmodules, wiggen |
| Verlichting | spots, LED-lijnen, rails, drivers |
| Deuren & glas | deuren, schuifdeuren, ramen, glas |
| Frames & profielen | frames, profielen, gebogen frames, hoekframes, Constru |
| Box-systemen | B-box, E-box, Ino/Sub/Super/Omni box |
| Verbindingen & klemmen | verbindingsknopen, joining sets, framekleminen, hoekverbindingen |
| Snelspanners & bevestiging | quick tighteners, pennen, schroeven, moeren, ogen |
| Afdekkingen & strips | covers, clips, panel strips |
| Voeten, bases & wielen | basisplaten, verstelbare voeten, wielen |
| Ophanging & versterking | rigging bars, ophangsets, plafond- en wandversterking |
| Balies, bars & meubilair | Bar-B, Benta!, Archie, Looping, Flex-it, Trans-it, iCon, Forester |
| Interieur & accessoires | folderhouders, kledingstangen, monitorsteunen, kabeldoorvoeren |

**Voorbeelden:** `blender/render_previews.py` rendert voor elk bruikbaar model een 256 × 256 PNG met transparante achtergrond (vaste driekwartsweergave van linksvoor-boven; geen echte oriëntatie) naar `library/aluvision/previews/`. Het script hervat waar het gebleven is en ruimt per model alleen de nieuwe datablokken op (een recursieve orphan-purge bleek op zware modellen te traag).

**In de app:** een klassenkeuzelijst boven de lijst, modellen onder kopjes van hun klasse (of subgroep binnen een gekozen klasse), met het voorbeeld als miniatuur. Voorbeelden komen via `GET /api/library/previews/<bestand>.png` met alleen de sessiecookie (een `<img>` kan geen tabheader meesturen).

**Galerij:** `python3 scripts/library/build_gallery.py` schrijft `library/aluvision/gallery.html`: alle modellen per klasse, met zoekveld en voorbeelden; open het bestand direct in een browser.

## Opnieuw opbouwen

```bash
python3 scripts/library/build_manifest.py                  # manifest.json (strikte JSON)
python3 scripts/library/classify.py --report               # classes.json; --report toont wat in 'Overig' valt
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python blender/render_previews.py -- library/aluvision # previews/ (hervatbaar)
python3 scripts/library/build_gallery.py                   # gallery.html
```

Aantallen komen uit het actuele manifest; de bibliotheek wordt door een conversiestap aangevuld en kan veranderen. De server leest `manifest.json` (pad via `STUDIO_LIBRARY_DIR`, standaard `library/aluvision`) en serveert alleen bestanden met status *ready* waarvan de grootte nog klopt.

API: `GET /api/library` (lijst met `classes`, `class`, `group`, `preview`), `GET /api/library/files/<bestand>` (GLB, met `X-Content-SHA256`) en `GET /api/library/previews/<bestand>.png`.

## Beperkingen

- **De bibliotheek staat op de server**: zonder `npm run dev` of `npm start` is de lijst leeg en worden bestaande bibliotheekmodellen als oranje kader getoond.
- **Pakketten bevatten geen bibliotheekmodellen**, alleen een lijst (`libraryAssets`: bestand + controlesom). De ontvanger heeft dezelfde bibliotheek nodig.
- **GLB-export en Blender-render van scènes met veel of zware modellen** lopen tegen de grens van 8 MB per scène-GLB. Voor de bibliotheek is een renderroute nodig die de bestanden op de server koppelt; die bestaat nog niet.
- Modellen boven 25 MB of zonder geometrie worden geweigerd (met reden zichtbaar). Een Warehouse-afmeting en de gemeten afmeting verschillen soms een paar procent (deuren met een geopend blad); de app meldt pas boven 5 %.
- Rechten: de app controleert niet of je de modellen mag gebruiken of verspreiden. Dat blijft jouw verantwoordelijkheid.
