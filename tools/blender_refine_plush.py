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
        "output": Path(args[1]).resolve(),
        "report_dir": Path(args[2]).resolve(),
        "rotation_z_degrees": float(args[3]),
    }


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_model(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.context.scene.objects if obj not in before]


def apply_forward_rotation(objects, degrees):
    if abs(degrees) < 0.001:
        return
    for obj in objects:
        obj.rotation_euler.z += math.radians(degrees)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def smooth_meshes(objects):
    for obj in objects:
        if obj.type != "MESH":
            continue
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def find_principled(material):
    if not material.use_nodes:
        material.use_nodes = True
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def set_input(node, name, value):
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def add_plush_micro_fiber(material):
    principled = find_principled(material)
    if not principled:
        return

    set_input(principled, "Metallic", 0.0)
    set_input(principled, "Roughness", 0.82)
    set_input(principled, "Specular IOR Level", 0.28)
    set_input(principled, "Sheen Weight", 0.38)
    set_input(principled, "Sheen Roughness", 0.72)
    set_input(principled, "Sheen Tint", (1.0, 0.93, 0.9, 1.0))
    set_input(principled, "Coat Weight", 0.0)

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Plush Fiber Noise"
    noise.label = "Short dense plush fiber"
    set_input(noise, "Scale", 82.0)
    set_input(noise, "Detail", 2.5)
    set_input(noise, "Roughness", 0.72)

    texture_coordinate = nodes.new("ShaderNodeTexCoord")
    texture_coordinate.name = "Plush Fiber Coordinates"
    bump = nodes.new("ShaderNodeBump")
    bump.name = "Plush Fiber Bump"
    set_input(bump, "Strength", 0.16)
    set_input(bump, "Distance", 0.008)

    links.new(texture_coordinate.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])

    normal_socket = principled.inputs.get("Normal")
    if normal_socket and normal_socket.is_linked:
        existing_normal = normal_socket.links[0].from_socket
        links.new(existing_normal, bump.inputs["Normal"])
    if normal_socket:
        links.new(bump.outputs["Normal"], normal_socket)

    material.name = "plushFabric"


def world_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return {
        "min": [min(point[i] for point in points) for i in range(3)],
        "max": [max(point[i] for point in points) for i in range(3)],
        "size": [
            max(point[i] for point in points) - min(point[i] for point in points)
            for i in range(3)
        ],
    }


def stats(objects):
    meshes = [obj for obj in objects if obj.type == "MESH"]
    return {
        "mesh_count": len(meshes),
        "vertices": sum(len(obj.data.vertices) for obj in meshes),
        "polygons": sum(len(obj.data.polygons) for obj in meshes),
        "materials": sorted(
            {
                slot.material.name
                for obj in meshes
                for slot in obj.material_slots
                if slot.material
            }
        ),
        "bounds": world_bounds(objects),
    }


def add_camera(location, target):
    camera_data = bpy.data.cameras.new("previewCamera")
    camera = bpy.data.objects.new("previewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    camera.rotation_euler = (
        Vector(target) - camera.location
    ).to_track_quat("-Z", "Y").to_euler()
    return camera


def add_light(name, location, energy, size):
    light_data = bpy.data.lights.new(name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (
        Vector((0, 0, 0)) - light.location
    ).to_track_quat("-Z", "Y").to_euler()


def render_previews(objects, report_dir, model_stats):
    report_dir.mkdir(parents=True, exist_ok=True)
    bounds = model_stats["bounds"]
    center = Vector(
        [(bounds["min"][i] + bounds["max"][i]) * 0.5 for i in range(3)]
    )
    size = Vector(bounds["size"])
    radius = max(size.x, size.y, size.z) * 1.75
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
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
        camera = add_camera(location, center)
        add_light("key", center + Vector((-radius, -radius, radius * 1.2)), 1100, radius)
        add_light("fill", center + Vector((radius, -radius * 0.4, radius)), 700, radius)
        add_light("rim", center + Vector((0, radius, radius)), 900, radius)
        scene.camera = camera
        scene.render.filepath = str(report_dir / f"{view_name}.png")
        bpy.ops.render.render(write_still=True)


def export_model(objects, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
        export_tangents=True,
        export_texcoords=True,
        export_extras=True,
    )


def main():
    config = parse_args()
    clear_scene()
    objects = import_model(config["input"])
    apply_forward_rotation(objects, config["rotation_z_degrees"])
    smooth_meshes(objects)
    for material in bpy.data.materials:
        add_plush_micro_fiber(material)

    model_stats = stats(objects)
    model_stats["source"] = str(config["input"])
    model_stats["rotation_z_degrees"] = config["rotation_z_degrees"]
    export_model(objects, config["output"])
    render_previews(objects, config["report_dir"], model_stats)
    (config["report_dir"] / "stats.json").write_text(
        json.dumps(model_stats, indent=2), encoding="utf-8"
    )
    print("PLUSH_REFINE_DONE", json.dumps(model_stats, ensure_ascii=True))
    bpy.ops.wm.quit_blender()


if __name__ == "__main__":
    main()
