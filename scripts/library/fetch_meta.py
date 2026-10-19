"""Fetch public 3D Warehouse metadata for the Aluvision Exhibits organisation (no sign-in needed).
Writes library/aluvision/_warehouse_meta.json: id, title, description, tags, categories, dimensions (mm), dynamic flag."""
import json, os, sys, urllib.request
ORG = "59d996cc-728c-4408-93f2-b37b632c63e1"
OUT = sys.argv[1] if len(sys.argv) > 1 else "library/aluvision/_warehouse_meta.json"
base = ("https://3dwarehouse.sketchup.com/warehouse/v1.0/entities?show=all&q=&sortBy=createTime%20desc"
        "&showBinaryMetadata=true&count=64&contentType=3dw&recordEvent=false"
        f"&fq=creator.id%3D%3D{ORG}&showAttributes=true&lang=en-GB%2Cen")
ents = []
for off in range(0, 1000, 64):
    j = json.load(urllib.request.urlopen(base + f"&offset={off}", timeout=60))
    ents += j["entries"]
    if len(j["entries"]) < 64: break
def val(d, *path):
    for p in path:
        d = (d or {}).get(p)
    return (d or {}).get("value") if isinstance(d, dict) else d
meta = []
for e in ents:
    a = e.get("attributes", {})
    skp = a.get("skp", {})
    meta.append({
        "id": e["id"], "title": (e.get("title") or "").strip(),
        "description": e.get("description") or "", "tags": e.get("tags") or [],
        "createTime": e.get("createTime"), "modifyTime": e.get("modifyTime"),
        "domain": val(a.get("categories", {}), "domain"), "subdomain": val(a.get("categories", {}), "subdomain"),
        "dynamic": bool(val(skp, "isDynamicComponent")), "polygons": val(skp, "polygons"),
        "mm": [val(skp, "modelWidthmm"), val(skp, "modelDepthmm"), val(skp, "modelHeightmm")],
        "skpVersion": val(skp, "version"),
        "glb": ("glb" in e["binaries"]), "usdz": ("usdz" in e["binaries"]),
        "url": f"https://3dwarehouse.sketchup.com/model.html?id={e['id']}",
    })
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(meta, open(OUT, "w"), indent=1, ensure_ascii=False)
print(len(meta), "models ->", OUT)
