# Lokale projectserver en optionele Claude

Gebruik Node 24.x. `npm ci` installeert de vastgelegde dependencies. `npm run dev` start API 8787 en editor 4173, alleen op de eigen laptop. Open http://localhost:4173. Voor de productieversie: `npm run build`, daarna `npm start` en http://localhost:8787. Stop met Ctrl+C. `npm run dev:web` start alleen de handmatige editor.

## Projecten bewaren

1. Open **Server** en kies het huidige ontwerp bewaren als serverproject of open een bestaand project.
2. Bestaande project-ID? Kies bewust serverversie openen of als nieuwe kopie bewaren.
3. Het bovenste statusveld toont serverrevisie en wachtende wijzigingen. Autosave volgt na circa 1,2 seconden en schrijft serieel.
4. Een andere tab kan pas schrijven na expliciete overname. Overname laadt de laatste serverrevisie en maakt de vorige lease ongeldig.
5. Bij conflict blijven je lokale wijzigingen aanwezig. Bewaar een herstelkopie/JSON voordat je een serverversie kiest. Een verbroken verbinding claimt geen geslaagde opslag.
6. Het revisiepaneel herstelt een oude inhoud als nieuwe revisie. Lokale wijzigingen worden eerst opgeslagen als ze nog schrijfbaar zijn.

De serverlease duurt 30 seconden en wordt elke 10 seconden vernieuwd. De lokale browserlease geldt alleen zolang je geen serverproject gebruikt. Er zijn geen gebruikersaccounts of rollen; de standaardconfiguratie is voor lokaal gebruik.

## Configuratie

Kopieer `.env.example` naar `.env` en gebruik `npm run dev:env` of, na bouwen, `npm run start:env`. Gewone `npm run dev`/`npm start` lezen `.env` niet automatisch.

| Variabele | Standaard / betekenis |
| --- | --- |
| STUDIO_HOST | 127.0.0.1 |
| STUDIO_PORT | 8787; Vite proxy gebruikt dezelfde omgevingsvariabele |
| STUDIO_DATA_DIR | studio-data, relatief aan de werkmap |
| STUDIO_ENABLE_AI | 0; 1 schakelt de adapter in |
| ANTHROPIC_API_KEY | Leeg; uitsluitend server-side |
| STUDIO_ORIGIN | Optioneel expliciet HTTPS-adres achter eigen private reverse proxy |
| STUDIO_ACCESS_TOKEN | Optionele gedeelde toegangscode; bij netwerkbinding minimaal 24 tekens |

Voer een eventuele toegangscode in het Server-paneel in; die blijft alleen in het geheugen van de pagina. Netwerkbinding vereist de expliciete HTTPS-origin en toegangscode. Dit is geen ingerichte publieke hosting of accountbeveiliging. De app is niet gedeployed.

## Claude gebruiken

In deze ontwikkelronde zijn **geen echte provider-aanvragen of kosten gemaakt**. Alle automatische tests gebruiken nagebootste responses. Sleutels staan niet in de frontend, voorbeelden of repository.

Om zelf later echte aanvragen te gebruiken: configureer privé de sleutel en `STUDIO_ENABLE_AI=1`, herstart, verbind een serverproject en open **Claude**. Kies een model en stel een USD-projectbudget in. De adapter controleert bij de provider of het account het model heeft. Daarna:

1. Beschrijf de wijziging. **Raming** telt inputtokens en maakt een korte, revisiegebonden quote; deze voert geen inference uit.
2. Controleer raming en vrij budget. **Uitvoeren** verstuurt de aanvraag en kan providerkosten maken.
3. Lees de samenvatting, vragen, operaties en validatiemeldingen. **Preview** toont een afzonderlijke kandidaat zonder de eigen scène op te slaan.
4. **Toepassen** maakt een revisie als de basis nog actueel is en alle harde grenzen passen. Ruimtewijzigingen vragen extra akkoord. **Verwerpen** wijzigt geen geometrie.

De context bevat compacte cm-data, definities, groepshiërarchie en locks plus maximaal drie eerdere dialoogparen. Er worden geen meshes of lokale bestanden verstuurd. Beschikbare bewerkingen: toevoegen, verplaatsen/roteren, verwijderen, uniek maken, definitiemaat, materiaal en ruimteafmetingen. Er is nog geen beeldintake of uitvoerende agent.

Prijzen zijn een gedateerde officiële snapshot in `server/claude.ts`, geen live facturering. Na 30 dagen blokkeert de adapter totdat die snapshot bewust is bijgewerkt. De quote reserveert input met marge en maximaal antwoordbudget. Gebruik wordt als gehele microdollars geboekt; afwijkingen/caching en providerbilling blijven controlepunten. Gebruik zo nodig ook het kostenplafond in je provideraccount.

Bij onzekere netwerkuitkomst blijft de reservering staan; er volgt geen automatische betaalde retry. Controleer het providerverbruik en reconcileer met bedrag en notitie in het Claude-paneel. Een serverherstart markeert achtergebleven lopende aanvragen als onzeker. Een verouderd voorstel kan geen latere handmatige revisie overschrijven.

## Back-up en herstel

`studio-data/` bevat SQLite, eventuele WAL/SHM-bestanden, proceslock en afgeleide projectlogs. Deze map en `.env` worden door Git genegeerd. Een Git-push bewaart de applicatiebron, niet jouw serverprojecten.

Voor een consistente eenvoudige back-up: stop de server met Ctrl+C, wacht op afsluiten en kopieer de **hele datamap** naar je back-uplocatie. Kopieer geen losse actieve SQLite-file terwijl WAL nog in gebruik kan zijn. Bewaar `.env` afzonderlijk op een private plek. Herstel alleen bij gestopte server naar de ingestelde datamap; start daarna opnieuw. JSON-export is aanvullend bruikbaar voor één scène, maar bevat geen serverrevisies of kostenledger.

`vault/projects/<hash>/LOG.md` en `CONTEXT.md` worden uit SQLite afgeleid. Wijzigingen in die Markdown-bestanden veranderen de scène niet. SQLite is de bron. Als een proces abrupt stopt, wordt een aantoonbaar dode PID-lock bij de volgende start opgeruimd; een onleesbare lock vraagt eerst controle dat er echt geen server draait.

## Verificatiegrens

HTTP-, SQLite-, clientqueue-, fake-provider- en CLI-start/herstarttests slagen. De server-/Claude-/groep-UI, WebGL en Safari zijn nog niet via een echte browser geaccepteerd. Volg `docs/MANUAL_QA.md` en leg werkelijk waargenomen resultaten vast.
