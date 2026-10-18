# Architectuur en aannames

## Stack
React/TypeScript/Vite met directe Three.js-rendering. De scene is een typed JSON-model, onafhankelijk van het renderpad. `model.ts` bevat deterministische staat en validatie; `interaction.ts` bevat geteste projectieselectie en transformaties. `Viewport.tsx` beheert WebGL en controls; `main.tsx` de editor en browseropslag. `exports.ts` wordt pas bij export geladen.

Gebruik Node 24.x voor native TypeScript-stripping in tests. `npm run build` voert eerst TypeScript-controle uit. Vastgelegde dependencyversies staan in package-lock.json.

## Eenheden en geometrie
Centimeters blijven de canonieke eenheid in geheugen, JSON en exports. X/Z vormen het vloerplan; Y is omhoog. Instantieposities zijn het midden van de onderzijde. Rotatie is voorlopig alleen om de verticale Y-as. Een geroteerde AABB bepaalt begrenzing; overlap is slechts een indicatieve AABB-waarschuwing. Structurele frames/doorgangen zijn van overlapmeldingen uitgesloten om legitieme bekleding niet als fout te behandelen.

800 × 400 × 300 cm is de demo. 300 cm is geen bevestigde werkelijke hoogte. Alle delen zijn gegenereerde placeholders met DEMO-identifiers. Deze zijn geen AluVision-producten. Verbindingen, toleranties en draagkracht zijn niet gemodelleerd.

## Componentsemantiek
Instances verwijzen naar een gedeelde definitie met afmetingen en standaardmateriaal. `Maak uniek` kloont de definitie, niet alleen de instantie. Materiaaloverrides op een instantie blijven staan als het definitiemateriaal verandert. Gedeelde definitiewijzigingen worden geblokkeerd zodra een verwijzend exemplaar vergrendeld is. Groepen zijn vlak; nesting en bewerkingscontext volgen later.

## Opslag
Geen backend/API in deze versie. Autosave na 500 ms en bij verlaten/verbergen van de pagina. Maximaal tien expliciete lokale herstelpunten en 100 undo-stappen. Ongeldig opgeslagen JSON krijgt een lokale `invalid-backup` voordat een demo wordt geladen. JSON-import wordt gevalideerd op units, referenties, IDs, eindige getallen en supported schema.

Een lokale lease (15 seconden, elke 4 seconden vernieuwd) voorkomt gelijktijdige bewerking in tabs van dezelfde browser/origin. Dit is geen multi-user lock of beveiligingsgrens. Expliciete overname laadt de laatste opgeslagen staat. Een toekomstige backend moet lock/revisie/conflictherstel server-side afdwingen.

## Export
ExcelJS maakt echte XLSX met samenvatting, exemplaren en metadata. De export wordt vooraf gereconcilieerd; berekende totalen bevatten een opgeslagen uitkomst. `uuid` wordt op ^11.1.1 vastgezet wegens het npm-advisory voor oudere versies. ExcelJS gebruikt de v4-interface; export-roundtrips zijn getest na de override. Browserdistributies van leveranciers kunnen eigen gebundelde code bevatten; een schone npm-audit is geen volledige security review.

jsPDF tekent technische conceptaanzichten op A4 landscape in millimeters. De schaal wordt gekozen uit gangbare schalen en centimeters worden expliciet omgerekend naar papiermillimeters. Bij PDF-export in de browser komt de actuele viewport erbij. Omhullingen zijn geen fabricage- of detailtekeningen. CSV neutraliseert formule-achtige tekst, XLSX bewaart tekst als tekstcellen.

## Autonomie en bestemming
Aluvision-3D-tool blijft ongemoeid. Michel selecteerde Aluvision-3D nadat gemeld was dat die repository openbaar is. Er worden uitsluitend applicatiecode en synthetische voorbeelden naar de eigen sol/aluvision-prototype-branch geschreven. Geen publicatie van fabrikantassets of sleutels, geen betaalde API-calls, geen publieke webdeployment.

## Verificatiegrens
De cloudbrowser wees observatie af via zijn URL-beveiligingsbeleid. Dat wordt niet omzeild. Unit-/exporttests, typecheck en build kunnen doorgaan; werkelijke WebGL/UI/Safari-acceptatie blijft open. Geen gefabriceerde screenshots of browserresultaten.
