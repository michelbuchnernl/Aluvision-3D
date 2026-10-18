# Huidige bouwstatus — actief checkpoint

Laatste actieve ronde gestart: 2026-10-18 15:12 UTC. Michel gaf opdracht verder te bouwen en vroeg expliciet tussentijds naar Git te pushen.

## Nieuwe code sinds versie 0.1

- Node 24/SQLite-server met projecten, onveranderlijke revisies, herstellen als nieuwe revisie, per-tab bewerkingsleases en revisieconflicten.
- Afgeschermde lokale HTTP-API met sessie/CSRF, origin/hostcontrole en optionele toegangscode voor private netwerkconfiguratie.
- Seriële editor-opslagqueue, conflict/herstelstatus en serverprojecten-/revisiepaneel.
- Server-side Claude-adapter met actuele modellijstcontrole, tokenraming, gesnapshotte officiële prijzen, atomair projectbudget en expliciet beoordeelde scènevoorstellen.
- Geen echte provider-calls uitgevoerd: Claude-antwoorden zijn in tests nagebootst; er is geen API-geld besteed.
- Voorstellen worden deterministisch gevalideerd, kunnen apart in de scène worden bekeken en vragen bij ruimtewijzigingen expliciete goedkeuring. Verouderde voorstellen overschrijven geen nieuwe wijzigingen.
- Project-LOG en CONTEXT worden uit SQLite afgeleid; onbekend providerverbruik houdt de reservering vast tot expliciete reconciliatie.
- Geneste groepen, hiërarchische locks/zichtbaarheid, bewerkingscontext en een objectboom worden nu toegevoegd en gecontroleerd. Shared component definitions blijven afzonderlijk van instances; gedeelde geneste assembly-definities zijn nog toekomstwerk.

## Bewijs tot dit checkpoint

De bestaande 60 tests slaagden, inclusief het volledige traject editorclient → echte HTTP-server → nagebootste Claude → voorstel → revisie. De afzonderlijke CLI-start/herstarttest slaagde en controleert ook een tweede serverproces op dezelfde datamap. Nieuwe hiërarchietests worden in deze ronde toegevoegd. TypeScript-controle en builds draaien tijdens de bouw.

Browserobservatie blijft geblokkeerd door het eerder gemelde URL-beveiligingsbeleid. Geen visuele of iPhone/Safari-acceptatie geclaimd.

## Bestemming en hervatten

Repository: https://github.com/michelbuchnernl/Aluvision-3D
Branch: `sol/aluvision-prototype`
Claude's `Aluvision-3D-tool` wordt niet gewijzigd. Geen force-push, merge of publieke webdeployment.

```bash
git fetch origin
git switch sol/aluvision-prototype
git pull --ff-only
npm ci
npm run dev
```

`npm run dev` start voortaan de lokale API op 8787 en de Vite-editor op 4173. Claude staat standaard uit. `.env.example` bevat de optionele configuratie; sleutels/data worden door Git genegeerd.

## Volgende acties

1. Rond de hiërarchie-/interactie-integratie en gerichte tests af.
2. Werk README, REQUIREMENTS, DECISIONS en TEST_RESULTS bij naar het feitelijke resultaat van deze ronde.
3. Push opnieuw bij het volgende coherente checkpoint en vóór beëindiging van de uitvoerronde.
4. Browseracceptatie blijft een expliciete open taak; daarna volgen media/UV/WebXR/Blender en catalogusadapters.

Er is tijdens het afronden van dit checkpoint een actieve bouwtaak in dit gesprek. Dit bestand belooft geen zelfstandig achtergrondproces nadat de beurt is beëindigd.
