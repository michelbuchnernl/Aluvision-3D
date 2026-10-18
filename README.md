# Boormester Immersive Studio

Een browsergebaseerde 3D-ontwerper met een handmatige editor, lokale projectserver en optionele Claude-voorstellen voor immersieve ruimtes. Versie 0.3 is een werkend codeprototype van de volledige AluVision/Boormester-specificatie. Alle onderdelen zijn synthetische demo-geometrie; er zijn geen fabrikantmodellen, echte catalogusnummers, certificeringen of API-sleutels opgenomen.

## Start op je laptop

Getest met Node.js **24.19.0** en npm **11.9.0**. Gebruik Node 24.x.

```bash
git clone --branch sol/aluvision-prototype https://github.com/michelbuchnernl/Aluvision-3D.git
cd Aluvision-3D
npm ci
npm run dev
```

Open **http://localhost:4173** op dezelfde laptop. Dit is geen openbaar gehoste preview. De ontwikkelserver luistert standaard alleen op de eigen computer.

Al gekloond?

```bash
git fetch origin
git switch sol/aluvision-prototype
git pull --ff-only
npm ci
npm run dev
```

Controle en productie-build:

```bash
npm test
npm run build
```

`npm run dev` start de editor op 4173 en de lokale SQLite-API op 8787. De handmatige editor werkt ook zonder serververbinding. Na `npm run build` serveert `npm start` de productieversie en API samen op **http://localhost:8787**. Na installatie zijn geen CDN-assets of externe lettertypen nodig. Handmatig bewerken, bewaren en exporteren doen geen externe API-aanroepen.

Claude staat standaard uit. Zie [docs/SERVER_AND_AI.md](docs/SERVER_AND_AI.md) voor configuratie, kostenbeheer en back-up.

## Wat is gebouwd

- Demo van 800 × 400 × 300 cm met twee lange projectiewanden, open korte zijden, twee doorgangproxies, een tafel en een verhoogde projectorproxy. Hoogte 300 cm is expliciet een demo-aanname.
- Zeven synthetische typen: frame, projectiepaneel, truss, verbindingsblok, open doorgang, tafel en projectorproxy.
- Perspective/orthographic views, orbit/pan/zoom, fit view, ooghoogte-camera, drie visuele presets en camerabladwijzers. Ooghoogte is een camera-standpunt, nog geen botsingsvrije walkthrough.
- Klikselectie, Shift-multiselectie, richtingsafhankelijk selectiekader, verplaats-/rotatiegizmo, exacte cm-invoer, dupliceren en verwijderen.
- Nieuwe objecten op de vloer. Vrije Y-verplaatsing moet expliciet worden ingeschakeld; horizontaal verplaatsen behoudt bestaande hoogte. `Plaats op de vloer` is een afzonderlijke actie.
- Gedeelde onderdeeldefinities en exemplaren, `Maak uniek`, gedeelde maatwijzigingen en zichtbaar materiaalbereik (exemplaar of definitie).
- Geneste groepen met objectboom, dubbelklik om een groep te bewerken, breadcrumbs en Escape om een niveau terug te gaan. Gesloten groepen selecteren als één eenheid. Groepslocks en zichtbaarheid werken door naar kinderen; dupliceren behoudt de hiërarchie. Selectiemateriaal geldt voor alle geselecteerde exemplaren.
- Tijdelijk twee-puntsmeetgereedschap (T) met 3D-/horizontale afstand en exacte cm-coördinaten.
- Expliciete demo-vlakuitlijning met rotatie-/hoogtekeuze, preview/apply, harde grenzen, whole-group locks en optioneel opgeslagen verbindingscontrole. Geen fabrikantcompatibiliteit of automatische sleepmagneten.
- GLB-geometrie-export in meters, met groepshiërarchie en instance-/definition-identiteit. Standaard zichtbare onderdelen, optioneel verborgen meenemen. Binair export-/reloadtraject getest. Zie [docs/SPATIAL_TOOLS.md](docs/SPATIAL_TOOLS.md).
- Geroteerde begrenzingscontroles, zichtbare overschrijdingen en indicatieve AABB-overlapwaarschuwingen. Geen automatische geometriecorrectie of constructieve beoordeling.
- Undo/redo tot 100 checkpoints, autosave, maximaal tien lokale herstelpunten, JSON-import/export en een bewerkingslease tussen tabs van dezelfde browser/origin.
- SQLite-projecten, onveranderlijke serverrevisies, herstellen als nieuwe revisie, per-tab bewerkingslease, expliciete overname en zichtbare revisieconflicten. Lokale wijzigingen blijven bij een conflict beschikbaar voor herstel.
- Optionele server-side Claude-adapter: compacte scènecontext en eerdere vragen, kostenraming, projectbudget, gebruiksledger, voorstelpreview en expliciet toepassen/verwerpen. Ruimtewijzigingen vragen aparte goedkeuring. De sleutel blijft op de server. Alle provider-tests gebruiken nagebootste antwoorden; er zijn geen echte API-calls uitgevoerd.
- Automatisch uit SQLite afgeleide project-LOG en CONTEXT. Geen gedeelde componentdefinities voor complete geneste assemblies, autonome multi-agent workflow of algemene kennisdistillatie.
- XLSX: gegroepeerde onderdelen, alle exemplaren met exacte transforms en projectmetadata. Aantallen worden vóór export vergeleken met de scène.
- CSV als alternatief; formule-achtige tekst wordt geneutraliseerd.
- PDF: boven-, voor- en rechterzijaanzicht met echte papiermaat/schaal, ruimteafmetingen, revisie en controleblad. Tekeningen tonen conceptuele omhullingen, geen fabricagedetails. Een actueel browserbeeld wordt toegevoegd als WebGL beschikbaar is.
- Adaptieve lay-out en touchbesturing in de code. Dit is **niet op een iPhone of in Safari getest**.

