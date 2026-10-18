# Architectuur en aannames

## Stack
React/TypeScript/Vite met directe Three.js-rendering. De scene is een typed JSON-model, onafhankelijk van het renderpad. `model.ts` bevat deterministische staat en validatie; `interaction.ts` bevat geteste projectieselectie en transformaties. `Viewport.tsx` beheert WebGL en controls; `main.tsx` de editor en browseropslag. `exports.ts` wordt pas bij export geladen.

Gebruik Node 24.x voor native TypeScript-stripping in tests. `npm run build` voert eerst TypeScript-controle uit. Vastgelegde dependencyversies staan in package-lock.json.

## Eenheden en geometrie
Centimeters blijven de canonieke eenheid in geheugen, JSON en exports. X/Z vormen het vloerplan; Y is omhoog. Instantieposities zijn het midden van de onderzijde. Rotatie is voorlopig alleen om de verticale Y-as. Een geroteerde AABB bepaalt begrenzing; overlap is slechts een indicatieve AABB-waarschuwing. Structurele frames/doorgangen zijn van overlapmeldingen uitgesloten om legitieme bekleding niet als fout te behandelen.

800 × 400 × 300 cm is de demo. 300 cm is geen bevestigde werkelijke hoogte. Alle delen zijn gegenereerde placeholders met DEMO-identifiers. Deze zijn geen AluVision-producten. Verbindingen, toleranties en draagkracht zijn niet gemodelleerd.

## Componentsemantiek
Instances verwijzen naar een gedeelde definitie met afmetingen en standaardmateriaal. `Maak uniek` kloont de definitie, niet alleen de instantie. Materiaaloverrides op een instantie blijven staan als het definitiemateriaal verandert. Gedeelde definitiewijzigingen worden geblokkeerd zodra een verwijzend exemplaar vergrendeld is. Groepen vormen een boom met maximaal 32 niveaus. Instance-coördinaten blijven in wereldruimte; parentId organiseert selectie/context, zonder extra transformstapel. Een gesloten groep is één selectie-eenheid. Dupliceren kloont groeps-IDs maar behoudt gedeelde onderdeeldefinities. Groepen zijn nog geen gedeelde assembly-definities.

## Opslag
Twee modi: browseropslag voor onafhankelijk handmatig werk, en optioneel een lokale projectserver. Browser-autosave na 500 ms, maximaal tien expliciete herstelpunten en 100 undo-stappen blijven beschikbaar. Een browserlease (15 seconden, elke 4 seconden vernieuwd) geldt alleen voor lokale modus. JSON-import valideert units, referenties, IDs, eindige getallen en hiërarchieën.

Node 24 met native SQLite houdt frontend en server in één project/runtime. Geen extra Python-framework of databaseproces nodig voor laptopgebruik. SQLite gebruikt WAL, foreign keys en transacties. Een exclusieve proceslock beschermt één datamap. Serverrevisies zijn onveranderlijk; restore maakt een nieuwe head. Iedere write vereist een geldige 30-secondenlease en het verwachte revisienummer. Expliciete takeover schermt de oude tab af. De editor bewaart wijzigingen serieel en negeert late responses voor een ander geopend project.

De API luistert standaard op loopback. Sessiecookies, CSRF, Host-/Origincontrole, JSON-bodygrenzen en optionele toegangscode zijn toegevoegd. Netwerkbinding vereist expliciete HTTPS-origin en een lange toegangscode achter eigen toegangspoort; er zijn nog geen accounts/rollen. Sleutels, SQLite en projectdata blijven buiten Git.

Project-LOG en CONTEXT zijn afgeleide bestanden in de lokale datamap. SQLite is de bron; een schrijffout in het kennislog maakt een al opgeslagen revisie niet ongedaan. Dit is geen algemene kennisdistillatie.

## Claude en budget

