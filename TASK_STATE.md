# Huidige bouwstatus

Gestart: 2026-10-18 14:15:27 UTC (16:15 Europe/Berlin).

## Huidig resultaat

Eerste handmatige editor gebouwd, met 36-delige 4 × 8 × 3 m demo, shared/unique definities, cm-transformeren, layers/locks, platte groepen, undo/redo, lokale autosave/herstelpunten, JSON, echte XLSX en technische PDF.

33 geautomatiseerde tests slagen. TypeScript en productie-build slagen. Productie-audit: 0 gemelde kwetsbaarheden. Exportdata en gegenereerde fysieke mesh-enveloppen zijn getest. PDF-proefpagina's zijn gerenderd en bekeken.

De browseromgeving blokkeerde observatie via het URL-beveiligingsbeleid. Daarom is geen browseracceptatie geslaagd en is de zichtbare 3D/editorbediening nog niet empirisch bevestigd. Geen claim dat het volledige product gereed is.

## GitHub

- Bestemming: https://github.com/michelbuchnernl/Aluvision-3D
- Branch: `sol/aluvision-prototype`
- Repository was leeg en is openbaar. Michel selecteerde deze expliciet nadat de zichtbaarheid was gemeld.
- Main bevat alleen de oorspronkelijke initialisatie-README; niet mergen of force-pushen.
- `Aluvision-3D-tool` is niet gewijzigd.
- Lokale broncommit voor de eerste versie: `e4e0aa7`. De shell-push had geen HTTPS-aanmeldgegevens; overdracht wordt via de gekoppelde GitHub-API gedaan. De uiteindelijke remote commit staat in de branchgeschiedenis en wordt in de overdracht bevestigd.

## Hervatten op laptop

```bash
git clone --branch sol/aluvision-prototype https://github.com/michelbuchnernl/Aluvision-3D.git
cd Aluvision-3D
npm ci
npm test
npm run dev
```

Open http://localhost:4173 op dezelfde laptop. Dit is geen internetpreview. Vereist: Node 24.x. De statische productie-build maak je met `npm run build`.

## Exacte vervolginstructie

Lees README.md, DECISIONS.md en TEST_RESULTS.md. Voer eerst docs/MANUAL_QA.md werkelijk in een browser uit. Herstel geobserveerde runtime-/interactiefouten en leg bewijs vast. Begin pas daarna aan backendpersistence met server-lock en een server-side Claude-adapter. Houd de editor zonder API-sleutel bruikbaar. Geen betaalde API-calls zonder autorisatie, geen sleutels in frontend/Git, geen wijzigingen aan Claude's tool-repository.

REQUIREMENTS.md bevat de rest van het productdoel. Blender, echte leverancierscatalogi, geneste bewerkingscontext, media/UV, WebXR, assetpakketten en AI-kostenbeheer zijn nog niet geïmplementeerd.

## Uitvoering

Er is geen zelfstandige achtergrondtaak gestart. De ontwikkelpreview is gestopt. Werk eindigt na het opslaan van dit checkpoint; voortzetting vereist een nieuwe bouwopdracht of hervatten op de laptop.
