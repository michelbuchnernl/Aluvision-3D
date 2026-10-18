# Meten, demo-uitlijning en GLB — versie 0.3

Deze functies zijn in de code gebouwd en headless getest. Echte bediening en visuele weergave moeten nog volgens MANUAL_QA worden gecontroleerd.

## Afstand meten

Klik het liniaalicoon in de verticale werkbalk of druk **T**. Klik twee punten op zichtbare onderdeelgeometrie; zonder onderdeelhit wordt de vloer binnen de ruimte gebruikt. Het meetpaneel toont de 3D-afstand, horizontale afstand en getekende verschillen ΔX/ΔY/ΔZ, allemaal in cm. De meetlijn en eindpunten worden in de viewport getekend.

Coördinaten kun je exact aanpassen in het meetpaneel; commit met Enter of door het veld te verlaten. Een derde klik begint een nieuwe meting. Wissen of sluiten verandert geen projectgeometrie, revisie of undo-historie. Metingen zijn tijdelijk en worden niet in project-JSON opgeslagen. Dit is puntmeting, zonder automatische hoek-/randsnapping of blijvende maatannotaties.

## Uitlijnvlakken verbinden

1. Selecteer één onderdeel of een gesloten groep en klik het verbindingsicoon of **Uitlijnvlakken verbinden** in de inspector.
2. Kies een brononderdeel binnen de selectie en een bronvlak. Kies vervolgens een zichtbaar doel buiten de selectie en een doelvlak. IDs helpen onderdelen met dezelfde naam onderscheiden.
3. Kies expliciet of rotatie om Y en hoogtewijziging zijn toegestaan. Kantelen om X/Z is nog niet ondersteund.
4. **Bekijk uitlijning** berekent een kandidaat en toont die in de viewport. De hele selectie draait/verplaatst als één geheel, inclusief verborgen kinderen. Het ontwerp is nog niet gewijzigd.
5. Controleer verplaatsing, rotatie, harde grensfouten en eventuele waarschuwingen. **Toepassen** valideert opnieuw tegen de actuele basis en maakt één undo-stap. Een gewijzigde basis, verloren schrijfrecht of overschrijding blokkeert de wijziging. **Annuleren** bewaart de oorspronkelijke scène.

Vergrendelde kinderen blokkeren de hele selectie. Een doel mag vergrendeld zijn: alleen de selectie beweegt. Bron en doel moeten een gelijk profiel en tegengestelde normaal hebben. Een uitlijnpunt kan maar één vastgelegde verbinding hebben. Raster-snap blijft een afzonderlijke gizmo-optie; dit is expliciete vlakuitlijning, nog geen automatisch magnetisch snapping tijdens slepen.

**Verbinding vastleggen** bewaart een controlemarkering tussen twee uitlijnpunten. De markering is geen bewegingsconstraint. Een latere verplaatsing of maatwijziging blijft mogelijk en geeft een waarschuwing als punten meer dan 0,1 cm uiteen liggen, normaalrichtingen afwijken of profielen verschillen. Er is geen stille geometriecorrectie. Verwijderen van een object ruimt bijbehorende verbindingen op. Dupliceren kopieert alleen verbindingen waarvan beide eindpunten worden gedupliceerd.

Importeer `examples/connected-demo-frames.json` voor twee uitgelijnde frames met een vastgelegde verbinding. Verplaats één frame binnen de groep om de waarschuwing te zien.

## Metadata en grenzen

Definities kunnen optioneel `sockets` bevatten. Elk socket heeft id, naam, profiel, een parametische positie en een kardinale normaal. X/Z-posities liggen tussen −0,5 en 0,5; Y tussen 0 en 1. De positie moet op het door de normaal aangewezen omhullingsvlak liggen. Daardoor volgen uitlijnpunten maatwijzigingen van een gedeelde definitie.

Ontbreekt metadata in een oud project, dan gebruikt de app zes virtuele omhullingsvlakken met profiel `demo-envelope`. Dit zijn **geen fabrikantconnectoren**, garanties over bevestiging of draagkracht, en ook geen bewijs dat de werkelijke mesh op het punt materiaal heeft. Alle onderdelen blijven synthetisch. Metadata is via project-JSON importeerbaar; er is nog geen fabrikantcatalogusadapter of socket-editor.

## GLB exporteren

Kies **Exporteer → 3D-model**. Standaard exporteert GLB alleen effectief zichtbare onderdelen. Vink **GLB inclusief verborgen onderdelen** bewust aan om die ook mee te nemen; externe viewers tonen ze dan als geometrie. De oorspronkelijke zichtbaarheid blijft als metadata bewaard. BOM/XLSX blijven alle exemplaren tellen, zodat een zichtbare-only GLB minder exemplaren kan bevatten.

GLB gebruikt glTF 2.0 met meters; de Studio bewaart centimeters en converteert expliciet met factor 0,01. De exporter gebruikt dezelfde procedurale geometrie en bewaart groepen, instance-/definition-IDs, materiaal en eenvoudige verbindingsmetadata als extras. Geen vloer, raster, maatlabels, lichtpresets of tijdelijke meting wordt als projectgeometrie toegevoegd. Export muteert het ontwerp niet en is uitgeschakeld tijdens een preview.

Het bestand bevat geen externe geometriebestanden of textures. Dit is geometrie-uitwisseling, geen verliesloze Studio-projectback-up en geen fabricage-CAD. Gebruik JSON voor verder bewerken met volledige app-staat. GLB-import in de Studio, media-assets en een asset-zip met checksums ontbreken nog.

Referenties: [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) en [Khronos glTF-specificatie](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html). Binair exporteren en opnieuw laden zijn getest zonder WebGL; externe viewer- en Blenderacceptatie blijven open.
