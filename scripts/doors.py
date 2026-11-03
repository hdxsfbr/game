#!/usr/bin/env python3
"""List every door and gate with its neighbours and the facing the generator will give it.
Usage: python3 scripts/doors.py      (reads src/world/areas.ts through build_area.py's parser, no Blender needed)"""
import sys, types, pathlib
sys.modules['bpy'] = types.ModuleType('bpy')  # build_area imports bpy at the top; the parser does not use it
sys.modules['bmesh'] = types.ModuleType('bmesh')
mu = types.ModuleType('mathutils')
mu.Vector = object
sys.modules['mathutils'] = mu
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / 'blender'))
import build_area as ba  # noqa: E402

src = (pathlib.Path(__file__).resolve().parent.parent / 'src/world/areas.ts').read_text()
for area_id, area in ba.parse_areas(src).items():
    a = ba.Area(area, {})
    for e in area['entities']:
        if e['kind'] not in ('door', 'gate'):
            continue
        for (x, y) in e['tiles']:
            n = {d: a.at(x + dx, y + dy) for d, (dx, dy) in {'W': (-1, 0), 'E': (1, 0), 'N': (0, -1), 'S': (0, 1)}.items()}
            axis = a.door_axis(x, y)
            passage = 'north-south' if axis == 'x' else 'east-west'
            print(f"{area_id:6} {e['kind']:4} {e.get('id', e.get('flag')):22} ({x:2},{y:2})  W={n['W']} E={n['E']} N={n['N']} S={n['S']}  slab spans {axis}: passage {passage}")

# With --spots, print one line per door or gate: "area x y name", a walkable tile two steps away on the
# passage side, for screenshots (scripts/doorshots.sh).
if '--spots' in sys.argv:
    for area_id, area in ba.parse_areas(src).items():
        a = ba.Area(area, {})
        for e in area['entities']:
            if e['kind'] not in ('door', 'gate'):
                continue
            x, y = e['tiles'][0]
            axis = a.door_axis(x, y)
            cands = [(x, y + 2), (x, y - 2)] if axis == 'x' else [(x + 2, y), (x - 2, y)]
            for sx, sy in cands:
                if a.at(sx, sy) in ('.', '='):
                    print(f"SPOT {area_id} {sx} {sy} {e.get('id', e.get('flag'))}")
                    break
