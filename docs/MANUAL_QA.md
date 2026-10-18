# Eerste browseracceptatie — nog uitvoeren

Deze lijst is een testprocedure, geen verslag van geslaagde browserchecks.

1. Start met Node 24 via `npm ci` en `npm run dev`. Open localhost:4173 op dezelfde laptop. Controleer de console op runtimefouten en lege/zwarte WebGL-weergave.
2. Bevestig 36 exemplaren in een 800 × 400 × 300 cm scène; controleer dat tafelpootjes en frames zichtbaar zijn en de projector op de tafel staat.
3. Probeer orbit, Shift-pan, scroll, top/front/side/eye views en fit view. Bekijk alle drie presets. Schaduwen, transparantie en clipping moeten visueel worden beoordeeld.
4. Voeg een frame toe. Selecteer X=350 cm en daarna X=351 cm: de eerste positie past exact, de tweede geeft rechts 1 cm overschrijding. Het object mag niet automatisch verschuiven.
5. Draai een frame naar 90° en zet Z=160 cm: de controle moet 10 cm overschrijding melden. Undo en redo moeten exact herstellen.
6. Dupliceer een frame. Wijzig de gedeelde breedte: beide moeten veranderen. Maak één uniek en wijzig daarna die breedte: het andere moet gelijk blijven. Test materialen op exemplaar versus definitie.
7. Vergrendel object en laag; gizmo, delete, dupliceren en gedeelde definitiewijziging mogen de vergrendeling niet omzeilen.
8. Klik met Shift en test selectiekaders in beide richtingen. Groepeer meerdere onderdelen; een klik in de viewport selecteert de groep, waarna verplaatsen/roteren de onderlinge posities moet behouden.
9. Verplaats de verhoogde projector horizontaal zonder vrije hoogte. Y moet behouden blijven. Schakel vrije hoogte in en verplaats Y expliciet. Test apart de vloeractie.
10. Bewaar een herstelpunt. Exporteer JSON, wijzig de scène, importeer dezelfde JSON en vergelijk transforms, aantallen, unieke definities, groepen en materialen. Test ongeldig JSON: huidige scène blijft staan.
11. Herlaad voor autosave en herstel een oude versie. Open een tweede tab: slechts één tab moet schrijven. Neem over: laad eerst het laatst opgeslagen project. Sluit de actieve tab en controleer vrijgave na maximaal 15 seconden.
12. Bewaar een orthografische camera na zoomen, verander het standpunt en herstel de camera. Framing en zoom moeten gelijk blijven.
13. Exporteer XLSX en open in Excel of LibreOffice. Onderdelen- en exemplaaraantallen moeten gelijk zijn aan de scène. Controleer unieke definities en een eigen materiaal.
14. Exporteer PDF. Controleer drie aanzichten, maatlijnen, actuele revisie en browserbeeld. Print op 100% als je de schaalaanduiding gebruikt. Een 800 cm maat op schaal 1:50 meet 160 mm.
15. Controleer smalle schermbreedte, touchbesturing, panelen en exportmenu. Test op een fysieke iPhone/Safari. Dit kan niet worden vervangen door alleen een responsieve CSS-inspectie.

Noteer apparaat, browser, testdatum en werkelijk resultaat in TEST_RESULTS.md. Herstel geobserveerde defecten vóór uitbreiding met AI of Blender.
