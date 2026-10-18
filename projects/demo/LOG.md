# Ontwikkellog — demo

- 2026-10-18 14:15 UTC: begonnen met een geïsoleerd project, want meerdere ALU-repositories kwamen overeen en twee waren openbaar.
- Michel wees daarna expliciet Aluvision-3D aan. Alleen deze repository en een Sol-branch worden gebruikt; Claude's tool-repository blijft ongemoeid.
- React/TypeScript/Three.js manual-first editor, synthetic catalogus en centimeterstaat gebouwd.
- Type- en productiechecks draaien; gerichte geometrie/state/exporttests toegevoegd en geobserveerde fouten hersteld.
- Cloudbrowser blokkeerde observatie via URL-policy. Geen omweg of gefabriceerde browseracceptatie.
- XLSX en PDF geëxporteerd in tests; Excel opnieuw geopend en gereconcilieerd; PDF als proef gerenderd.
- Zie TEST_RESULTS en TASK_STATE voor huidige verificatie en overdracht.

- 2026-10-18: versie 0.2 voegt Node/SQLite, serverrevisies/leases, werkelijke editor-opslagqueue en optionele Claude-voorstellen met kostenledger toe. Geen echte provider-calls.
- Geneste groepen/context en regressies afgerond; 68 tests, productie-build, formatcontrole en productieaudit slagen. Browseracceptatie blijft open.
- Checkpoint 2f3592f daadwerkelijk gepusht; afronding wordt apart bewaard op dezelfde branch.

- 2026-10-18: versie 0.3: parametrische demo-vlakken/verbindingen, expliciete uitlijnpreview/apply, puntmeting en GLB-export. 81 tests, build en formatter worden bij dit checkpoint vastgelegd. Geen browser-/externe-vieweracceptatie geclaimd.
