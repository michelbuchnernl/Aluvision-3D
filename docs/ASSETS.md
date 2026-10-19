# GLB-import als catalogusadapter (versie 0.9)

Importeer een binair GLB als bibliotheekonderdeel: **Bibliotheek → GLB-model importeren**.

## Wat een import wel en niet is

- Status altijd **"geïmporteerd, niet geverifieerd"**, eigen code `IMP-<8 hex van SHA-256>`. Nooit een fabrikant-SKU, certificering of draagkracht.
- **Herkomst is verplicht** (3–500 tekens); licentie is optioneel. Beide staan in het project en in de Excel (blad *Geïmporteerd*).
- **Eenheden worden niet geraden.** glTF is per specificatie meter, maar je kiest m/cm/mm zelf en ziet de afmeting in cm vóór je toevoegt; een zijde < 1 cm of > 50 m geeft een waarschuwing.
- Het model wordt op de vloer gezet en gecentreerd (positie = midden onderzijde, zoals overal) en op de gedeclareerde `size` gebracht; harde ruimtegrenzen gelden dus ook voor geïmporteerde onderdelen. Het formaat van de definitie wijzigen rekt het model uit.

## Rol: decoratief of eigen onderdeel

| Rol | In BOM/Excel "Onderdelen" en "Exemplaren" | Overig |
| --- | --- | --- |
| Decoratief | **Nee.** Eigen blad *Decoratief*; in de BOM-dialoog staat het aantal buiten de lijst | Telt wel mee voor ruimtegrenzen, selectie, GLB en PDF-aanzichten |
| Eigen onderdeel | Ja, status "Geïmporteerd · niet geverifieerd" | Zelfde |

Excel controleert vóór het schrijven: structureel + decoratief = alle exemplaren in de scène.

## Controles op het bestand (voordat er geometrie wordt geparseerd)

GLB-header, versie 2, lengte, JSON-blok; maximaal 25 MB, 500.000 driehoeken, 20.000 knopen; geen externe `uri`'s (buffers en afbeeldingen); Draco, Meshopt, Basis/WebP-extensies worden geweigerd in plaats van stil weggelaten; platte of lege geometrie wordt geweigerd. Camera's, lampen, animaties en skins worden genegeerd en gemeld.

## Opslag en transport

- Het project bewaart alleen metadata. De bytes staan **content-addressed** (SHA-256) in IndexedDB van deze browser en in het sessiegeheugen.
- **Projectpakket (.zip)** bevat `assets/<sha256>.glb`; bij heropenen moet elke bestandsnaam de hash van de inhoud zijn en in het manifest staan. Ontbrekende modellen worden gemeld.
- Een model dat niet geladen is, verschijnt als **oranje draadkader van de juiste maat**, nooit onzichtbaar. GLB-export en Blender-render weigeren dan met een duidelijke melding.
- De Node-server bewaart (nog) geen modelbytes: serverrevisies bevatten alleen metadata.

## Niet gedaan

Materiaalschildering van geïmporteerde modellen (eigen materialen blijven), FBX/OBJ/STEP/SKP-conversie, Trimble-3D-Warehouse-koppeling, serveropslag van assets, mesh-vereenvoudiging, verbindingspunten op geïmporteerde modellen.
