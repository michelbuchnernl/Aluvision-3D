# Gedeelde assembly-definities (versie 1.0)

Een groep opslaan als **assembly** werkt zoals een SketchUp-component: één definitie, meerdere exemplaren.

## Gebruik

1. Groepeer onderdelen en selecteer de groep (alle leden geselecteerd) → Eigenschappen → **Opslaan als assembly**. Deze groep wordt het eerste exemplaar.
2. Bibliotheek → **Assembly's** → `+` plaatst een nieuw exemplaar in het midden van de ruimte (je verplaatst het zelf; liggen onderdelen buiten de ruimte, dan meldt de controle dat, er wordt niets verschoven).
3. Wijzig één exemplaar (verplaats een lid, ander materiaal, lid erbij of weg). Het paneel toont dan **Wijkt af van de definitie** met de exacte afwijkingen in cm.
   - **Toepassen op definitie**: dit exemplaar wordt de nieuwe definitie. Exemplaren die gelijk waren aan de *oude* definitie volgen; exemplaren met eigen afwijkingen of vergrendelde onderdelen worden **overgeslagen en bij naam gemeld**.
   - **Terugzetten naar definitie**: verplaatst terug, herstelt ontbrekende leden, verwijdert extra leden. Geweigerd bij vergrendelde onderdelen en wanneer er geen herkenbaar lid meer is (er wordt dan niets verwijderd).
   - **Uniek maken**: dit exemplaar krijgt een eigen kopie van de definitie ("… · uniek"); latere wijzigingen bereiken de rest niet meer.

## Hoe het werkt

- Leden zijn gewone objecten in de scène (met `assemblyKey`), dus BOM, ruimtegrenzen, selectie, GLB, PDF en Excel werken ongewijzigd. De BOM scheidt exemplaren op groepsnaam ("Tafelset", "Tafelset 2").
- De definitie slaat leden op relatief aan de *voetafdruk-midden en vloer* van de groep (positie, draaiing, definitie, materiaal, laag).
- **Oorsprong en draaiing van een exemplaar worden uit zijn leden afgeleid** (eerste nog aanwezige lid). Het hele exemplaar verplaatsen of draaien is daarom geen afwijking; er hoeft geen eigen transformatie te worden bijgehouden.
- Afwijking wordt nooit stil overschreven; alleen exemplaren die exact gelijk waren aan de oude definitie volgen een wijziging.
- Dupliceren van een hele assembly-groep geeft een extra exemplaar (gelijk aan de definitie); één lid dupliceren maakt een gewoon object. Groep opheffen of een lid in een subgroep zetten koppelt het los.
- Projectvalidatie weigert onbekende assembly's, verweesde sleutels en dubbele sleutels binnen één groep.

## Beperkingen (bewust)

- Een assembly kan geen subgroepen bevatten; opslaan en toepassen weigeren dat met een melding.
- Vergrendelde onderdelen blokkeren opslaan, terugzetten en meevolgen.
- Geen apart bewerken van de definitie los van een exemplaar, geen assembly's over projecten heen, geen verbindingen/sockets als deel van de definitie, geen AI-bewerkingen die assembly-bewust zijn.
