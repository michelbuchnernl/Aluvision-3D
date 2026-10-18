# Media en projectiecanvas (versie 0.4)

Een **projectiecanvas** legt één beeld of video over een geordende reeks projectiepanelen, inclusief een 90°-hoek.

## Hoe het werkt

- Het canvas is een *uitgerolde* wandreeks in centimeters. `u` loopt in fysieke cm langs de panelen, gezien vanuit de ruimte (kijkrichting = naar de wand toe, rechts = rechts).
- Elk paneel krijgt zijn aandeel `[u0,u1] × [v0,v1]` op de binnenvlak van de box. Er is geen extra vlak en geen overschrijding van de fysieke omhulling.
- De volgorde komt uit de aansluiting van de zichtbare vlakranden (`chainSurfaces`, zoekafstand 15 cm). Panelen die niet aansluiten komen achteraan en worden gemeld.
- Elke naad krijgt een gemeten tussenruimte (cm) en hoek (°). Tussenruimte > 0,5 cm geeft een waarschuwing; een hoek geeft een informatieve melding: ontvouwen betekent dat het beeld in de hoek knikt, dus gelijke pixels zijn geen perceptueel naadloze projectie.
- Pixelmaat is expliciet (breedte × hoogte px). Niet-vierkante pixels op de wand (px/cm horizontaal ≠ verticaal) worden gemeld; de knop "Hoogte aanpassen voor vierkante pixels" lost dat op.
- Aanpassing: uitrekken, passend (zwarte randen) of vullend (snijdt bij). De berekening staat in `fitRect`.
- Eén offscreen canvas per projectiecanvas voedt één texture voor alle panelen; video is daardoor op alle wanden frame-synchroon.
- Het kalibratiepatroon is procedureel (rooster per 50 cm, paneelnummers, wandcentimeters, cirkel, diagonalen) en dient om UV-continuïteit te controleren.

## Opslag en beperkingen

- Het project bewaart alleen metadata (naam, pixelmaat, bytes, SHA-256, duur). Het bestand zelf blijft in het browsergeheugen van de sessie. Na herladen toont het paneel "media niet geladen" tot het bestand opnieuw gekoppeld wordt. Mediapakketten in de projectexport zijn nog niet gebouwd.
- De browserpreview schaalt het canvas naar maximaal 4096 px op de langste zijde; de ingestelde pixelmaat blijft bewaard.
- Geen geluid (video is gedempt), geen scrub-bediening, geen optische projectormodellering, geen achterprojectie/spiegeling.
- Geteste hoek: alleen vlakke wanden en rechte hoeken in plattegrond. Andere hoeken worden gemeten maar niet visueel geaccepteerd.

## Demo

Nieuw / demo → **Laad hoekcanvas-demo (90°)**: 7 panelen op de lange wand plus 1 op de korte wand, één canvas van 800 × 250 cm (2400 × 750 px). Ook als `examples/corner-canvas-demo.json`.
