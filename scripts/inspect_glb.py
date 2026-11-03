#!/usr/bin/env python3
"""Report what a .glb holds: meshes, triangle count, skins, animations, textures. Usage: inspect_glb.py file.glb"""
import json, struct, sys
from pathlib import Path

p = Path(sys.argv[1])
data = p.read_bytes()
magic, version, length = struct.unpack_from('<4sII', data, 0)
assert magic == b'glTF', 'not a glb'
chunk_len, chunk_type = struct.unpack_from('<II', data, 12)
gltf = json.loads(data[20 : 20 + chunk_len])
acc = gltf.get('accessors', [])
tris = 0
for m in gltf.get('meshes', []):
    for prim in m.get('primitives', []):
        if 'indices' in prim:
            tris += acc[prim['indices']]['count'] // 3
print(f'{p.name}: {len(data) / 1e6:.1f} MB')
print('meshes', len(gltf.get('meshes', [])), 'triangles', tris)
print('nodes', len(gltf.get('nodes', [])), 'skins', len(gltf.get('skins', [])), 'joints', sum(len(s.get('joints', [])) for s in gltf.get('skins', [])))
print('animations', [a.get('name', '?') for a in gltf.get('animations', [])])
print('materials', len(gltf.get('materials', [])), 'images', len(gltf.get('images', [])), 'textures', len(gltf.get('textures', [])))
