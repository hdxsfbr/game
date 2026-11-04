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

# With --spots-all, one line per thing worth looking at ("SPOT area x y name kind"): every door and gate as above, plus the start,
# each bench, person, prop, stage, fragment and exit, from a walkable tile two steps toward the camera
# (south) when there is one, else the nearest walkable tile. For scripts/reviewshots.sh.
if '--spots-all' in sys.argv:
    def near(a, x, y, free):
        for sx, sy in ((x, y + 2), (x, y + 1), (x + 2, y), (x - 2, y), (x, y - 2), (x + 1, y), (x - 1, y), (x, y - 1)):
            if free(sx, sy):
                return sx, sy
        return None
    for area_id, area in ba.parse_areas(src).items():
        a = ba.Area(area, {})
        staged = {t for e in area['entities'] if e['kind'] == 'stage' for t in e['tiles']}
        free = lambda x, y: a.at(x, y) in ('.', '=') and (x, y) not in staged
        sx, sy = area['start']
        print(f"SPOT {area_id} {sx} {sy} start start")
        for e in area['entities']:
            k = e['kind']
            if k in ('door', 'gate'):
                x, y = e['tiles'][0]
                axis = a.door_axis(x, y)
                cands = [(x, y + 2), (x, y - 2)] if axis == 'x' else [(x + 2, y), (x - 2, y)]
                spot = next(((cx, cy) for cx, cy in cands if free(cx, cy)), None)
                name = e.get('id', e.get('flag'))
            elif k == 'stage':
                xs = [t[0] for t in e['tiles']]; ys = [t[1] for t in e['tiles']]
                spot = near(a, (min(xs) + max(xs)) // 2, max(ys), free)
                name = 'stage'
            elif k == 'exit':
                spot = near(a, *e['tiles'][0], free)
                name = 'exit-' + e['to']
            elif k == 'practice':
                spot = e['at']
                name = 'bench'
            elif k in ('npc', 'prop'):
                spot = near(a, *e['tile'], free)
                name = e['model']
            elif k == 'fragment':
                spot = near(a, *e['tile'], free)
                name = 'fragment'
            else:
                continue
            if spot:
                print(f"SPOT {area_id} {spot[0]} {spot[1]} {name} {k}")
    # Everything opened, for shots in colour.
    import json
    solved = []
    for area_id, area in ba.parse_areas(src).items():
        for e in area['entities']:
            if e['kind'] == 'door':
                solved.append(e['id'])
        solved.append('fragment-' + area_id)
    print('PROGRESS ' + json.dumps({'solved': solved, 'drilled': list(ba.parse_areas(src)), 'cardsSeen': list(ba.parse_areas(src)), 'fragments': 3}))
