# Browser-UX-tests (Playwright)

```bash
npm run test:e2e
```

Start zelf een Vite-server op poort 4180 en gebruikt de geïnstalleerde **Google Chrome** (`channel: "chrome"`, geen browserdownload); headless WebGL loopt via SwiftShader. De optionele Node-server draait niet mee, dus dit test ook de handmatige modus zonder AI. API-aanroepen die 404'en worden verwacht; elke andere mislukte request of consolefout laat de test falen.

De app biedt alleen met `?e2e=1` een **alleen-lezen** hook `window.__studio` (`project()`, `boxes()`, `selected()`) zodat tests schermposities en toestand kunnen lezen zonder interne state aan te passen.

## Dekking (6 tests)

| Test | Controleert |
| --- | --- |
| Presets | Technisch/Presentatie/Immersief renderen niet-leeg (pixelvariatie, helderheid); Immersief is donkerder dan Technisch; geen consolefouten |
| Selectiekader | Links→rechts selecteert alleen volledig omsloten, rechts→links ook snijdend (echte muisdrag in bovenaanzicht). Mutatiecontrole: omwisselen van de richting laat de test falen |
| Groep/uniek/lock | Groeperen en uit groep halen; "Maak uniek" wijzigt precies één exemplaar; vergrendeld object overleeft Delete |
| Handmatig bewerken | Dupliceren, undo, redo, standpunt opslaan, herstel na herladen (autosave) |
| Hoekcanvas | 8 panelen, hoek 90° getoond, afbeelding koppelen (SHA-256 in metadata), fit-modus |
| Export | XLSX is een zip, JSON heeft canvassen en alle objecten |

## Niet gedekt

Safari/Firefox, aanraakbediening, VR, video-afspelen, schermafbeeldingsvergelijking (visuele regressie met referentiebeelden), PDF-inhoud, materiaalemmer, tag/laag-zichtbaarheid, walkthrough-camera.
