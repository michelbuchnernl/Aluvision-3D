# Huidige projectcontext

Immersive-space editor versie 0.3. Canonieke eenheid cm; ruimte 800 X × 400 Z × 300 Y. Hoogte is demo-aanname. 36 synthetische exemplaren, geen fabrikantonderdelen. Shared/unique semantiek, begrensde procedurale geometrie, geneste groepen/context, locks, lokale opslag en PDF/XLSX staan in code.

Node 24/SQLite bewaart optioneel serverprojecten, revisies en per-tab leases. Claude-adapter heeft quote/budget/preview/apply; provider-tests zijn fake, geen echte kosten gemaakt. Afgeleide runtime-projectlogs staan in de Git-ignored datamap, SQLite is de bron.

81 tests en productie-build slagen; WebGL/UI/Safari blijven ongeobserveerd door browserbeleid. Voer docs/MANUAL_QA.md uit voordat je browseracceptatie claimt. Media/UV/WebXR/Blender/catalogusadapters en shared assembly definitions ontbreken. Eigen Sol-branch; zie TASK_STATE.

Versie 0.3 voegt expliciete demo-vlakuitlijning, verbindingscontrole, tijdelijke 2-puntsmeting en GLB-export in meters toe. GLB is binair opnieuw geladen en op instance-bounds gecontroleerd; daadwerkelijke UI en externe viewer blijven ongeverifieerd. Het nieuwe connected-demo-frames.json demonstreert een opgeslagen link. Zie docs/SPATIAL_TOOLS.md.
