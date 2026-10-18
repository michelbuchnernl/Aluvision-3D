# Werkelijk uitgevoerde verificatie

Datum: 18 oktober 2026. Omgeving: Linux, Node 24.19.0, npm 11.9.0.

## Geslaagd

| Controle | Werkelijk resultaat |
| --- | --- |
| `npm test` | 33 tests, 33 geslaagd, 0 gefaald |
| `npm run build` | TypeScript-check en Vite-productie-build geslaagd |
| `npm audit --omit=dev --json` | 0 gemelde kwetsbaarheden in productiedependencytree na uuid-override |
| XLSX-roundtrip | Bestand in geheugen gegenereerd en opnieuw geopend; BOM-totaal en instanceblad tellen alle 36 demo-objecten |
| PDF-data | 4 pagina's zonder browserbeeld: drie technische aanzichten en controleblad; A4 landscape, 1:50 voor de demo |
| PDF-proefrender | Gegenereerd met de app-exporter en met Poppler gerenderd; zichtbare proefpagina's gecontroleerd op leesbaarheid en maatlabels |

## Dekking

- Eenheden, geroteerde AABB, vloer/plafond en exacte grenswaarden.
- Geen stille correctie bij overschrijding.
- Duplicaten met eigen ID, gedeelde versus unieke definitie, materiaaloverrides.
- Object-/laaglock, groups, layer visibility en BOM-telling van verborgen objecten.
- JSON roundtrip en afwijzen van dubbele IDs, ontbrekende verwijzingen en ongeldige dimensies/camera/materialen.
- Undo/redo en begrensde historie.
- Richting van selectiekader, group/pivot rotation en expliciete vrije hoogte.
- CSV-formuletekst, camerazoom/frustum in JSON.
- Concrete Three.js-geometrie tegenover fysieke omhullingen bij catalogusmaten en twee afwijkende maatreeksen.
- Excel met unieke definities, maatwijzigingen en lege projecten.
- PDF-waarschuwingen bij een ongeldige scène zonder scene-mutatie.

## Gevonden en hersteld tijdens bouwen

1. Floating-point roundtrip had een onterechte test met exacte decimale gelijkheid; vervangen door een passende numerieke tolerantie.
2. Lege Excel-BOM kreeg een zinloze nulformule zonder cached resultaat; gebruikt nu numerieke nul.
3. Projectorlens en tafelpoten konden bij extreme maatwijzigingen buiten hun nominale envelop vallen; procedurale geometrie begrensd en concrete Three.js-bounds getest.
4. Behouden hoogte bij horizontaal verplaatsen expliciet gemaakt; een reeds verhoogde projector valt niet stilzwijgend op de vloer.
5. uuid-advisory in ExcelJS-dependencytree met compatibele override aangepakt en exporttests herhaald.
6. Naamvelden committen op blur/Enter zodat elke letter niet een complete undo-stap verbruikt.

## Niet geverifieerd

De cloudbrowser wees observatie af via het URL-beveiligingsbeleid. Deze afwijzing is niet omzeild. Het lokale previewhulpmiddel meldde een gestart previewadres, maar er is **geen succesvolle browserobservatie** geweest. Een loopback HTTP-probe bereikte geen server; dat is geen geslaagde startup-smoketest. Het previewproces is na afloop gestopt.

Daarom zijn WebGL-weergave, echte controls, downloadinteractie, camera/frustumherstel in browser, autosave/herstel en leasegedrag tussen echte tabs nog niet empirisch bevestigd. Ook fysieke iPhone/Safari, WebXR en Blender zijn niet getest. Er zijn geen browser-screenshots of verzonnen visuele resultaten.

Vite meldt grote chunks door Three.js en de lazy-loaded Excel/PDF-exporter. De build slaagt, maar werkelijke laadtijd en mobiele performance zijn niet gemeten. Een schone npm-audit is geen volledige security review.

Voer de concrete acceptatieprocedure in docs/MANUAL_QA.md uit voordat dit prototype in gebruik wordt genomen.
