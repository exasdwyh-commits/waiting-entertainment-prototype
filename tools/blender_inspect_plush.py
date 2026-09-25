import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return {
        "input": Path(args[0]).resolve(),
        "output_dir": Path(args[1]).resolve(),
    }


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def import_model(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.context.scene.objects if obj not in before]


def world_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return None
    return {
        "min": [min(point[i] for point in points) for i in range(3)],
        "max": [max(point[i] for point in points) for i in range(3)],
        "size": [
            max(point[i] for point in points) - min(point[i] for point in points)
            for i in range(3)
        ],
    }


def model_stats(objects):
    meshes = [obj for obj in objects if obj.type == "MESH"]
    materials = {}
    for obj in meshes:
        for material_slot in obj.material_slots:
            material = material_slot.material
            if not material:
                continue
            entry = materials.setdefault(
                material.name,
                {
                    "users": 0,
                    "blend_method": getattr(material, "blend_method", None),
                    "roughness": getattr(material, "roughness", None),
                    "metallic": getattr(material, "metallic", None),
                },
            )
            entry["users"] += 1

    return {
        "objects": [
            {
                "name": obj.name,
                "type": obj.type,
                "vertices": len(obj.data.vertices) if obj.type == "MESH" else 0,
                "polygons": len(obj.data.polygons) if obj.type == "MESH" else 0,
                "materials": [
                    slot.material.name
                    for slot in obj.material_slots
                    if slot.material
                ],
                "dimensions": list(obj.dimensions),
                "location": list(obj.location),
                "rotation": list(obj.rotation_euler),
            }
            for obj in objects
        ],
        "mesh_count": len(meshes),
        "vertices": sum(len(obj.data.vertices) for obj in meshes),
        "polygons": sum(len(obj.data.polygons) for obj in meshes),
        "materials": materials,
        "bounds": world_bounds(objects),
    }


def add_camera(objects, camera_name, location, target):
    camera_data = bpy.data.cameras.new(camera_name)
    camera = bpy.data.objects.new(camera_name, camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def add_light(name, location, energy, size):
    light_data = bpy.data.lights.new(name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (0, 0, 0)
    light.rotation_euler = (
        Vector((0, 0, 0)) - light.location
    ).to_track_quat("-Z", "Y").to_euler()
    return light


def render_preview(objects, output_dir, stats):
    bounds = stats["bounds"]
    center = Vector(
        [
            (bounds["min"][axis] + bounds["max"][axis]) * 0.5
            for axis in range(3)
        ]
    )
    size = Vector(bounds["size"])
    radius = max(size.x, size.y, size.z) * 1.75

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.035, 0.035, 0.035)

    views = {
        "front": center + Vector((0, -radius, size.z * 0.08)),
        "side": center + Vector((radius, 0, size.z * 0.08)),
        "three-quarter": center
        + Vector((radius * 0.72, -radius * 0.72, size.z * 0.12)),
    }
    for view_name, location in views.items():
        for obj in list(bpy.data.objects):
            if obj.type in {"CAMERA", "LIGHT"}:
                bpy.data.objects.remove(obj, do_unlink=True)
        add_camera(objects, f"{view_name}_camera", location, center)
        add_light("key", center + Vector((-radius, -radius, radius * 1.2)), 1100, radius)
        add_light("fill", center + Vector((radius, -radius * 0.4, radius)), 700, radius)
        add_light("rim", center + Vector((0, radius, radius)), 900, radius)
        scene.camera = bpy.data.objects[f"{view_name}_camera"]
        scene.render.filepath = str(output_dir / f"{view_name}.png")
        bpy.ops.render.render(write_still=True)


def main():
    config = parse_args()
    config["output_dir"].mkdir(parents=True, exist_ok=True)
    clear_scene()
    objects = import_model(config["input"])
    stats = model_stats(objects)
    stats["source"] = str(config["input"])
    (config["output_dir"] / "stats.json").write_text(
        json.dumps(stats, indent=2), encoding="utf-8"
    )
    render_preview(objects, config["output_dir"], stats)
    print("PLUSH_INSPECT_DONE", json.dumps(stats, ensure_ascii=True))
    bpy.ops.wm.quit_blender()


if __name__ == "__main__":
    main()
