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
