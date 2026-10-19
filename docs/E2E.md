# Browser-UX-tests (Playwright)

```bash
npm run test:e2e
```

Start zelf een Vite-server op poort 4180 en gebruikt de geïnstalleerde **Google Chrome** (`channel: "chrome"`, geen browserdownload); headless WebGL loopt via SwiftShader. De optionele Node-server draait niet mee, dus dit test ook de handmatige modus zonder AI. API-aanroepen die 404'en worden verwacht; elke andere mislukte request of consolefout laat de test falen.

De app biedt alleen met `?e2e=1` een **alleen-lezen** hook `window.__studio` (`project()`, `boxes()`, `selected()`) zodat tests schermposities en toestand kunnen lezen zonder interne state aan te passen.

## Dekking (8 tests)

| Test | Controleert |
| --- | --- |
| Presets | Technisch/Presentatie/Immersief renderen niet-leeg (pixelvariatie, helderheid); Immersief is donkerder dan Technisch; geen consolefouten |
| Selectiekader | Links→rechts selecteert alleen volledig omsloten, rechts→links ook snijdend (echte muisdrag in bovenaanzicht). Mutatiecontrole: omwisselen van de richting laat de test falen |
| Groep/uniek/lock | Groeperen en uit groep halen; "Maak uniek" wijzigt precies één exemplaar; vergrendeld object overleeft Delete |
| Handmatig bewerken | Dupliceren, undo, redo, standpunt opslaan, herstel na herladen (autosave) |
| Hoekcanvas | 8 panelen, hoek 90° getoond, afbeelding koppelen (SHA-256 in metadata), fit-modus |
| Export | XLSX is een zip, JSON heeft canvassen en alle objecten |
| Projectpakket | Exporteren, kamer leegmaken, zip heropenen: project en canvassen identiek; een beschadigde zip wordt geweigerd zonder het project te wijzigen (vond een echte fout: detectie op bestandsnaam i.p.v. zip-inhoud) |

## Niet gedekt

Safari/Firefox, aanraakbediening, VR, video-afspelen, schermafbeeldingsvergelijking (visuele regressie met referentiebeelden), PDF-inhoud, materiaalemmer, tag/laag-zichtbaarheid, walkthrough-camera.

## Browsertests tegen het echte serverproces (versie 1.3)

```bash
npm run test:e2e:render                      # server + Vite op vrije poorten, zonder Blender
BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender npm run test:e2e:render   # incl. echte render
```

Aparte configuratie (`playwright.render.config.mjs`, map `e2e-render/`) die zelf de Node-server (poort 8795, tijdelijke datamap) en Vite (4195) start; de gewone suite blijft los en zonder server. `STUDIO_EXTRA_ORIGINS` laat de server die Vite-origin toe (alleen loopback).

| Test | Controleert |
| --- | --- |
| Serverronde | Project op de server bewaren, bewerken met autosave (revisie 2), herladen, de vergrendeling door de vorige tab zien en expliciet overnemen, openen vanuit de serverlijst, revisie 1 herstellen (wordt revisie 3) |
| Renderpaneel | Renderopdracht vanuit de UI in de wachtrij; zonder Blender meldt het paneel dat en blijft de job "Wachtrij"; met Blender: klaar, download is een geldige PNG |

**Gevonden fout (sinds versie 0.2 aanwezig):** de browserclient bewaarde `window.fetch` als methode van het clientobject en riep hem daar zo aan; browsers weigeren dat ("Illegal invocation"), waardoor de serververbinding in een browser nooit werkte. De Node-tests gebruikten altijd een eigen fetcher en konden dit niet zien. Hersteld en afgedekt met `tests/client.test.mjs` (faalt op de oude code).
