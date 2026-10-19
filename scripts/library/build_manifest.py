"""Builds library/aluvision/manifest.json: every Aluvision warehouse model that has an import-ready GLB, measured and checked with
the same rules as the studio's GLB importer, plus the metadata the importer asks for (name, units, role, provenance).
python3 scripts/library/build_manifest.py  (run from the repository root)"""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbcheck as G
LIB = "library/aluvision"
meta = json.load(open(f"{LIB}/_warehouse_meta.json"))
conv = json.load(open(f"{LIB}/_conversion_results.json")) if os.path.exists(f"{LIB}/_conversion_results.json") else {}
heavy_ids = {"9ddefc79": "decimiert tot onder 500.000 driehoeken", "af526d9a": "meshes per materiaal samengevoegd (hiërarchie vervangen) om onder 20.000 knopen te blijven"}
files = {f.rsplit("__", 1)[1][:8]: f for f in os.listdir(f"{LIB}/glb") if f.endswith(".glb")}
usdz_ids = {m["id"][:8] for m in meta if not m["glb"] and m["usdz"]}
out, summary = [], {"ready": 0, "refused": 0, "missing": 0}
for m in meta:
    key = m["id"][:8]
    e = {"warehouseId": m["id"], "name": (m["title"] or key)[:120], "role": "custom", "units": "m",
         "provenance": f"Aluvision Exhibits, SketchUp 3D Warehouse: {m['url']}"[:500], "license": None,
         "warehouse": {k: m[k] for k in ("description", "tags", "domain", "subdomain", "dynamic", "skpVersion", "mm", "url", "modifyTime")}}
    f = files.get(key)
    if not f:
        e.update(status="missing", reason="geen openbaar GLB of USDZ in de 3D Warehouse; .skp-conversie nodig"); summary["missing"] += 1
        out.append(e); continue
    path = f"{LIB}/glb/{f}"; data = open(path, "rb").read()
    j, problems, warnings = G.read_container(data)
    e.update(file=f"glb/{f}", bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    notes = []
    if key in usdz_ids: notes.append("geconverteerd van USDZ met Blender (eenheden naar meters)")
    if key in heavy_ids: notes.append(heavy_ids[key])
    if j is not None:
        lo, hi, tris, inst = G.measure(j)
        size_m = [hi[i] - lo[i] for i in range(3)]
        if tris > G.MAX_TRIANGLES: problems.append(f"{tris} driehoeken > {G.MAX_TRIANGLES}")
        if not all(s > 0 for s in size_m): problems.append("platte of lege geometrie")
        e.update(triangles=tris, sizeCm={"x": round(size_m[0] * 100, 2), "y": round(size_m[1] * 100, 2), "z": round(size_m[2] * 100, 2)},
                 catalogId="IMP-" + e["sha256"][:8].upper())
        mm = sorted(x for x in m["mm"] if x)
        if len(mm) == 3:
            got = sorted(s * 1000 for s in size_m)
            if not all(abs(got[i] - mm[i]) <= max(2, 0.03 * mm[i]) for i in range(3)):
                notes.append("afmetingen wijken af van de SketchUp-modelmaat in de warehouse-metadata (GLB bevat mogelijk minder onderdelen)")
    e["notes"] = notes + warnings
    if problems: e.update(status="refused", reason="; ".join(problems)); summary["refused"] += 1
    else: e["status"] = "ready"; summary["ready"] += 1
    out.append(e)
dupes = {}
for e in out:
    if e.get("sha256"): dupes.setdefault(e["sha256"], []).append(e["name"])
dupes = {k: v for k, v in dupes.items() if len(v) > 1}
import math
def finite(o):  # strict JSON: Infinity/NaN (flat or empty geometry) become null
    if isinstance(o, float) and not math.isfinite(o): return None
    if isinstance(o, dict): return {k: finite(v) for k, v in o.items()}
    if isinstance(o, list): return [finite(v) for v in o]
    return o
json.dump(finite({"source": "Aluvision Exhibits, SketchUp 3D Warehouse", "unitsInFiles": "m", "summary": summary, "duplicateContent": list(dupes.values()), "models": out}),
          open(f"{LIB}/manifest.json", "w"), indent=1, ensure_ascii=False, allow_nan=False)
print(summary, "| identical-content groups:", len(dupes))
