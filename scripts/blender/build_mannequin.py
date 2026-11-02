"""
The placeholder player: a rounded mannequin in the singer's colours (ochre cloak, red scarf),
built from bevelled boxes and spheres, exported as public/character/mannequin.glb.

    blender -b -P scripts/blender/build_mannequin.py

Each limb is its own node with its origin at the joint, so the game can swing them for a
procedural walk:  Root > Hips > { Torso > { Head, ArmL, ArmR }, LegL, LegR }.
This is replaced by the Tripo character when it arrives (public/character/player.glb).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy
from build_area import Builder, clear_scene, material  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'character', 'mannequin.glb')

CLOAK = 0xC8923A
CLOAK_DARK = 0xA8752C
SCARF = 0xC4453B
SKIN = 0xF1C9A5
HAIR = 0x5A3A2A
BOOT = 0x3A2F2A
EYE = 0x2A2222

LEG = 0.42
TORSO = 0.42
HEAD_R = 0.17


def empty(name, location, parent=None):
    o = bpy.data.objects.new(name, None)
    o.location = location
    o.parent = parent
    bpy.context.scene.collection.objects.link(o)
    return o


def main():
    clear_scene()
    cloak = material('cloak', CLOAK, rough=0.9)
    cloak_dark = material('cloak-dark', CLOAK_DARK, rough=0.9)
    scarf = material('scarf', SCARF, rough=0.8)
    skin = material('skin', SKIN, rough=0.7)
    hair = material('hair', HAIR, rough=0.9)
    boot = material('boot', BOOT, rough=0.6)
    eye = material('eye', EYE, rough=0.3)

    root = empty('Root', (0, 0, 0))
    hips = empty('Hips', (0, 0, LEG), root)

    # Legs hang from the hips; their meshes extend downward from the joint.
    for name, sx in (('LegL', -1), ('LegR', 1)):
        leg = empty(name, (sx * 0.1, 0, 0), hips)
        b = Builder(name + 'Mesh')
        b.box((0, 0, -LEG * 0.5 + 0.04), (0.16, 0.18, LEG - 0.08), cloak_dark, bevel=0.05)
        b.box((0, 0.02, -LEG + 0.06), (0.18, 0.26, 0.12), boot, bevel=0.04)
        b.build(parent=leg)

    torso = empty('Torso', (0, 0, 0), hips)
    b = Builder('TorsoMesh')
    # A cloak that flares at the hem, built as two boxes.
    b.box((0, 0, TORSO * 0.5), (0.4, 0.3, TORSO), cloak, bevel=0.08)
    b.box((0, 0, 0.08), (0.48, 0.36, 0.16), cloak, bevel=0.06)
    # The scarf wraps the neck and hangs down the back.
    b.box((0, 0, TORSO - 0.02), (0.3, 0.3, 0.1), scarf, bevel=0.04)
    b.box((0.08, -0.17, TORSO - 0.2), (0.1, 0.05, 0.32), scarf, bevel=0.02)
    b.build(parent=torso)

    for name, sx in (('ArmL', -1), ('ArmR', 1)):
        arm = empty(name, (sx * 0.24, 0, TORSO - 0.06), torso)
        b = Builder(name + 'Mesh')
        b.box((0, 0, -0.17), (0.1, 0.12, 0.34), cloak, bevel=0.04)
        b.sphere((0, 0, -0.36), 0.055, skin, subdiv=1)
        b.build(parent=arm)

    head = empty('Head', (0, 0, TORSO + 0.02), torso)
    b = Builder('HeadMesh')
    b.sphere((0, 0, HEAD_R), HEAD_R, skin, scale=(1, 0.95, 1.05), subdiv=2)
    # The hood: a larger sphere cut to the back half by offsetting it behind the face.
    b.sphere((0, -0.085, HEAD_R + 0.04), HEAD_R + 0.03, cloak, scale=(1, 1, 1.08), subdiv=2)
    b.sphere((0, 0.03, HEAD_R + 0.12), HEAD_R * 0.75, hair, scale=(1.1, 1, 0.6), subdiv=1)
    for sx in (-1, 1):
        b.sphere((sx * 0.065, HEAD_R * 0.86, HEAD_R + 0.02), 0.022, eye, subdiv=1)
    b.build(parent=head)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_animations=False, export_lights=False, export_cameras=False)
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
