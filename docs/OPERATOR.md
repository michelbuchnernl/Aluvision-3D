# Operatormodus: Claude ontwerpt via de browser (zonder API-sleutel)

Er is **geen Anthropic API-sleutel** nodig en er worden geen API-kosten gemaakt. In plaats van het Claude-paneel van de app (dat een sleutel en betaalde aanvragen vraagt en standaard uit staat) bouwt de assistent die met jou meekijkt het ontwerp rechtstreeks in de draaiende app, met dezelfde gecontroleerde bewerkingen. Dat werkt alleen zolang deze sessie actief is; de app zelf krijgt er geen autonome AI door.

## Gebruik

1. Start de server (`npm run dev`) en open **http://127.0.0.1:4173/?operator=1**.
2. Geef een opdracht in het gesprek: tekst, een schets of foto, en/of namen of ID's van modellen (bestandsnaam, 3D-Warehouse-id of naam uit de bibliotheek), en een ID van een bewaard serverproject als je daarmee verder wilt.
3. De assistent zoekt modellen, kiest posities in centimeters, voert de bewerkingen uit en kijkt in de browser of het klopt; jij ziet het live en stuurt bij.

Afbeeldingen: een foto geldt als inspiratie, tenzij je zegt dat het een letterlijke plattegrond is; maten die je erbij schrijft gaan altijd voor. Ontbrekende of tegenstrijdige maten leiden tot een vraag, niet tot een gok.

## Wat de brug doet (`window.studioOperator`, alleen met `?operator=1`)

| Aanroep | Doel |
| --- | --- |
| `library(zoekterm, klasse, max)` | zoekt in de AluVision-bibliotheek op naam of beschrijving (artikelnummers) |
| `ensureModel(verwijzing)` | haalt een model (bestandsnaam, Warehouse-id of unieke naam) van de server, controleert de checksum en maakt een definitie; bij meerdere treffers komt er een kandidatenlijst, niet een gok |
| `apply({summary, questions, operations})` | past een voorstel **atomair** toe: toevoegen, verplaatsen/draaien, verwijderen, uniek maken, formaat, materiaal, ruimteafmetingen |
| `scene()` | compacte weergave: ruimte, objecten (id, positie, draaiing, maat) en definities |
| `newDesign(ruimte?)` | lege ruimte, optioneel met afmetingen |
| `openServerProject(id)` | opent een op de server bewaard project |
| `view(..)`, `preset(..)`, `fit()` | camera, weergavestijl, passend in beeld |

## Veiligheid

- Dezelfde regels als het Claude-paneel (`previewProposal`): een voorstel met een fout, bijvoorbeeld een onderdeel buiten de ruimte, wordt **niet** toegepast en er verandert niets (geen deels toegepaste bewerking). Er wordt nooit stilzwijgend iets verschoven of verkleind.
- Openstaande vragen blokkeren het toepassen. Vergrendelde onderdelen worden niet gewijzigd.
- Bibliotheekmodellen blijven **"geïmporteerd, niet geverifieerd"**; de brug claimt geen artikelnummers, leverbaarheid of draagkracht.
- De brug staat alleen aan met `?operator=1` en werkt alleen in de pagina die jij zelf opent.

Getest in de browser tegen de echte server en bibliotheek: `e2e-render/operator.spec.mjs` (zoeken, dubbelzinnigheid, toevoegen, toepassen, weigeren buiten de ruimte, vragen, onbekende id's, project openen op ID).
