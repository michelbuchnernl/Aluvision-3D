# Algemene ontwikkellessen

2026-10-18: controleer zichtbare procedurale geometrie tegen de declaratieve afmetingen, ook met kleine en smalle maatvarianten. Een uitstekende lens of te brede tafelpoot maakt uitsluitend schema-based bounds onbetrouwbaar.

2026-10-18: horizontaal verplaatsen mag een al verhoogd object niet op nulhoogte zetten. Vloeractie en vrij-Y zijn expliciete keuzes.

Dit zijn implementatie-inzichten uit dit project, geen structurele ontwerprichtlijnen voor beursconstructies.

2026-10-18: deel sessie-identiteit en tab-identiteit op: tabs delen cookies, maar moeten verschillende edit-leasehouders zijn. Koppel elke save aan zowel lease als revisie en negeer late projectresponses.

2026-10-18: een provider-timeout bewijst niet dat er niets is gefactureerd. Houd de reservering vast en maak reconciliatie expliciet; fake-provider-tests bewijzen de ledgerlogica, niet de echte factuur.

2026-10-18: groepen met uitsluitend geneste kinderen hebben geen directe instanceverwijzingen. Prune op alle descendants om parent chains niet per ongeluk te verwijderen.
