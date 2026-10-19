"""Studio render worker. Run inside Blender, headless:

    blender -b --factory-startup --python blender/render_worker.py -- <job_dir>

<job_dir> must contain job.json (see src/renderSpec.ts) and scene.glb. Renders go to <job_dir>/out/,
and a final line "STUDIO_RESULT {json}" reports the outputs with SHA-256 checksums.

STATUS: written against the Blender 4.x Python API but NOT yet executed in Blender. Treat every behaviour
here as unverified until the first real run (see docs/BLENDER.md).
"""
import hashlib
import json
import math
import os
import sys


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def job_dir_from_argv(argv):
    if "--" not in argv or len(argv) <= argv.index("--") + 1:
        raise SystemExit("usage: blender -b --python render_worker.py -- <job_dir>")
    return os.path.abspath(argv[argv.index("--") + 1])


def load_job(job_dir):
    with open(os.path.join(job_dir, "job.json"), "r", encoding="utf-8") as f:
        spec = json.load(f)
    if spec.get("schema") != 1:
        raise ValueError("unsupported job schema %r" % spec.get("schema"))
    glb = os.path.join(job_dir, "scene.glb")
    if sha256_file(glb) != spec["glb"]["sha256"]:
        raise ValueError("scene.glb does not match the checksum in job.json")
    return spec, glb


def setup_scene(bpy, spec, glb_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    bpy.ops.import_scene.gltf(filepath=glb_path)
    return scene


def set_engine(bpy, scene, spec):
    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    if spec["engine"] == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = spec["samples"]
        scene.cycles.use_denoising = True
    else:
        # Blender 4.2+ renamed EEVEE; accept both.
        scene.render.engine = (
            "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
        )
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = spec["samples"]
    res = spec["resolution"]
    scene.render.resolution_x = res["width"]
    scene.render.resolution_y = res["height"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    for transform in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = transform
            break
        except TypeError:
            continue


def setup_world(bpy, scene, spec):
    light = spec["lighting"]
    world = bpy.data.worlds.new("StudioWorld")
    world.use_nodes = True
    scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    background = nodes.get("Background")
    r, g, b = light["worldColor"]
    background.inputs["Color"].default_value = (r, g, b, 1.0)
    background.inputs["Strength"].default_value = light["worldStrength"]
    if light["hazeDensity"] > 0:
        volume = nodes.new("ShaderNodeVolumePrincipled")
        volume.inputs["Density"].default_value = light["hazeDensity"]
        links.new(volume.outputs["Volume"], nodes["World Output"].inputs["Volume"])
    room = spec["room"]
    if light["sunStrength"] > 0:
        sun = bpy.data.lights.new("StudioSun", "SUN")
        sun.energy = light["sunStrength"]
        obj = bpy.data.objects.new("StudioSun", sun)
        obj.rotation_euler = (math.radians(50), 0, math.radians(35))
        scene.collection.objects.link(obj)
    # Soft ceiling fill so enclosed rooms are not black.
    if spec["preset"] != "immersive":
        area = bpy.data.lights.new("StudioFill", "AREA")
        area.shape = "RECTANGLE"
        area.size = room["length"] * 0.8
        area.size_y = room["depth"] * 0.8
        area.energy = 400 if spec["preset"] == "technical" else 150
        obj = bpy.data.objects.new("StudioFill", area)
        obj.location = (0, 0, room["height"] - 0.05)
        obj.rotation_euler = (math.pi, 0, 0)
        scene.collection.objects.link(obj)


def apply_panel_emission(bpy, spec):
    """Projection panels glow in the darker presets, like the browser preview."""
    strength = spec["lighting"]["panelEmission"]
    if strength <= 0:
        return 0
    touched = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" and not any(c.type == "MESH" for c in obj.children_recursive):
            continue
        # glTF extras arrive as custom properties; the Studio exporter writes userData.kind.
        if obj.get("kind") != "panel":
            continue
        for child in [obj] + list(obj.children_recursive):
            if child.type != "MESH":
                continue
            for slot in child.material_slots:
                mat = slot.material
                if not mat or not mat.use_nodes:
                    continue
                bsdf = mat.node_tree.nodes.get("Principled BSDF")
                if bsdf is None:
                    continue
                bsdf.inputs["Emission Color"].default_value = (0.16, 0.5, 0.52, 1.0)
                bsdf.inputs["Emission Strength"].default_value = strength
                touched += 1
    return touched


def make_camera(bpy, scene, cam_spec):
    data = bpy.data.cameras.new(cam_spec["name"])
    data.clip_start = 0.01
    data.clip_end = 200.0
    if cam_spec["orthographic"]:
        data.type = "ORTHO"
        data.ortho_scale = cam_spec["orthoScale"]
    else:
        data.type = "PERSP"
        data.lens_unit = "FOV"
        data.angle = math.radians(cam_spec["fovDegrees"])
    obj = bpy.data.objects.new(cam_spec["name"], data)
    scene.collection.objects.link(obj)
    from mathutils import Vector

    obj.location = Vector(cam_spec["position"])
    direction = Vector(cam_spec["target"]) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def main():
    import bpy  # only available inside Blender

    job_dir = job_dir_from_argv(sys.argv)
    spec, glb_path = load_job(job_dir)
    out_dir = os.path.join(job_dir, "out")
    os.makedirs(out_dir, exist_ok=True)
    scene = setup_scene(bpy, spec, glb_path)
    set_engine(bpy, scene, spec)
    setup_world(bpy, scene, spec)
    glowing = apply_panel_emission(bpy, spec)
    cameras = {c["name"]: make_camera(bpy, scene, c) for c in spec["cameras"]}
    results = []
    for output in spec["outputs"]:
        scene.camera = cameras[output["camera"]]
        path = os.path.join(out_dir, output["file"])
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            raise RuntimeError("render produced no file: %s" % output["file"])
        results.append(
            {
                "camera": output["camera"],
                "file": output["file"],
                "bytes": os.path.getsize(path),
                "sha256": sha256_file(path),
            }
        )
    result = {
        "blender": bpy.app.version_string,
        "engine": scene.render.engine,
        "emissivePanelMaterials": glowing,
        "outputs": results,
    }
    with open(os.path.join(job_dir, "result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print("STUDIO_RESULT " + json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # report once, exit non-zero so the queue records the failure
        sys.stderr.write("STUDIO_ERROR %s: %s\n" % (type(exc).__name__, exc))
        sys.exit(1)
