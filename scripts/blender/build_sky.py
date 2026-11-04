"""
Render one equirectangular sky per area with Blender's Nishita sky model, for the game's sky dome.

    blender -b -P scripts/blender/build_sky.py [-- --area hub ...]

Each area is a time of day and a tint: the hub at a warm late afternoon, the valley at a clear
morning, the town toward evening, the quarter at blue dusk, the stage at night. The renders go to
public/sky/<area>.jpg (1024 x 512). Cycles on the CPU, a handful of samples: the sky is analytic
and renders clean.
"""
import argparse
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'sky')

# sun elevation (deg), sun rotation (deg), sun intensity, air, dust, ozone, tint rgb, tint strength
SKIES = {
    'hub': dict(elevation=22, rotation=200, intensity=0.6, air=1.0, dust=0.5, ozone=1.0, tint=(1.0, 0.86, 0.62)),
    'valley': dict(elevation=48, rotation=160, intensity=0.5, air=1.0, dust=0.2, ozone=1.4, tint=(0.82, 0.95, 1.0)),
    'town': dict(elevation=12, rotation=240, intensity=0.7, air=1.2, dust=0.9, ozone=0.8, tint=(1.0, 0.78, 0.62)),
    'jazz': dict(elevation=-3, rotation=120, intensity=0.4, air=1.6, dust=1.0, ozone=3.0, tint=(0.62, 0.45, 0.95)),
    'stage': dict(elevation=-8, rotation=90, intensity=0.3, air=1.2, dust=0.4, ozone=4.0, tint=(0.38, 0.32, 0.6)),
}


def render_sky(area, cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium Contrast'

    world = bpy.data.worlds.new('sky')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = cfg['elevation'] * 3.14159 / 180
    sky.sun_rotation = cfg['rotation'] * 3.14159 / 180
    sky.sun_intensity = cfg['intensity']
    sky.sun_size = 1.5 * 3.14159 / 180
    sky.air_density = cfg['air']
    sky.dust_density = cfg['dust']
    sky.ozone_density = cfg['ozone']
    sky.altitude = 300
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Fac'].default_value = 0.55
    mix.inputs['Color2'].default_value = (*cfg['tint'], 1.0)
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], mix.inputs['Color1'])
    nt.links.new(mix.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'PANO'
    cam_data.panorama_type = 'EQUIRECTANGULAR'
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    cam.rotation_euler = (3.14159 / 2, 0, 0)
    scene.camera = cam

    os.makedirs(OUT, exist_ok=True)
    scene.render.filepath = os.path.join(OUT, f'{area}.jpg')
    bpy.ops.render.render(write_still=True)
    print('wrote', scene.render.filepath)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', action='append', default=[])
    args = ap.parse_args(argv)
    for area in args.area or SKIES:
        render_sky(area, SKIES[area])


if __name__ == '__main__':
    main()
