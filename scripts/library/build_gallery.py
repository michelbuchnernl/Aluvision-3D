"""Writes library/aluvision/gallery.html: every ready model grouped by class and sub-group with its preview image.
Open the file in a browser (it links to previews/ next to it; nothing is uploaded anywhere).

python3 scripts/library/build_gallery.py       (run from the repository root, after classify.py and render_previews.py)"""
import html, json, os, collections
LIB = "library/aluvision"
manifest = json.load(open(f"{LIB}/manifest.json"))["models"]
cls = json.load(open(f"{LIB}/classes.json"))
order = [c["id"] for c in cls["classes"]]
label = {c["id"]: c["label"] for c in cls["classes"]}
desc = {c["id"]: c["description"] for c in cls["classes"]}
by = collections.defaultdict(lambda: collections.defaultdict(list))
for m in manifest:
    if m.get("status") != "ready": continue
    f = m["file"].replace("glb/", "")
    c = cls["models"].get(f, {"class": "other", "group": None})
    by[c["class"]][c["group"] or ""].append((m, f))
def esc(s): return html.escape(str(s), quote=True)
def card(m, f):
    stem = f[:-4]
    has = os.path.exists(f"{LIB}/previews/{stem}.png")
    s = m["sizeCm"]
    img = f'<img loading="lazy" src="previews/{esc(stem)}.png" alt="">' if has else '<div class="noprev">geen voorbeeld</div>'
    d = (m["warehouse"].get("description") or "").split("\n")[0]
    size = f'{s["x"]:g} × {s["y"]:g} × {s["z"]:g} cm'
    mb = m["bytes"] / 1e6
    return (f'<figure data-q="{esc((m["name"] + " " + (m["warehouse"].get("description") or "")).lower())}">{img}'
            f'<figcaption><b>{esc(m["name"])}</b><span>{esc(size)}</span><span>{mb:.1f} MB · {m["triangles"]:,} driehoeken</span>'
            f'<span class="d">{esc(d)}</span></figcaption></figure>')
total = sum(len(v) for g in by.values() for v in g.values())
parts = []
for cid in order:
    if cid not in by: continue
    n = sum(len(v) for v in by[cid].values())
    parts.append(f'<section id="{esc(cid)}"><h2>{esc(label[cid])} <small>{n}</small></h2><p class="desc">{esc(desc[cid])}</p>')
    for g in sorted(by[cid], key=lambda x: (x == "", x)):
        if g: parts.append(f'<h3>{esc(g)}</h3>')
        parts.append('<div class="grid">' + "".join(card(m, f) for m, f in sorted(by[cid][g], key=lambda t: t[0]["name"].lower())) + "</div>")
    parts.append("</section>")
nav = "".join(f'<a href="#{esc(c)}">{esc(label[c])} <i>{sum(len(v) for v in by[c].values())}</i></a>' for c in order if c in by)
page = f"""<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AluVision-bibliotheek — galerij</title><style>
body{{font:14px/1.4 system-ui,sans-serif;margin:0;background:#f4f7f7;color:#1d2b2e}}
header{{position:sticky;top:0;background:#fff;border-bottom:1px solid #dbe3e5;padding:10px 18px;z-index:5}}
header h1{{font-size:16px;margin:0 0 6px}} header input{{width:min(420px,90%);padding:7px 10px;border:1px solid #c9d4d6;border-radius:8px;font:inherit}}
nav{{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}} nav a{{border:1px solid #d3dcdf;border-radius:999px;padding:2px 10px;font-size:12px;color:#37535a;text-decoration:none;background:#fff}} nav i{{font-style:normal;color:#8a9a9d}}
main{{padding:8px 18px 40px}} section{{margin-top:22px}} h2{{font-size:18px;margin:0}} h2 small{{color:#8a9a9d;font-weight:400}} h3{{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b7578;margin:14px 0 6px}}
.desc{{margin:2px 0 6px;color:#667a7d}} .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}}
figure{{margin:0;background:#fff;border:1px solid #e0e7e8;border-radius:10px;overflow:hidden}} figure img,.noprev{{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#eef2f3}}
.noprev{{display:grid;place-items:center;color:#99a8aa;font-size:12px}} figcaption{{padding:7px 9px;display:grid;gap:1px}} figcaption b{{font-size:12px}} figcaption span{{font-size:11px;color:#5f7477}} .d{{color:#8a9a9d!important}}
.hidden{{display:none}} footer{{padding:0 18px 30px;color:#7d8e90;font-size:12px}}
</style></head><body><header><h1>AluVision-bibliotheek — {total} modellen, gegroepeerd op klasse</h1>
<input id="q" placeholder="Zoek op naam of artikelnummer…" autofocus><nav>{nav}</nav></header><main>{"".join(parts)}</main>
<footer>Klassen zijn een praktische indeling op naam (scripts/library/classify.py), geen officiële Aluvision-productindeling. Modellen zijn niet geverifieerd. Voorbeelden: vaste driekwartsweergave, geen echte oriëntatie.</footer>
<script>const q=document.getElementById('q');q.addEventListener('input',()=>{{const v=q.value.trim().toLowerCase();document.querySelectorAll('figure').forEach(f=>f.classList.toggle('hidden',!!v&&!f.dataset.q.includes(v)));
document.querySelectorAll('section').forEach(s=>s.classList.toggle('hidden',!s.querySelector('figure:not(.hidden)')));}});</script></body></html>"""
open(f"{LIB}/gallery.html", "w", encoding="utf-8").write(page)
print("gallery.html:", total, "models,", sum(1 for _ in os.listdir(f"{LIB}/previews")), "previews")
