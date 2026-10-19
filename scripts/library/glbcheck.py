"""Stand-alone GLB checker that mirrors the import rules in src/assetImport.ts (readGlbContainer + size/triangle limits)
and measures the model (bounding box in file units, triangles) without any third-party packages."""
import json, struct, math

MAX_BYTES = 25_000_000
MAX_TRIANGLES = 500_000
UNSUPPORTED = {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "EXT_texture_webp"}

def read_container(data: bytes):
    """Returns (json, problems[], warnings[]). Problems are the reasons the tool would refuse the file."""
    problems, warnings = [], []
    if len(data) < 20: return None, ["te klein"], warnings
    if len(data) > MAX_BYTES: problems.append(f"groter dan {MAX_BYTES // 1_000_000} MB")
    magic, ver, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67: return None, ["geen binair GLB"], warnings
    if ver != 2: problems.append("geen glTF 2")
    if length != len(data): problems.append("headerlengte klopt niet")
    jl, jt = struct.unpack_from("<II", data, 12)
    if jt != 0x4E4F534A or 20 + jl > len(data): return None, problems + ["JSON-blok ongeldig"], warnings
    j = json.loads(data[20:20 + jl].decode("utf8"))
    used = set(j.get("extensionsRequired", [])) | set(j.get("extensionsUsed", []))
    bad = sorted(used & UNSUPPORTED)
    if bad: problems.append("niet-ondersteunde extensie: " + ", ".join(bad))
    for b in j.get("buffers", []):
        if isinstance(b.get("uri"), str) and not b["uri"].startswith("data:"): problems.append("externe buffer")
    for i in j.get("images", []):
        if isinstance(i.get("uri"), str) and not i["uri"].startswith("data:"): problems.append("externe afbeelding")
    if len(j.get("nodes", [])) > 20000 or len(j.get("meshes", [])) > 5000: problems.append("te veel knopen/meshes")
    if not j.get("meshes"): problems.append("geen meshes")
    if j.get("cameras") or j.get("animations"): warnings.append("camera/animatie genegeerd")
    if j.get("skins"): warnings.append("skins genegeerd")
    return j, problems, warnings

def _mat(n):
    if "matrix" in n:
        m = n["matrix"]; return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = n.get("translation", [0, 0, 0]); q = n.get("rotation", [0, 0, 0, 1]); s = n.get("scale", [1, 1, 1])
    x, y, z, w = q
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], t[0]],
            [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], t[1]],
            [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], t[2]], [0, 0, 0, 1]]

def _mul(a, b): return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def measure(j):
    """Walks the default scene; returns (min[3], max[3], triangles, mesh_instances)."""
    nodes, meshes, acc = j.get("nodes", []), j.get("meshes", []), j.get("accessors", [])
    scene = j.get("scenes", [{}])[j.get("scene", 0)] if j.get("scenes") else {"nodes": list(range(len(nodes)))}
    lo, hi, tris, inst = [math.inf] * 3, [-math.inf] * 3, 0, 0
    I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    stack = [(i, I) for i in scene.get("nodes", [])]
    seen = 0
    while stack:
        i, parent = stack.pop(); seen += 1
        if seen > 200_000: break
        n = nodes[i]; M = _mul(parent, _mat(n))
        for c in n.get("children", []): stack.append((c, M))
        if "mesh" in n:
            inst += 1
            for p in meshes[n["mesh"]].get("primitives", []):
                if p.get("mode", 4) != 4: continue
                pa = acc[p["attributes"]["POSITION"]]
                if "min" in pa and "max" in pa:
                    for cx in (pa["min"][0], pa["max"][0]):
                        for cy in (pa["min"][1], pa["max"][1]):
                            for cz in (pa["min"][2], pa["max"][2]):
                                for k in range(3):
                                    v = M[k][0] * cx + M[k][1] * cy + M[k][2] * cz + M[k][3]
                                    lo[k] = min(lo[k], v); hi[k] = max(hi[k], v)
                tris += (acc[p["indices"]]["count"] if "indices" in p else pa["count"]) // 3
    return lo, hi, tris, inst
