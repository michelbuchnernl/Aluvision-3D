"""Groups every model of library/aluvision/manifest.json into logical classes using ordered naming rules and writes
library/aluvision/classes.json: {file: {"class": id, "group": label|null}} plus the class list (ids, Dutch labels, order).

python3 scripts/library/classify.py            (run from the repository root; add --report to list the rules' coverage)

The rules look only at the model names (the Warehouse titles). Class meanings are a practical grouping for browsing, not
an Aluvision product taxonomy. Letters in stand codes (C, L, P, S) are kept as written in the name; their meaning is unverified."""
import json, os, re, sys, collections
LIB = "library/aluvision"
CLASSES = [  # (id, label, description)
    ("stands", "Standconcepten & collecties", "Complete standontwerpen en themacollecties (bijv. 6x3P 001, Essential Collection)"),
    ("quixy", "QuiXy-modules", "Wanden, balies, bogen, opslag en lightboxen van het QuiXy-systeem"),
    ("flex", "Flexbox, Flexdeck & etages", "Meerlaagse constructies, dekken, trappen, leuningen"),
    ("floors", "Vloeren & podia", "Step-podia, hoekmodules, hellingen, subfloor en losse vloer"),
    ("led", "LED-schermen", "Hi-LED panelen, gebogen en hoekmodules, magnetische wiggen"),
    ("lighting", "Verlichting", "Spots, LED-lijnen, rails, drivers"),
    ("doors", "Deuren & glas", "Deuren, schuifdeuren, ramen en glaspanelen"),
    ("frames", "Frames & profielen", "Basisframes, profielen per meter, gebogen frames en framehoeken"),
    ("boxes", "Box-systemen", "B-box, E-box, Ino, Sub, Super en Omni box met bijbehorende sets"),
    ("connections", "Verbindingen & klemmen", "Verbindingsknopen, joining sets, framekleminen en hoekverbindingen"),
    ("fasteners", "Snelspanners & bevestiging", "Quick tighteners, pennen, schroeven, moeren, ogen"),
    ("covers", "Afdekkingen & strips", "Covers, clips, panel strips, afdekprofielen"),
    ("bases", "Voeten, bases & wielen", "Basisplaten, verstelbare voeten, wielen, vloerbeugels"),
    ("rigging", "Ophanging & versterking", "Rigging bars, ophangsets, plafond- en wandversterking"),
    ("furniture", "Balies, bars & meubilair", "Balies, bars, banken en displays met een eigen productnaam"),
    ("interior", "Interieur & accessoires", "Folderhouders, kledingstangen, monitorsteunen, planken, kabeldoorvoeren"),
    ("other", "Overig", "Modellen die nergens anders in passen"),
]
R = lambda p: re.compile(p, re.I)
RULES = [  # first match wins; (class, group-or-callable, pattern on the name)
    ("stands", lambda m: f"{m.group(1)}×{m.group(2)} m", R(r"^(\d+)x(\d+)[A-Z]+\s?(?:Q?\d+)?$")),
    ("stands", "Collecties", R(r"(collection \d+|modular environments|safe work environments)")),
    ("stands", "Concepten", R(r"^concept [A-Z]$")),
    ("fasteners", "Quick tighteners", R(r"quick tightener|^fenix - quick")),  # before doors/boxes: 'door-to-door', '... box'
    ("covers", None, R(r"^cover")),  # before rigging: 'cover ... wall reinforcement' is a cover
    ("quixy", None, R(r"^quixy")),
    ("furniture", "Balies & bars", R(r"^(bar-b|benta|archie|looping|flex-it|jack$)")),
    ("furniture", "Displays & totems", R(r"^(trans-it|icon|forester|the visitor)")),
    ("flex", "Flexbox", R(r"^flexbox")),
    ("flex", "Flexdeck", R(r"^flexdeck")),
    ("floors", "Step-podia", R(r"^step[ -]")),
    ("floors", None, R(r"^(floor|hi-led subfloor)")),
    ("led", None, R(r"^hi-led (?!55 rigging|55\+ box joining)")),
    ("led", None, R(r"^hi-led\+ (?!box a1)")),
    ("lighting", None, R(r"(led sl\+|led line power|display spot|^the puck|eutrac|omni led line|c90-corner led line)")),
    ("doors", None, R(r"(door|window|glass)")),
    ("rigging", None, R(r"(rigging bar|suspension set|hanging sing|ceiling reinforcement|wall reinforcement|reinforcement|mounting set|wall fixation|floor bracket|spacer)")),
    ("bases", None, R(r"^(?!.*clamp).*(\bbase\b|adjustable foot|wheel|^base )")),
    ("boxes", None, R(r"\b(b-box|e-box|ino box|sub box|super box|omni box|hi-led\+ box|hi-led 55\+ box)\b")),
    ("connections", "Verbindingsknopen", R(r"^(a )?connection \d")),
    ("connections", "Joining sets", R(r"(joining set|quickfix set)")),
    ("connections", "Framekleminen", R(r"(frame clamp|multi clamp|base clamp)")),
    ("connections", "Hoekverbindingen", R(r"(connector|up connector)")),
    ("fasteners", "Quick tighteners", R(r"quick tightener|^fenix - quick")),
    ("fasteners", "Pennen", R(r"^pin ")),
    ("fasteners", "Schroeven, moeren & ogen", R(r"(screw|eye nut|wing nut|^insert )")),
    ("covers", "Panel strips", R(r"^panel strip")),
    ("covers", None, R(r"(^cover|cover|clip(?!per))")),
    ("frames", "Constru", R(r"^constru")),
    ("frames", "Hoekframes", R(r"(corner|^c\d+-corner|^x-corner|^l-corner|^t-corner)")),
    ("frames", "Gebogen frames", R(r"\bR\d{3,}")),
    ("frames", "Profielen", R(r"(profile|^tube|^extend|^linear a2|^up a1|^max-i|^min-i)")),
    ("frames", "Frames", R(r"(omni-\d+|basic-\d+|basic-c55|fab-\d+|poly-\d+|poly\d+|premium omni|^omni-)")),
    ("interior", "Kabeldoorvoer", R(r"wiring grommet")),
    ("interior", None, R(r"(folderholder|clipper|clothes rod|server|shelf|shelfie|shopper|servant|primus|primo|monitor mount|vibe|cabinet)")),
]
def classify(name):
    for cid, group, rx in RULES:
        m = rx.search(name)
        if m:
            g = group(m) if callable(group) else group
            return cid, g
    return "other", None
def main():
    manifest = json.load(open(f"{LIB}/manifest.json"))["models"]
    out, count = {}, collections.Counter()
    for x in manifest:
        if "file" not in x: continue
        cid, g = classify(x["name"])
        out[x["file"].replace("glb/", "")] = {"class": cid, "group": g}
        count[cid] += 1
    json.dump({"classes": [{"id": i, "label": l, "description": d} for i, l, d in CLASSES], "models": out},
              open(f"{LIB}/classes.json", "w"), indent=1, ensure_ascii=False)
    print({c: count[c] for c, _, _ in CLASSES}, sum(count.values()), "models")
    if "--report" in sys.argv:
        for cid in ([sys.argv[sys.argv.index("--only") + 1]] if "--only" in sys.argv else ["other"]):
            names = sorted(x["name"] for x in manifest if "file" in x and classify(x["name"])[0] == cid)
            print(f"-- {cid} ({len(names)}):", " | ".join(names))
if __name__ == "__main__":
    main()
