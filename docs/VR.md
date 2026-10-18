# Alleen-kijken VR-wandeling (versie 0.5)

Knop met bril-icoon rechtsonder in de ontwerpruimte. Er is geen bewerking in VR.

## Bediening

- Duw de thumbstick van een controller naar voren om te richten; een ring op de vloer toont het doel (groen = geldig, rood = ongeldig). Laat los om te teleporteren.
- De start staat op de vrije vloerlocatie die het dichtst bij het midden ligt.
- Eenheid: de scène is in cm, XR in meters. De camerarig wordt ×100 geschaald; nabij/ver-vlak en mist worden daarop aangepast.

## Regels (src/teleport.ts, zonder hardware getest)

- Doel ligt altijd op de vloer (y = 0): de controllerstraal snijdt het vlak y = 0; omhoog richten geeft geen doel; max. 10 m.
- Minimaal 25 cm vanaf wanden en vanaf het grondvlak van zichtbare objecten die in lichaamshoogte (5–180 cm) reiken. Geroteerde objecten worden langs hun werkelijke oriëntatie getoetst. Verborgen of hoog hangende objecten blokkeren niet.
- Bij teleporteren komt het hoofd (niet de rig-oorsprong) boven het doel, dus room-scale offset klopt.
- Een headset zonder `local-floor` wordt geweigerd, omdat de vloerhoogte anders fout zou zijn.

## Niet gedaan / niet geverifieerd

- Niet op een echte headset of WebXR-emulator geprobeerd: sessiestart, controllerinvoer en schaalrig zijn gebouwd volgens de three.js-API maar onbewezen. De puur-logische delen (straal, geldigheid, hoofdoffset, stick-hysterese, startpunt) hebben 7 tests.
- Geen snap-turn, geen boog-teleport, geen handvolgen, geen gedeelde sessie.
- Niet getest in Safari/Vision Pro.
