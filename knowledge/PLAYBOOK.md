# Implementatieregels

| Regel | Status | Bewijs |
| --- | --- | --- |
| Shared definition versus instance zijn afzonderlijke identiteiten; make-unique kloont de definitie. | Unit-getest | tests/model.test.mjs |
| Fysieke omhulling moet ook overeenkomen met feitelijk gegenereerde Three.js-primitieven. | Headless geometry-getest | tests/sceneGeometry.test.mjs |
| Exportaantallen moeten uit de instancegraph komen, inclusief verborgen objecten. | Export-roundtrip getest | tests/exports.test.mjs |
| Browserbediening kan niet uit een geslaagde build worden afgeleid. | Acceptatie nog open | TEST_RESULTS.md |

Promoveer niets tot browsergevalideerd voordat docs/MANUAL_QA.md daadwerkelijk is uitgevoerd.

| Regel | Status | Bewijs |
| --- | --- | --- |
| Iedere serversave vereist actuele lease én verwacht revisienummer; serializeer saves in de werkelijke editorclient. | HTTP/controller-getest | tests/server.test.mjs, tests/connection.test.mjs |
| Een late response van een eerder project mag het geopende project niet vervangen. | Controller-getest | tests/connection.test.mjs |
| Onzeker providerverbruik houdt reservering vast; geen automatische mogelijk betaalde retry. | Fake-provider-getest | tests/claude.test.mjs |
| Groepsoperaties behouden parent chains en blokkeren gedeeltelijke wijziging bij een locked child. | Model/operation-getest | tests/hierarchy.test.mjs |

Deze backend-/modelbewijzen zijn geen promotie tot browser- of echte-provideracceptatie.

| Regel | Status | Bewijs |
| --- | --- | --- |
| Rigid group alignment verplaatst alle geselecteerde kinderen; hoogte vereist expliciete keuze en stale preview mag niets overschrijven. | Model-getest | tests/spatial.test.mjs |
| Geometrie-export moet via een echte binary roundtrip op wereld-bounds en eenheden worden gecontroleerd. | GLB-roundtrip getest | tests/glb.test.mjs |

Demo-vlakprofielen zijn geen bewijs van fysieke compatibiliteit; externe viewer-/browseracceptatie staat nog open.

| Regel | Status | Bewijs |
| --- | --- | --- |
| Herken bestandsformaten aan de inhoud (magic bytes), niet aan de bestandsnaam: downloads en tijdelijke bestanden hebben geen betrouwbare extensie. | Browser-getest (e2e) | e2e/studio.spec.mjs |
| Vertrouw het rapport van een worker niet: controleer bestaan, formaat en checksum van uitvoerbestanden zelf. | Unit-getest | tests/render.test.mjs |
| Eén mislukkingsbudget per opdracht (3 pogingen) en herstart zet lopende jobs terug binnen datzelfde budget. | Unit-getest | tests/render.test.mjs |
| Eén gedeelde texture per projectiecanvas houdt video op alle wanden synchroon; naden en hoeken worden gemeten, niet aangenomen. | Unit-getest, handmatig browser-geobserveerd | tests/media.test.mjs, docs/MEDIA.md |
| Teleportdoelen alleen op de vloer, met wandmarge en geroteerde footprints; hoofdoffset bepaalt de rigpositie. | Unit-getest; headset niet geprobeerd | tests/teleport.test.mjs, docs/VR.md |
| Pakketten hebben een manifest met SHA-256 per bestand en worden strikt heropend (geen extra, ontbrekende of gewijzigde bestanden). | Unit- en e2e-getest | tests/package.test.mjs, e2e/studio.spec.mjs |
| Asmapping Studio (y omhoog, z diepte) naar Blender (z omhoog, −y diepte) voor camera's en GLB-import. | Concept, niet in Blender geprobeerd | docs/BLENDER.md |
| Een mutatiecontrole (regel tijdelijk breken, test moet falen) bewijst dat een UX-test niet leeg is. | Handmatig uitgevoerd voor selectiekader | docs/E2E.md |
| Modelkeuze volgt waarneembare signalen en alleen modellen die de sleutel werkelijk kan gebruiken; terugval wordt in de reden vermeld. | Unit-getest met nepprovider | tests/routing.test.mjs |

Deze regels zijn bewijs voor code en logica, niet voor Blender, een echte headset of echte API-kosten.
