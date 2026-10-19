# Algemene ontwikkellessen

2026-10-18: controleer zichtbare procedurale geometrie tegen de declaratieve afmetingen, ook met kleine en smalle maatvarianten. Een uitstekende lens of te brede tafelpoot maakt uitsluitend schema-based bounds onbetrouwbaar.

2026-10-18: horizontaal verplaatsen mag een al verhoogd object niet op nulhoogte zetten. Vloeractie en vrij-Y zijn expliciete keuzes.

Dit zijn implementatie-inzichten uit dit project, geen structurele ontwerprichtlijnen voor beursconstructies.

2026-10-18: deel sessie-identiteit en tab-identiteit op: tabs delen cookies, maar moeten verschillende edit-leasehouders zijn. Koppel elke save aan zowel lease als revisie en negeer late projectresponses.

2026-10-18: een provider-timeout bewijst niet dat er niets is gefactureerd. Houd de reservering vast en maak reconciliatie expliciet; fake-provider-tests bewijzen de ledgerlogica, niet de echte factuur.

2026-10-18: groepen met uitsluitend geneste kinderen hebben geen directe instanceverwijzingen. Prune op alle descendants om parent chains niet per ongeluk te verwijderen.

2026-10-18: glTF gebruikt meters; projectdata blijft cm. Controleer de werkelijke geëxporteerde wereld-bounds na binair reload om een stille schaalfout niet uit alleen metadata af te leiden.

2026-10-18: uitlijnpreview moet losstaan van opslag en bij apply de actuele basis/locks opnieuw toetsen. Bewaar verbindingen voorlopig als controlemarkeringen, zonder een niet-geïmplementeerde constraint solver te suggereren.

2026-10-19: Node's TypeScript-stripmodus ondersteunt geen constructorparameter-properties (`private x` in de constructor); schrijf velden expliciet uit in code die ook onder `node --experimental-strip-types` draait.

2026-10-19: een e2e-test vond dat zip-import op bestandsnaam leunde; Playwright-downloads hebben een tijdelijke naam zonder extensie. Detecteer op inhoud.

2026-10-19: koppel code die een externe tool aanstuurt (Blender) aan een nep-runner die de echte uitvoerbestanden schrijft; zo bewijs je wachtrij, retry en verificatie zonder te claimen dat de tool zelf werkt.

2026-10-19: de classificatie "klein bewerking → goedkoopste model" is een heuristiek met zichtbare signalen en reden, geen gemeten kwaliteitsclaim; meet echte uitkomsten voordat je de drempels aanpast.

2026-10-19: een scripted edit die door een formatter-herformattering niet matcht, faalt stil; controleer na elke tekstvervanging dat de wijziging er echt staat (grep) voordat je erop debugt. Ik verloor hier twee debugrondes aan.
