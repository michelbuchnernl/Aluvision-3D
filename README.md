# Boormester Immersive Studio

Een browsergebaseerde, handmatige 3D-ontwerper voor immersieve ruimtes. Dit is een eerste prototype van de volledige AluVision/Boormester-specificatie. Alle onderdelen zijn synthetische demo-geometrie; er zijn geen fabrikantmodellen, echte catalogusnummers, certificeringen of API-sleutels opgenomen.

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

`dist/` bevat de statische productieversie. Er is geen backend nodig voor de huidige handmatige editor. Core editing, projectopslag en export voeren geen externe API-aanroepen uit. Na installatie zijn geen CDN-assets of externe lettertypen nodig.

## Wat is gebouwd

- Demo van 800 × 400 × 300 cm met twee lange projectiewanden, open korte zijden, twee doorgangproxies, een tafel en een verhoogde projectorproxy. Hoogte 300 cm is expliciet een demo-aanname.
- Zeven synthetische typen: frame, projectiepaneel, truss, verbindingsblok, open doorgang, tafel en projectorproxy.
- Perspective/orthographic views, orbit/pan/zoom, fit view, ooghoogte-camera, drie visuele presets en camerabladwijzers. Ooghoogte is een camera-standpunt, nog geen botsingsvrije walkthrough.
- Klikselectie, Shift-multiselectie, richtingsafhankelijk selectiekader, verplaats-/rotatiegizmo, exacte cm-invoer, dupliceren en verwijderen.
- Nieuwe objecten op de vloer. Vrije Y-verplaatsing moet expliciet worden ingeschakeld; horizontaal verplaatsen behoudt bestaande hoogte. `Plaats op de vloer` is een afzonderlijke actie.
- Gedeelde onderdeeldefinities en exemplaren, `Maak uniek`, gedeelde maatwijzigingen en zichtbaar materiaalbereik (exemplaar of definitie).
- Platte groepen, lagen, zichtbaarheid, object- en laagvergrendeling. Geen geneste bewerkingscontext.
- Geroteerde begrenzingscontroles, zichtbare overschrijdingen en indicatieve AABB-overlapwaarschuwingen. Geen automatische geometriecorrectie of constructieve beoordeling.
- Undo/redo tot 100 checkpoints, autosave, maximaal tien lokale herstelpunten, JSON-import/export en een bewerkingslease tussen tabs van dezelfde browser/origin.
- XLSX: gegroepeerde onderdelen, alle exemplaren met exacte transforms en projectmetadata. Aantallen worden vóór export vergeleken met de scène.
- CSV als alternatief; formule-achtige tekst wordt geneutraliseerd.
- PDF: boven-, voor- en rechterzijaanzicht met echte papiermaat/schaal, ruimteafmetingen, revisie en controleblad. Tekeningen tonen conceptuele omhullingen, geen fabricagedetails. Een actueel browserbeeld wordt toegevoegd als WebGL beschikbaar is.
- Adaptieve lay-out en touchbesturing in de code. Dit is **niet op een iPhone of in Safari getest**.

## Verificatie en grenzen

**33 geautomatiseerde tests slagen; TypeScript en productie-build slagen.** Zie [TEST_RESULTS.md](TEST_RESULTS.md).

Browserautomatisering is in deze sessie door het browserbeveiligingsbeleid geblokkeerd. Daarom is WebGL-weergave, muis-/touchinteractie, opslag tussen echte tabs en Safari-gedrag nog niet empirisch bevestigd. De eerste vervolgstap is de handmatige acceptatiecheck in [docs/MANUAL_QA.md](docs/MANUAL_QA.md). Een geslaagde build is geen bewijs dat de 3D-weergave werkt.

Nog niet gebouwd: Claude-gespreksinterface/API-adapter, backendopslag, accounts, echte catalogi/importadapters, geneste groepen en edit contexts, losse vlakmaterialen, verbindingssnapping, video/UV-mapping, WebXR, Blender-renderqueue, volledige assetpakketten, API-budgetdashboard en automatisch kennisbeheer. Het volledige overzicht staat in [REQUIREMENTS.md](REQUIREMENTS.md).

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

X is lengte, Y is omhoog en Z is diepte. Het nulpunt is midden op de vloer. Een objectpositie is het midden van de onderzijde. Model- en exporteenheden zijn centimeters; omzetting naar meters gebeurt expliciet.

## Bewaren en hervatten

Browseropslag is lokaal aan deze browser en dit adres. Download JSON voor overdracht naar een ander apparaat of als blijvende kopie. Git bewaart de applicatiebron, niet automatisch je lokaal gemaakte ontwerpen. `examples/immersive-room-4x8.json` is een importeerbare referentiescène.

De lokale tab-lease is geen beveiliging of server-lock. Bij overname wordt het laatste opgeslagen ontwerp geladen. Gebruik de huidige versie niet als publiek schrijfbaar, multi-user systeem.

Architectuur: [DECISIONS.md](DECISIONS.md). Exacte vervolgstappen: [TASK_STATE.md](TASK_STATE.md).