De adapter gebruikt de eerste Anthropic Messages API via server-side fetch; beschikbaarheid wordt tegen de accountmodellijst gecontroleerd. Officiële referenties: [Messages](https://platform.claude.com/docs/en/api/messages/create), [token count](https://platform.claude.com/docs/en/api/messages/count_tokens), [models](https://platform.claude.com/docs/en/api/models/list), [prijzen](https://platform.claude.com/docs/en/about-claude/pricing). De prijssnapshot is gecontroleerd op 18 oktober 2026 en blokkeert na 30 dagen totdat de code bewust is bijgewerkt.

Alle provider-invoer bestaat uit compacte cm-scènedata, toegestane definities/groepen, locks en maximaal drie eerdere dialoogparen. De provider krijgt geen meshes, bestanden, shell of uitvoerbare tools. Een strikt gestructureerd scènevoorstel gaat door dezelfde deterministische validatie; ontbrekende dimensies kunnen vragen zonder operaties opleveren. Preview muteert de scène niet. Toepassen vereist ongewijzigde basisrevisie, actuele lease en apart akkoord bij ruimtewijzigingen.

Een USD-ledger in gehele microdollars reserveert vóór inference atomair op basis van tokentelling met marge en maximaal antwoordbudget. Gebruik/caches worden apart geboekt. Dit is een applicatieraming, geen providerfactuur of gegarandeerde billingcap. Definitieve afwijzingen geven reserve vrij; netwerkonzekerheid houdt die vast tot gedocumenteerde reconciliatie. Geen automatische retry van een mogelijk betaalde aanvraag. Dezelfde mislukte aanvraagtak stopt na drie pogingen. Geen echte provider-calls in deze bouwronde: fake fetchers leveren testantwoorden.

## Export
ExcelJS maakt echte XLSX met samenvatting, exemplaren en metadata. De export wordt vooraf gereconcilieerd; berekende totalen bevatten een opgeslagen uitkomst. `uuid` wordt op ^11.1.1 vastgezet wegens het npm-advisory voor oudere versies. ExcelJS gebruikt de v4-interface; export-roundtrips zijn getest na de override. Browserdistributies van leveranciers kunnen eigen gebundelde code bevatten; een schone npm-audit is geen volledige security review.

jsPDF tekent technische conceptaanzichten op A4 landscape in millimeters. De schaal wordt gekozen uit gangbare schalen en centimeters worden expliciet omgerekend naar papiermillimeters. Bij PDF-export in de browser komt de actuele viewport erbij. Omhullingen zijn geen fabricage- of detailtekeningen. CSV neutraliseert formule-achtige tekst, XLSX bewaart tekst als tekstcellen.

## Autonomie en bestemming
Aluvision-3D-tool blijft ongemoeid. Michel selecteerde Aluvision-3D nadat gemeld was dat die repository openbaar is. Er worden uitsluitend applicatiecode en synthetische voorbeelden naar de eigen sol/aluvision-prototype-branch geschreven. Geen publicatie van fabrikantassets of sleutels, geen betaalde API-calls, geen publieke webdeployment.

## Verificatiegrens
De cloudbrowser wees observatie af via zijn URL-beveiligingsbeleid. Dat wordt niet omzeild. Unit-/exporttests, typecheck en build kunnen doorgaan; werkelijke WebGL/UI/Safari-acceptatie blijft open. Geen gefabriceerde screenshots of browserresultaten.

## Ruimtelijke tools en uitwisseling — versie 0.3

Sockets zijn optionele definitiemetadata met parametische omhullingscoördinaten en kardinale normaal. Oude schema-1-projecten krijgen zes virtuele demo-vlakken als fallback. `connections` is een optioneel rootveld; bestaande projecten blijven importeerbaar. Nieuwe JSON met deze velden vereist versie 0.3 om ze te behouden. Dit is geen fabrikantconnectorstandaard.

Uitlijnen gebruikt dezelfde cm- en Y-rotatiesemantiek als de editor. Een geselecteerde groep wordt rigid om het brononderdeel gedraaid en daarna verschoven. Hoogtewijziging is expliciet. Preview is onafhankelijk van projectopslag; toepassen vergelijkt de volledige actuele basis en berekent opnieuw. Verbindingen zijn controlemarkeringen: latere edits blijven mogelijk en discrepanties worden waarschuwingen. De app claimt geen constraint solver of constructieve controle.

Puntmeting is tijdelijke presentatiestaat, geen model- of revisiemutatie. Meshhit of begrensde vloerhit bepaalt het punt; het meetpaneel kan exact cm-coördinaten invoeren. Geen automatische corner inference.

GLB wordt los lazy-loaded via de geïnstalleerde Three.js GLTFExporter. Een rootfactor 0,01 zet cm om naar de voorgeschreven meters in glTF. Dezelfde geometry factory wordt gebruikt; templategeometrie/materialen worden gedeeld per definitie/materiaalcombinatie en na export vrijgegeven. Visible-only is standaard; verborgen meenemen is expliciet. JSON blijft het verliesloze app-formaat. Tests lezen de werkelijke binary via GLTFLoader terug en vergelijken wereld-bounds, geen gesimuleerde exporterresultaten.
