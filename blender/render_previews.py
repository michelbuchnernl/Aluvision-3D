"""Renders a small preview PNG (transparent background) of every ready model in the library manifest.

    blender -b --factory-startup --python blender/render_previews.py -- <library_dir> [start] [end]

Reads <library_dir>/manifest.json, writes <library_dir>/previews/<file stem>.png (256 x 256) and skips existing files, so
it can be interrupted and resumed. One Blender session handles many models; imported objects are removed after each one.
Preview framing is a fixed three-quarter view from the front-left, above; it does not reflect any real-world orientation.
"""
import json
import math
import os
import re
import sys
import time

SIZE = 256


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not a:
        raise SystemExit("usage: blender -b --python render_previews.py -- <library_dir> [start] [end]")
    return a[0], int(a[1]) if len(a) > 1 else 0, int(a[2]) if len(a) > 2 else 10**9


def setup(bpy):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    if hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 70
    for transform in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = transform
            break
        except TypeError:
            continue
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.8, 0.82, 0.85, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-40))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = math.radians(30)
    cam_data.clip_start = 0.001
    cam_data.clip_end = 1000
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def frame(cam, objs):
    from mathutils import Vector

    pts = []
    for o in objs:
        if o.type == "MESH":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not pts:
        return False
    lo = Vector((min(p[i] for p in pts) for i in range(3)))
    hi = Vector((max(p[i] for p in pts) for i in range(3)))
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1e-4)
    az, el = math.radians(-35), math.radians(25)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    dist = radius / math.sin(cam.data.angle / 2) * 1.08
    cam.location = centre + direction * dist
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    return True


COLLECTIONS = ("objects", "meshes", "materials", "images", "textures", "node_groups", "cameras", "lights", "armatures", "actions")


def snapshot(bpy):
    return {c: set(getattr(bpy.data, c).keys()) for c in COLLECTIONS}


def remove_new(bpy, before):
    """Removes exactly the datablocks an import created (a recursive orphan purge is far too slow on heavy models)."""
    for c in COLLECTIONS:
        coll = getattr(bpy.data, c)
        new = [d for d in coll if d.name not in before[c]]
        if new:
            bpy.data.batch_remove(ids=new)


def main():
    import bpy

    lib, start, end = args()
    manifest = json.load(open(os.path.join(lib, "manifest.json"), encoding="utf-8"))["models"]
    ready = [m for m in manifest if m.get("status") == "ready" and m.get("file")]
    out_dir = os.path.join(lib, "previews")
    os.makedirs(out_dir, exist_ok=True)
    scene, cam = setup(bpy)
    keep = {o.name for o in bpy.data.objects}
    done = failed = skipped = 0
    for i, m in enumerate(ready[start:end], start):
        file = m["file"].replace("glb/", "")
        stem = file[:-4]
        if not re.match(r"^[\w.+-]+$", stem):
            continue
        out = os.path.join(out_dir, stem + ".png")
        if os.path.exists(out):
            skipped += 1
            continue
        t0 = time.time()
        try:
            before = snapshot(bpy)
            before_objects = set(bpy.data.objects.keys())
            bpy.ops.import_scene.gltf(filepath=os.path.join(lib, "glb", file))
            imported = [o for o in bpy.data.objects if o.name not in before_objects and o.name not in keep]
            if not frame(cam, imported):
                raise RuntimeError("no mesh geometry")
            scene.render.filepath = out
            bpy.ops.render.render(write_still=True)
            done += 1
            print("PREVIEW ok %d %s %.1fs" % (i, stem, time.time() - t0), flush=True)
        except Exception as exc:
            failed += 1
            print("PREVIEW failed %d %s %s" % (i, stem, exc), flush=True)
        finally:
            remove_new(bpy, before)
    print("PREVIEWS done=%d failed=%d skipped=%d total_ready=%d" % (done, failed, skipped, len(ready)), flush=True)


if __name__ == "__main__":
    main()
