"""Run inside Blender:  blender -b --python scripts/library/convert_to_glb.py -- jobs.json results.json
Each job: {"src": path, "dst": path, "kind": "usdz"|"glb", "max_tris": int|null, "join": bool}
Converts to a plain binary GLB in metres (no Draco/Meshopt/WebP, embedded images only) that the studio's GLB importer accepts.
- usdz: imported with unit conversion so 1 Blender unit = 1 m.
- join: merges objects that share a material (keeps geometry, drops the part hierarchy) to stay under the 20,000-node limit.
- max_tris: applies a collapse-decimate modifier so the model stays under the importer's triangle limit."""
import bpy, sys, json, traceback, mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
jobs = json.load(open(argv[0]))
results = []

def scene_stats():
    tris, lo, hi, objs = 0, [1e30] * 3, [-1e30] * 3, 0
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type != "MESH": continue
        objs += 1
        oe = o.evaluated_get(dg); me = oe.to_mesh()
        me.calc_loop_triangles(); tris += len(me.loop_triangles)
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for k in range(3): lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
        oe.to_mesh_clear()
    return tris, [hi[k] - lo[k] for k in range(3)], objs

for job in jobs:
    r = {"src": job["src"], "dst": job["dst"], "ok": False}
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if job["kind"] == "usdz":
            bpy.ops.wm.usd_import(filepath=job["src"], apply_unit_conversion_scale=True, import_cameras=False, import_lights=False)
        else:
            bpy.ops.import_scene.gltf(filepath=job["src"])
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        for o in list(bpy.context.scene.objects):
            if o.type in {"CAMERA", "LIGHT"}: bpy.data.objects.remove(o, do_unlink=True)
        if meshes:
            # flatten the hierarchy first (keep world transforms) so deleting empties later cannot move any mesh
            bpy.ops.object.select_all(action="DESELECT")
            for o in meshes: o.select_set(True)
            bpy.context.view_layer.objects.active = meshes[0]
            bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        if job.get("join"):
            groups = {}
            for o in meshes:
                groups.setdefault(tuple(sorted(s.material.name if s.material else "" for s in o.material_slots)), []).append(o)
            for objs in groups.values():
                bpy.ops.object.select_all(action="DESELECT")
                for o in objs: o.select_set(True)
                bpy.context.view_layer.objects.active = objs[0]
                if len(objs) > 1: bpy.ops.object.join()
            for e in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]:
                bpy.data.objects.remove(e, do_unlink=True)
        tris, dim, n = scene_stats()
        r.update(tris_before=tris)
        if job.get("max_tris") and tris > job["max_tris"]:
            ratio = job["max_tris"] * 0.92 / tris
            for o in bpy.context.scene.objects:
                if o.type == "MESH":
                    m = o.modifiers.new("dec", "DECIMATE"); m.ratio = ratio
            tris, dim, n = scene_stats()
            r["decimated_ratio"] = round(ratio, 3)
        import os
        # Escalate until the file fits the importer's 25 MB limit: PNG/JPEG as-is, JPEG, then smaller textures, then fewer triangles.
        passes = [("AUTO", None), ("JPEG", None), ("JPEG", 2048), ("JPEG", 1024), ("JPEG", 512), ("JPEG", 256)]
        for fmt, max_tex in passes:
            if max_tex:
                for img in bpy.data.images:
                    if img.size[0] > max_tex or img.size[1] > max_tex:
                        k = max_tex / max(img.size[0], img.size[1])
                        img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))
            bpy.ops.export_scene.gltf(filepath=job["dst"], export_format="GLB", export_apply=True, export_cameras=False,
                                      export_lights=False, export_draco_mesh_compression_enable=False,
                                      export_image_format=fmt, export_jpeg_quality=80, export_yup=True)
            r["image_format"] = fmt; r["max_texture_px"] = max_tex
            if os.path.getsize(job["dst"]) <= 24_500_000: break
        r["bytes"] = os.path.getsize(job["dst"])
        r.update(ok=True, tris=tris, dim_m=[round(x, 4) for x in dim], mesh_objects=n)
    except Exception as e:
        r["error"] = f"{type(e).__name__}: {e}"; r["trace"] = traceback.format_exc()[-600:]
    results.append(r); print("JOB", json.dumps({k: v for k, v in r.items() if k != "trace"}))
json.dump(results, open(argv[1], "w"), indent=1)
