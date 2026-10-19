"""Diagnostic: import a job's scene.glb into an empty Blender scene and print each mesh's world bounding box.

    blender -b --factory-startup --python blender/diag_bbox.py -- <job_dir>
"""
import bpy, sys, os, json
job = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(job, "scene.glb"))
out = []
for o in bpy.data.objects:
    if o.type == "MESH":
        from mathutils import Vector
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        out.append((o.name, [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)]))
for row in sorted(out)[:12]:
    print("BBOX", row)
print("UNITS", bpy.context.scene.unit_settings.system, bpy.context.scene.unit_settings.scale_length)
