# Geheugen, context en modelkeuze (versie 0.8)

## Projectcontext (afgeleid, niets wordt verwijderd)

`server/knowledge.ts` bouwt `projects/<id>/CONTEXT.md` opnieuw uit SQLite na elke opslag. Dezelfde invoer geeft altijd dezelfde tekst. Secties: **Brief**, **Openstaande punten** (grensfouten, waarschuwingen, canvasnaden), **Beslissingen en goedkeuringen**, **Recente revisies** (laatste 5, de rest geteld), **Volgende acties** (alleen afgeleid uit echte controles; bij niets zegt het dat), **Bronnen**. `LOG.md` houdt alle gebeurtenissen ongewijzigd. Regeleinden in namen en berichten worden gewist zodat Markdown niet kan worden ingespoten.

`retrieveContext(markdown, taak, maxTekens)` kiest de Brief plus alleen secties die bij de taak passen. Deze functie is getest maar **nog niet** in de Claude-prompts gekoppeld: aanvragen sturen nog steeds de compacte scène en het recente dialoogverloop.

## Playbook-bewaking

`npm run knowledge:check` (en een Node-test) leest `knowledge/PLAYBOOK.md`. Een regel die *getest/geverifieerd/geobserveerd* claimt moet bestaande bewijsbestanden noemen; alleen een genegeerde claim ("niet getest", "ongeverifieerd") of een conceptstatus mag zonder. Een losse "niet" elders in de status schakelt de controle niet uit. Dit voorkomt dat een gok door woordkeuze "getest" wordt.

## Automatische modelkeuze

In het Claude-paneel is **Automatisch** de standaardkeuze. `server/routing.ts` telt zichtbare signalen:

| Signaal | Punten |
| --- | --- |
| Opdracht > 300 tekens / > 800 tekens | 1 / 2 |
| Raakt ruimte of indeling (kamer, ruimte, layout, verleng…) | 2 |
| Scène > 60 exemplaren | 1 |
| ≥ 4 getallen | 1 |
| ≥ 3 deelopdrachten (en, daarna, komma…) | 1 |

Score ≤ 1 → Haiku, 2–3 → Sonnet, ≥ 4 → Opus. Daarna het nieuwste model van die tier dat de API-sleutel werkelijk kan gebruiken en waarvan de prijs is geverifieerd (`/models`-lijst ∩ prijstabel). Ontbreekt de tier, dan eerst omhoog uitwijken en dat staat in de reden. De kostenraming, het budget en de reservering gebeuren daarna met de prijs van het gekozen model; de reden staat bij de opdracht en in het projectlog.

**Let op:** de drempels zijn een heuristiek, niet gemeten tegen kwaliteit of kosten van echte aanvragen. Er is nog geen echte providercall gedaan; alles is met een nepprovider getest. Een handmatige modelkeuze blijft mogelijk.