## Verificatie en grenzen

**81 geautomatiseerde tests slagen; TypeScript, productie-build en formattercontrole slagen.** Zie [TEST_RESULTS.md](TEST_RESULTS.md).

Browserautomatisering is in deze sessie door het browserbeveiligingsbeleid geblokkeerd. Daarom is WebGL-weergave, muis-/touchinteractie, opslag tussen echte tabs en Safari-gedrag nog niet empirisch bevestigd. De eerste vervolgstap is de handmatige acceptatiecheck in [docs/MANUAL_QA.md](docs/MANUAL_QA.md). Een geslaagde build is geen bewijs dat de 3D-weergave werkt.

Nog niet gebouwd: accounts en rollen, echte catalogi/importadapters, gedeelde assembly-definities, losse vlakmaterialen, automatische verbindingssnapping tijdens slepen, beeldintake, video/UV-mapping, WebXR, Blender-renderqueue, volledige assetpakketten, automatische modelroutering en algemene kennisdistillatie. Het volledige overzicht staat in [REQUIREMENTS.md](REQUIREMENTS.md).

## Bediening

| Actie | Bediening |
| --- | --- |
| Selecteren / verplaatsen / roteren | V / M / R |
| Draaien | Middenmuis |
| Pannen | Shift + middenmuis, of rechtermuis |
| Zoomen | Scroll; op touch twee vingers |
| Meer selecteren | Shift + klik |
| Selectiekader naar rechts | Volledig omsloten objecten |
| Selectiekader naar links | Ook doorkruiste objecten |
| Dupliceren | Ctrl/Cmd + D |
| Ongedaan / opnieuw | Ctrl/Cmd + Z / Ctrl/Cmd + Shift + Z |
| Herstelpunt bewaren | Ctrl/Cmd + S |
| Passend in beeld | F |
| Verwijderen / deselecteren | Delete / Escape |
| Tijdelijk afstand meten | T / liniaalicoon |
| Demo-uitlijning | Selectie → verbindingsicoon → preview → toepassen |
| Groep bewerken | Dubbelklik in viewport of objectboom |
| Context omhoog / direct kiezen | Escape / breadcrumb |

X is lengte, Y is omhoog en Z is diepte. Het nulpunt is midden op de vloer. Een objectpositie is het midden van de onderzijde. Model- en exporteenheden zijn centimeters; omzetting naar meters gebeurt expliciet.

## Bewaren en hervatten

Browseropslag is lokaal aan deze browser en dit adres. Download JSON voor overdracht naar een ander apparaat of als blijvende kopie. Git bewaart de applicatiebron, niet automatisch je lokaal gemaakte ontwerpen. `examples/immersive-room-4x8.json` is een importeerbare referentiescène; `examples/connected-demo-frames.json` demonstreert twee uitgelijnde frames met verbindingsmetadata.

Verbind via **Server** om een project in SQLite te bewaren of te openen. Server-autosave gebruikt een seriële opslagqueue en verwachte revisienummers. De serverlease verloopt na 30 seconden en wordt elke 10 seconden vernieuwd. Overname laadt de gezaghebbende serverrevisie. Bij conflict/offline status: bewaar eerst je lokale herstelkopie of JSON en kies daarna bewust welke versie je opent.

De lokale browserlease blijft alleen voor de modus zonder server. De server is standaard uitsluitend op de eigen laptop bereikbaar. Er zijn nog geen accounts/rollen; gebruik dit prototype niet als publiek schrijfbaar systeem. Bewaar de volledige datamap apart van Git; zie de back-upprocedure.

Architectuur: [DECISIONS.md](DECISIONS.md). Exacte vervolgstappen: [TASK_STATE.md](TASK_STATE.md).
