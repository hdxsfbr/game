"""
Build a stylized low-poly 3D scene for one area of The Listening Kingdom from its ASCII map and
export it as glTF.

    blender -b -P scripts/blender/build_area.py -- --area hub [--out public/world]
    blender -b -P scripts/blender/build_area.py -- --all

The map and the entities come straight from src/world/areas.ts (parsed as text, so the 2D and 3D
worlds can never drift apart); colours come from src/world/palette.ts.

Legend: # wall, . ground, ~ water, T tree, = bridge, D door tile, X exit, G gate.

Coordinates: tile (tx, ty) sits at Blender (tx + 0.5, -(ty + 0.5), 0), i.e. map north is +Y here.
The glTF exporter turns that into Y-up, so in the game (right-handed) a tile is at
(tx + 0.5, 0, ty + 0.5) and the map's south is +Z.

Objects the game looks up by name:
  door:<puzzleId>:<i>   one per door tile, removed (sunk / faded) when the puzzle is solved
  gate:<flag>:<i>       one per gate tile, raised when the flag is set
  bench                 the practice bench
Everything else is joined into a few static meshes (ground, water, walls, trees, bridges, props).
"""
import argparse
import math
import os
import re
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AREAS_TS = os.path.join(ROOT, 'src', 'world', 'areas.ts')
PALETTE_TS = os.path.join(ROOT, 'src', 'world', 'palette.ts')

WALL = '#'
# Height of a stage deck; src/scenes3d/World.ts STAGE_H lifts the people standing on it by the same amount.
STAGE_H = 0.24
GROUND = '.'
WATER = '~'
TREE = 'T'
BRIDGE = '='
DOOR = 'D'
EXIT = 'X'
GATE = 'G'

# ---------------------------------------------------------------- parsing the TypeScript


def parse_areas(src):
    """Return {id: {'id', 'palette', 'map': [rows], 'entities': [dict]}} from areas.ts."""
    areas = {}
    for m in re.finditer(r'export const (\w+): AreaDef = \{(.*?)\n\};', src, re.S):
        body = m.group(2)
        area_id = re.search(r"\bid: '([\w-]+)'", body).group(1)
        palette = re.search(r"\bpalette: '(\w+)'", body).group(1)
        map_block = re.search(r'\bmap: \[(.*?)\n\s*\],', body, re.S).group(1)
        rows = re.findall(r"'([^']*)'", map_block)
        start = re.search(r'\bstart: \{ x: (\d+), y: (\d+) \}', body)
        ent_start = body.index('entities: [')
        entities = []
        depth = 0
        cur = None
        for i in range(ent_start + len('entities: ['), len(body)):
            ch = body[i]
            if ch == '{':
                if depth == 0:
                    cur = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0 and cur is not None:
                    entities.append(parse_entity(body[cur:i + 1]))
                    cur = None
            elif ch == ']' and depth == 0:
                break
        areas[area_id] = {
            'id': area_id,
            'palette': palette,
            'map': rows,
            'start': (int(start.group(1)), int(start.group(2))),
            'entities': [e for e in entities if e],
        }
    return areas


def parse_entity(text):
    kind = re.search(r"kind: '(\w+)'", text).group(1)
    e = {'kind': kind}
    tiles_re = r'\{ x: (\d+), y: (\d+) \}'
    if kind in ('door', 'gate', 'exit', 'stage'):
        tiles_block = re.search(r'tiles: \[(.*?)\]', text, re.S).group(1)
        e['tiles'] = [(int(x), int(y)) for x, y in re.findall(tiles_re, tiles_block)]
    if kind == 'door':
        e['id'] = re.search(r"\bid: '([\w-]+)'", text).group(1)
        tex = re.search(r"texture: '([\w-]+)'", text)
        e['texture'] = tex.group(1) if tex else 'door-closed'
    elif kind == 'gate':
        e['flag'] = re.search(r"flag: '([\w-]+)'", text).group(1)
    elif kind in ('practice', 'fragment'):
        t = re.search(r'tile: ' + tiles_re, text)
        e['tile'] = (int(t.group(1)), int(t.group(2)))
        if kind == 'practice':
            a = re.search(r'at: ' + tiles_re, text)
            e['at'] = (int(a.group(1)), int(a.group(2)))
    elif kind in ('npc', 'prop'):
        t = re.search(r'tile: ' + tiles_re, text)
        e['tile'] = (int(t.group(1)), int(t.group(2)))
        e['model'] = re.search(r"model: '([\w-]+)'", text).group(1)
    elif kind == 'exit':
        e['to'] = re.search(r"to: '(\w+)'", text).group(1)
    return e


def parse_palettes(src):
    block = src[src.index('export const PALETTES'):]
    out = {}
    for m in re.finditer(r'\n  (\w+): \{(.*?)\n  \},', block, re.S):
        out[m.group(1)] = {k: int(v, 16) for k, v in re.findall(r'(\w+): 0x([0-9a-fA-F]{6})', m.group(2))}
    return out


# ---------------------------------------------------------------- helpers


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, mul=1.0):
    r, g, b = (h >> 16) & 255, (h >> 8) & 255, h & 255
    return tuple(min(1.0, srgb_to_linear(v) * mul) for v in (r, g, b))


def shade(h, k):
    """Darken (k < 1) or lighten (k > 1) an sRGB hex colour."""
    r, g, b = (h >> 16) & 255, (h >> 8) & 255, h & 255
    f = lambda v: max(0, min(255, int(v * k)))
    return (f(r) << 16) | (f(g) << 8) | f(b)


def mix(a, b, t):
    """Blend sRGB hex colour a toward b by t in [0, 1]."""
    ch = lambda h, sh: (h >> sh) & 255
    f = lambda sh: int(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * t)
    return (f(16) << 16) | (f(8) << 8) | f(0)


_materials = {}


def material(name, rgb_hex, rough=0.85, metal=0.0, emission=None, alpha=1.0, mul=1.0):
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*hex_rgb(rgb_hex, mul), 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*hex_rgb(emission), 1.0)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    _materials[name] = m
    return m


def hash2(x, y, salt=0):
    v = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65535.0


class Builder:
    """Accumulates geometry into a bmesh with per-face material indices, then makes one object."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.sharp_edges = []

    def mat_index(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def box(self, center, size, mat, bevel=0.0, segments=2, smooth=True):
        """An axis-aligned box. center (x, y, z), size (sx, sy, sz)."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=min(bevel, min(size) * 0.45), segments=segments, affect='EDGES', profile=0.7)
        for v in bm.verts:
            v.co += Vector(center)
        self._absorb(bm, mat, smooth)

    def wedge(self, center, size, mat, axis='x', smooth=False):
        """A pitched roof: a box whose top edge is pinched to a ridge running along `axis`."""
        bm = bmesh.new()
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        cx, cy, cz = center
        if axis == 'x':
            vs = [bm.verts.new(Vector(v)) for v in ((cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz), (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz), (cx - sx, cy, cz + sz), (cx + sx, cy, cz + sz))]
            faces = [(0, 1, 2, 3)[::-1], (0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
        else:
            vs = [bm.verts.new(Vector(v)) for v in ((cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz), (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz), (cx, cy - sy, cz + sz), (cx, cy + sy, cz + sz))]
            faces = [(0, 1, 2, 3)[::-1], (1, 2, 5, 4), (3, 0, 4, 5), (0, 1, 4), (2, 3, 5)]
        for f in faces:
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._absorb(bm, mat, smooth)

    def sphere(self, center, radius, mat, scale=(1, 1, 1), subdiv=2, smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
        for v in bm.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(center)
        self._absorb(bm, mat, smooth)

    def cylinder(self, center, radius, height, mat, segments=10, radius2=None, smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius if radius2 is None else radius2, depth=height)
        for v in bm.verts:
            v.co += Vector(center)
        self._absorb(bm, mat, smooth)

    def quad(self, p0, p1, p2, p3, mat, smooth=False):
        bm = bmesh.new()
        vs = [bm.verts.new(Vector(p)) for p in (p0, p1, p2, p3)]
        bm.faces.new(vs)
        self._absorb(bm, mat, smooth)

    def grid(self, x0, y0, x1, y1, nx, ny, mat, zfunc, colfunc=None):
        """A subdivided ground plane with per-vertex height from zfunc(x, y) and face colour from colfunc(cx, cy)."""
        bm = bmesh.new()
        col_layer = bm.loops.layers.color.new('Col') if colfunc else None
        verts = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                x = x0 + (x1 - x0) * i / nx
                y = y0 + (y1 - y0) * j / ny
                row.append(bm.verts.new(Vector((x, y, zfunc(x, y)))))
            verts.append(row)
        for j in range(ny):
            for i in range(nx):
                f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
                if col_layer:
                    cx = x0 + (x1 - x0) * (i + 0.5) / nx
                    cy = y0 + (y1 - y0) * (j + 0.5) / ny
                    c = colfunc(cx, cy)
                    for loop in f.loops:
                        loop[col_layer] = (*c, 1.0)
        self._absorb(bm, mat, smooth=True, keep_colors=bool(col_layer))

    def _absorb(self, src, mat, smooth, keep_colors=False):
        mi = self.mat_index(mat)
        for f in src.faces:
            f.material_index = mi
            f.smooth = smooth
        # Mark edges sharper than ~40 degrees so the exporter splits their normals.
        if smooth:
            for e in src.edges:
                if len(e.link_faces) == 2:
                    a = e.calc_face_angle(None)
                    if a is not None and a > math.radians(40):
                        e.smooth = False
        if keep_colors and 'Col' not in self.bm.loops.layers.color:
            self.bm.loops.layers.color.new('Col')
        tmp = bpy.data.meshes.new('tmp')
        src.to_mesh(tmp)
        src.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    def build(self, parent=None, location=(0, 0, 0)):
        if not self.bm.verts:
            self.bm.free()
            return None
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        if 'Col' in mesh.color_attributes:
            mesh.color_attributes.active_color = mesh.color_attributes['Col']
            mesh.color_attributes.render_color_index = mesh.color_attributes.find('Col')
        for m in self.mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = location
        if parent:
            obj.parent = parent
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ---------------------------------------------------------------- the area


def tile_pos(tx, ty, z=0.0):
    return (tx + 0.5, -(ty + 0.5), z)


class Area:
    def __init__(self, area, palette):
        self.area = area
        self.p = palette
        self.rows = area['map']
        self.style = area['id']
        self.h = len(self.rows)
        self.w = max(len(r) for r in self.rows)
        self.entities = area['entities']
        self.door_tiles = {}
        self.gate_tiles = {}
        for e in self.entities:
            if e['kind'] == 'door':
                for i, t in enumerate(e['tiles']):
                    self.door_tiles[t] = (e, i)
            elif e['kind'] == 'gate':
                for i, t in enumerate(e['tiles']):
                    self.gate_tiles[t] = (e, i)

    def at(self, x, y):
        if y < 0 or y >= self.h or x < 0 or x >= len(self.rows[y]):
            return WALL
        return self.rows[y][x]

    def is_wall(self, x, y):
        return self.at(x, y) == WALL

    def walkable_near(self, x, y, r=1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if self.at(x + dx, y + dy) != WALL:
                    return True
        return False

    # ----- ground

    def build_ground(self):
        p = self.p
        margin = 10
        seg = 2  # vertices per tile
        x0, y0 = -margin, -(self.h + margin)
        x1, y1 = self.w + margin, margin
        nx, ny = int((x1 - x0) * seg), int((y1 - y0) * seg)

        def water_weight(x, y):
            # Vertices wholly inside water sink to a basin; the bank slopes down to it.
            tx, ty = x, -y
            n = 0
            cnt = 0
            for dx in (-0.25, 0.25):
                for dy in (-0.25, 0.25):
                    cnt += 1
                    if self.at(int(math.floor(tx + dx)), int(math.floor(ty + dy))) == WATER:
                        n += 1
            return n / cnt

        def zfunc(x, y):
            tx, ty = x, -y
            inside = 0 <= tx <= self.w and 0 <= ty <= self.h
            if inside:
                z = 0.025 * math.sin(tx * 1.7) * math.cos(ty * 1.3) + 0.02 * math.sin(tx * 3.1 + ty * 2.3)
                z -= 0.45 * water_weight(x, y)
                return z
            d = max(0, -tx, tx - self.w, -ty, ty - self.h)
            # Outside the map the land rolls away and rises into hills behind the walls.
            return 0.12 * math.sin(tx * 0.9 + 1.3) * math.cos(ty * 0.7) + 0.05 * d + 0.35 * math.sin(tx * 0.35) * math.sin(ty * 0.4)

        # Vertex colour is a brightness modulation over the material colour: a gentle checker of
        # slightly darker 'alt' tiles, as in the 2D game, plus a little per-tile noise.
        g0 = hex_rgb(p['ground'])
        g1 = hex_rgb(p['groundAlt'])
        alt_ratio = tuple(min(1.0, (b / max(a, 1e-4)) ** 0.5) for a, b in zip(g0, g1))

        def colfunc(cx, cy):
            tx, ty = int(math.floor(cx)), int(math.floor(-cy))
            k = hash2(tx, ty, 3)
            m = 0.96 + 0.07 * (0.5 + 0.5 * math.sin(tx * 0.9 + ty * 0.6) * 0.6 + 0.4 * (k - 0.5))
            if (tx * 7 + ty * 13) % 5 == 0:
                m *= 0.985
            return (m, m, m)

        b = Builder('ground')
        b.grid(x0, y0, x1, y1, nx, ny, material('ground', p['ground']), zfunc, colfunc)
        return b.build()

    # ----- water

    def build_water(self):
        p = self.p
        b = Builder('water')
        m = material('water', p['water'], rough=0.15, alpha=0.82)
        for y in range(self.h):
            for x in range(self.w):
                if self.at(x, y) == WATER:
                    z = -0.14
                    b.quad((x, -(y + 1), z), (x + 1, -(y + 1), z), (x + 1, -y, z), (x, -y, z), m)
        return b.build()

    # ----- walls

    def wall_runs(self):
        """Merge horizontal runs of wall tiles into (x, y, length) runs."""
        runs = []
        for y in range(self.h):
            x = 0
            while x < self.w:
                if self.is_wall(x, y):
                    x0 = x
                    while x < self.w and self.is_wall(x, y):
                        x += 1
                    runs.append((x0, y, x - x0))
                else:
                    x += 1
        return runs

    def build_walls(self):
        p = self.p
        b = Builder('walls')
        wall = material('wall', p['wall'])
        top = material('wall-top', shade(p['wall'], 1.18))
        trim = material('wall-trim', shade(p['wall'], 0.72))
        # Per-block choices, keyed by the block's first tile, so a block can differ from the one above it too.
        self.choices = {}
        for (x0, y, n) in self.wall_runs():
            # Split long runs into shorter blocks of varying height so a wall reads as buildings or cliff faces.
            x = x0
            prev = None
            while x < x0 + n:
                seg = min(x0 + n - x, 2 + int(hash2(x, y, 1) * 4))
                near = any(self.walkable_near(xx, y, 1) for xx in range(x, x + seg))
                cx = x + seg / 2
                cy = -(y + 0.5)
                if self.style == 'town' and near:
                    prev = self.town_house(b, x, y, seg, prev or self.choices.get((x, y - 1)))
                    self.choices[(x, y)] = prev
                elif self.style == 'jazz' and near:
                    prev = self.jazz_facade(b, x, y, seg, prev or self.choices.get((x, y - 1)))
                    self.choices[(x, y)] = prev
                else:
                    hgt = (1.25 + 0.5 * hash2(x, y, 2)) if near else 0.9 + 0.3 * hash2(x, y, 5)
                    b.box((cx, cy, hgt / 2 - 0.02), (seg - 0.04, 0.96, hgt), wall, bevel=0.09)
                    # A lighter cap and a dark plinth give the block a top and a base.
                    b.box((cx, cy, hgt + 0.03), (seg - 0.18, 0.82, 0.1), top, bevel=0.04)
                    if near:
                        b.box((cx, cy, 0.06), (seg + 0.02, 1.02, 0.12), trim, bevel=0.03)
                x += seg
        return b.build()

    def pick(self, x, y, salt, n, avoid=None):
        """A hashed choice among n, never the same as `avoid` (the neighbouring block's choice)."""
        k = int(hash2(x, y, salt) * n) % n
        if avoid is not None and n > 1 and k == avoid:
            k = (k + 1 + int(hash2(x, y, salt + 100) * (n - 1))) % n
        return k

    def street_faces(self, xx, y):
        """Sides of wall tile (xx, y) that look onto open ground: -1 is the map's south face, +1 the north."""
        return [side for dy, side in ((1, -1), (-1, 1)) if self.at(xx, y + dy) != WALL]

    # ----- Tonic Town houses

    def town_house(self, b, x, y, seg, prev):
        """One house of a terrace. Storeys, wall and roof tints, roof shape and window layout each differ from the neighbour's."""
        p = self.p
        prev = prev or {}
        faces = sorted({side for xx in range(x, x + seg) for side in self.street_faces(xx, y)})
        # The camera looks north, so a block whose only open face is its north one shows nothing but its
        # roof and would hide the lane behind it: those stay single-storey. Free-standing rows stay under two.
        storey = 0 if faces == [1] else self.pick(x, y, 31, 2 if len(faces) == 2 else 3, prev.get('storey'))
        tint = self.pick(x, y, 32, 4, prev.get('tint'))
        roof_k = self.pick(x, y, 33, 4, prev.get('roof'))
        shape = self.pick(x, y, 34, 4, prev.get('shape'))
        layout = self.pick(x, y, 35, 3, prev.get('layout'))
        hgt = (1.15, 1.45, 1.8)[storey] + 0.1 * hash2(x, y, 36)
        walls = (material('wall', p['wall']), material('wall-b', shade(p['wall'], 1.1)), material('wall-c', shade(p['wall'], 0.86)), material('wall-d', mix(p['wall'], p['accent'], 0.22)))
        roofs = (material('roof', shade(p['accent'], 0.8), rough=0.85), material('roof-b', shade(p['accent'], 0.6), rough=0.85), material('roof-c', mix(p['accent'], p['wall'], 0.5), rough=0.85), material('roof-d', shade(p['wall'], 0.5), rough=0.85))
        trim = material('wall-trim', shade(p['wall'], 0.72))
        eave = material('eave', shade(p['wall'], 0.55))
        wall = walls[tint]
        roof = roofs[roof_k]
        cx = x + seg / 2
        cy = -(y + 0.5)
        b.box((cx, cy, hgt / 2 - 0.02), (seg - 0.04, 0.96, hgt), wall, bevel=0.09)
        b.box((cx, cy, 0.06), (seg + 0.02, 1.02, 0.12), trim, bevel=0.03)
        if shape == 3:
            # A flat roof behind a parapet, sometimes with a chimney stack.
            b.box((cx, cy, hgt + 0.06), (seg + 0.08, 1.04, 0.14), trim, bevel=0.02)
            b.box((cx, cy, hgt + 0.02), (seg - 0.2, 0.8, 0.12), eave)
            if hash2(x, y, 41) < 0.5:
                b.box((cx + (hash2(x, y, 42) - 0.5) * (seg - 0.6), cy + 0.2, hgt + 0.35), (0.24, 0.24, 0.5), trim, bevel=0.02)
        else:
            # A dark eave under the overhang, a pitched roof (shallow, medium or steep), a ridge beam and maybe a chimney.
            pitch = (0.3, 0.46, 0.66)[shape]
            axis = 'y' if seg <= 2 and hash2(x, y, 43) < 0.5 else 'x'
            b.box((cx, cy, hgt - 0.04), (seg + 0.2, 1.16, 0.1), eave, bevel=0.02)
            b.wedge((cx, cy, hgt + pitch / 2), (seg + 0.16, 1.12, pitch), roof, axis=axis)
            if axis == 'x':
                b.box((cx, cy, hgt + pitch), (seg + 0.2, 0.1, 0.06), trim, bevel=0.01)
            else:
                # The gable faces the street.
                b.box((cx, cy, hgt + pitch), (0.1, 1.16, 0.06), trim, bevel=0.01)
            if hash2(x, y, 41) < 0.4:
                b.box((cx + (hash2(x, y, 42) - 0.5) * (seg - 0.6), cy + 0.25, hgt + pitch * 0.8), (0.22, 0.22, 0.5), trim, bevel=0.02)
        self.town_windows(b, x, y, seg, hgt, layout, storey)
        return {'storey': storey, 'tint': tint, 'roof': roof_k, 'shape': shape, 'layout': layout}

    def town_windows(self, b, x, y, seg, hgt, layout, storey):
        """Warm windows and a front door on the faces of a house that look onto open ground.
        Layouts: 0 a window per bay, 1 every other bay with shutters, 2 a wide shop window below."""
        p = self.p
        pane = material('window', 0xFFE2A0, emission=0xFFC46A, rough=0.3)
        frame = material('wall-trim', shade(p['wall'], 0.72))
        shutter = material('shutter', shade(p['tree'], 0.75))
        door = material('house-door', shade(p['bridge'], 0.55))
        has_door = seg >= 2 and hash2(x, y, 45) < 0.65
        door_tile = x + int(hash2(x, y, 44) * seg)
        rows = [0.52] + ([hgt - 0.42] if storey >= 1 else [])
        for i, xx in enumerate(range(x, x + seg)):
            for side in self.street_faces(xx, y):
                cx, cy, _ = tile_pos(xx, y)
                wy = cy + side * 0.49
                for row, z in enumerate(rows):
                    if row == 0 and has_door and xx == door_tile:
                        # The front door, with a lintel and a step.
                        b.box((cx, wy + side * 0.01, 0.3), (0.34, 0.06, 0.56), door, bevel=0.01)
                        b.box((cx, wy + side * 0.03, 0.6), (0.44, 0.08, 0.06), frame)
                        b.box((cx, wy + side * 0.1, 0.03), (0.44, 0.2, 0.06), frame, bevel=0.01)
                        continue
                    if layout == 1 and (i + row) % 2 == 1:
                        continue
                    if layout == 2 and row == 0:
                        b.box((cx, wy, z), (0.62, 0.06, 0.34), frame, bevel=0.01)
                        b.box((cx, wy + side * 0.01, z), (0.54, 0.06, 0.26), pane)
                        continue
                    b.box((cx, wy, z), (0.3, 0.06, 0.34), frame, bevel=0.01)
                    b.box((cx, wy + side * 0.01, z), (0.22, 0.06, 0.26), pane)
                    if layout == 1:
                        for sx in (-1, 1):
                            b.box((cx + sx * 0.23, wy + side * 0.015, z), (0.1, 0.04, 0.3), shutter)

    # ----- Jazz Quarter fronts

    def jazz_facade(self, b, x, y, seg, prev):
        """A street front for the quarter: brick courses, panelled bays or a plain front with a string course,
        a cornice and parapet, doorways with a lamp, lit windows, shopfronts and neon."""
        p = self.p
        prev = prev or {}
        faces = sorted({side for xx in range(x, x + seg) for side in self.street_faces(xx, y)})
        # As in the town: blocks south of a lane stay low so they do not hide it from the camera.
        storey = 0 if faces == [1] else self.pick(x, y, 51, 2 if len(faces) == 2 else 3, prev.get('storey'))
        tint = self.pick(x, y, 52, 4, prev.get('tint'))
        kind = self.pick(x, y, 53, 3, prev.get('kind'))
        hgt = (1.4, 1.75, 2.1)[storey] + 0.1 * hash2(x, y, 54)
        walls = (material('wall', p['wall']), material('brick', mix(p['wall'], p['accent'], 0.2)), material('wall-c', shade(p['wall'], 0.84)), material('wall-d', shade(p['wall'], 1.14)))
        trim = material('wall-trim', shade(p['wall'], 0.72))
        dark = material('sign-back', shade(p['wall'], 0.6))
        cornice = material('cornice', shade(p['wall'], 1.25))
        pane_w = material('window', 0xFFE2A0, emission=0xFFC46A, rough=0.3)
        pane_c = material('window-cool', 0xBFD8FF, emission=mix(p['water'], 0xFFFFFF, 0.3), rough=0.3)
        door_m = material('club-door', shade(p['accent'], 0.35))
        lamp = material('lamp', p['accent'], emission=p['accent'], rough=0.3)
        awning = material('awning-dark', shade(p['accent'], 0.5))
        neon = (material('neon', p['accent'], emission=p['accent'], rough=0.3), material('neon-blue', p['water'], emission=p['water'], rough=0.3), material('neon-gold', 0xFFD36A, emission=0xFFB347, rough=0.3))
        wall = walls[tint]
        cx = x + seg / 2
        cy = -(y + 0.5)
        b.box((cx, cy, hgt / 2 - 0.02), (seg - 0.04, 0.96, hgt), wall, bevel=0.06)
        b.box((cx, cy, 0.06), (seg + 0.02, 1.02, 0.12), trim, bevel=0.03)
        # Cornice and parapet.
        b.box((cx, cy, hgt + 0.02), (seg + 0.1, 1.08, 0.1), cornice, bevel=0.02)
        b.box((cx, cy, hgt + 0.12), (seg - 0.1, 0.9, 0.12), wall)
        for side in faces:
            wy = cy + side * 0.49
            if kind == 0:
                # Brick courses: thin shadow lines across the face.
                z = 0.24
                while z < hgt - 0.2:
                    b.box((cx, wy + side * 0.005, z), (seg - 0.1, 0.02, 0.02), trim, smooth=False)
                    z += 0.21
            elif kind == 1:
                # Pilasters between the bays.
                for px in [x + 0.07] + list(range(x + 1, x + seg)) + [x + seg - 0.07]:
                    b.box((px, wy + side * 0.03, hgt / 2), (0.08, 0.06, hgt - 0.12), trim)
            else:
                # A string course at the first floor.
                b.box((cx, wy + side * 0.02, 0.98), (seg - 0.08, 0.05, 0.05), cornice)
        has_door = seg >= 2 and hash2(x, y, 55) < 0.55
        door_tile = x + int(hash2(x, y, 56) * seg)
        rows = [0.6] + ([hgt - 0.5] if storey >= 1 else [])
        for i, xx in enumerate(range(x, x + seg)):
            for side in self.street_faces(xx, y):
                cx1, cy1, _ = tile_pos(xx, y)
                wy = cy1 + side * 0.49
                lit = hash2(xx, y, 57 + side) < 0.7
                pane = pane_w if hash2(xx, y, 58) < 0.5 else pane_c
                for row, z in enumerate(rows):
                    if row == 0 and has_door and xx == door_tile:
                        # A doorway: dark recess, lintel, a step and a lamp above.
                        b.box((cx1, wy + side * 0.01, 0.38), (0.44, 0.06, 0.72), door_m, bevel=0.01)
                        b.box((cx1, wy + side * 0.04, 0.78), (0.56, 0.1, 0.07), trim)
                        b.box((cx1, wy + side * 0.12, 0.03), (0.6, 0.24, 0.06), trim, bevel=0.01)
                        b.box((cx1, wy + side * 0.08, 0.9), (0.1, 0.16, 0.06), trim)
                        b.sphere((cx1, wy + side * 0.15, 0.86), 0.05, lamp, subdiv=1)
                        continue
                    if row == 0 and kind == 2:
                        # Shopfront glass under a small awning.
                        b.box((cx1, wy, 0.55), (0.7, 0.06, 0.5), trim, bevel=0.01)
                        b.box((cx1, wy + side * 0.01, 0.55), (0.62, 0.06, 0.42), pane if lit else dark)
                        if hash2(xx, y, 59) < 0.5:
                            b.box((cx1, wy + side * 0.17, 0.84), (0.76, 0.34, 0.03), awning)
                        continue
                    b.box((cx1, wy, z), (0.32, 0.06, 0.4), trim, bevel=0.01)
                    b.box((cx1, wy + side * 0.01, z), (0.24, 0.06, 0.32), pane if lit else dark)
        for side in faces:
            wy = cy + side * 0.49
            k = hash2(x, y, 60 + side)
            if k < 0.3:
                # A blade sign at the block's end: stacked neon bars on a dark board, out over the street.
                sx = x + 0.3 if hash2(x, y, 61) < 0.5 else x + seg - 0.3
                b.box((sx, wy + side * 0.2, hgt * 0.62), (0.08, 0.36, 0.7), dark, bevel=0.01)
                for j in range(4):
                    b.box((sx, wy + side * 0.2, hgt * 0.62 - 0.24 + j * 0.16), (0.1, 0.24, 0.05), neon[(j + x) % 3])
            elif k < 0.55:
                # A neon strip under the cornice.
                b.box((cx, wy + side * 0.03, hgt - 0.14), (seg - 0.3, 0.04, 0.05), neon[int(hash2(x, y, 62) * 3)])
        return {'storey': storey, 'tint': tint, 'kind': kind}

    # ----- trees

    def tree(self, b, tx, ty, canopy, trunk, k=1.0):
        s = (0.85 + 0.3 * hash2(tx, ty, 7)) * k
        x, y, _ = tile_pos(tx, ty)
        x += (hash2(tx, ty, 8) - 0.5) * 0.2
        y += (hash2(tx, ty, 9) - 0.5) * 0.2
        b.cylinder((x, y, 0.3 * s), 0.11 * s, 0.6 * s, trunk, segments=8, radius2=0.08 * s)
        b.sphere((x, y, 0.95 * s), 0.46 * s, canopy, scale=(1, 1, 0.9), subdiv=1)
        b.sphere((x + 0.18 * s, y - 0.1 * s, 1.2 * s), 0.3 * s, canopy, scale=(1, 1, 0.85), subdiv=1)
        b.sphere((x - 0.2 * s, y + 0.14 * s, 1.15 * s), 0.28 * s, canopy, scale=(1, 1, 0.9), subdiv=1)

    def build_trees(self):
        p = self.p
        b = Builder('trees')
        canopy = material('canopy', p['tree'])
        trunk = material('trunk', shade(p['bridge'], 0.6))
        for y in range(self.h):
            for x in range(self.w):
                if self.at(x, y) == TREE:
                    self.tree(b, x, y, canopy, trunk)
        return b.build()

    # ----- bridges

    def build_bridges(self):
        p = self.p
        b = Builder('bridges')
        plank = material('plank', p['bridge'])
        rail = material('rail', shade(p['bridge'], 0.7))
        for y in range(self.h):
            for x in range(self.w):
                if self.at(x, y) != BRIDGE:
                    continue
                self.bridge_tile(b, x, y, plank, rail)
        return b.build()

    def bridge_tile(self, b, x, y, plank, rail):
        # Planks run across the direction of travel: along x if the bridge runs vertically.
        horizontal = self.at(x - 1, y) in (BRIDGE, GROUND, DOOR) or self.at(x + 1, y) in (BRIDGE, GROUND, DOOR)
        cx, cy, _ = tile_pos(x, y)
        n = 4
        for i in range(n):
            o = -0.5 + (i + 0.5) / n
            if horizontal:
                b.box((cx + o, cy, 0.04), (1 / n - 0.03, 0.96, 0.08), plank, bevel=0.015)
            else:
                b.box((cx, cy + o, 0.04), (0.96, 1 / n - 0.03, 0.08), plank, bevel=0.015)
        for side in (-1, 1):
            if horizontal:
                b.box((cx, cy + side * 0.44, 0.3), (1.0, 0.06, 0.06), rail, bevel=0.01)
                b.box((cx, cy + side * 0.44, 0.15), (0.06, 0.06, 0.32), rail, bevel=0.01)
            else:
                b.box((cx + side * 0.44, cy, 0.3), (0.06, 1.0, 0.06), rail, bevel=0.01)
                b.box((cx + side * 0.44, cy, 0.15), (0.06, 0.06, 0.32), rail, bevel=0.01)

    # ----- doors, gates, bench

    def door_axis(self, x, y):
        """Which way a door or gate slab spans: 'x' (it faces north and south, the passage runs north-south)
        or 'y' (it faces east and west, the passage runs east-west).
        1. Something impassable (wall, water, tree) to the left or right: the slab spans x; above or below: y.
        2. Otherwise an exit beside it says where the passage goes: an exit east or west means the player
           walks east-west, so the slab spans y (the hub's gate to the quarter stands in open ground).
        3. Otherwise the nearest impassable tile two steps away decides, and failing that the slab spans x.
        scripts/doors.py prints the result for every door and gate."""
        blocked = (WALL, WATER, TREE)
        if self.at(x - 1, y) in blocked or self.at(x + 1, y) in blocked:
            return 'x'
        if self.at(x, y - 1) in blocked or self.at(x, y + 1) in blocked:
            return 'y'
        if self.at(x - 1, y) == EXIT or self.at(x + 1, y) == EXIT:
            return 'y'
        if self.at(x, y - 1) == EXIT or self.at(x, y + 1) == EXIT:
            return 'x'
        if self.at(x - 2, y) in blocked or self.at(x + 2, y) in blocked:
            return 'x'
        if self.at(x, y - 2) in blocked or self.at(x, y + 2) in blocked:
            return 'y'
        return 'x'

    def build_doors(self, props):
        p = self.p
        objs = []
        frame = material('frame', shade(p['bridge'], 0.8))
        door_m = material('door', shade(p['accent'], 0.9), rough=0.6)
        knob = material('knob', p['accent'], rough=0.3, metal=0.6, emission=shade(p['accent'], 0.5))
        canopy = material('canopy', p['tree'])
        trunk = material('trunk', shade(p['bridge'], 0.6))
        serpent_m = material('serpent', shade(p['tree'], 0.9), rough=0.5)
        serpent_eye = material('serpent-eye', p['accent'], emission=p['accent'])
        # The glowing edge every closed door shares. The game keeps this material in colour whatever the
        # tile's life and pulses its emission, so a door reads as a door from across a grey area.
        glow = material('door-glow', p['accent'], emission=p['accent'], rough=0.4)
        for e in self.entities:
            if e['kind'] != 'door':
                continue
            for i, (x, y) in enumerate(e['tiles']):
                name = f"door:{e['id']}:{i}"
                cx, cy, _ = tile_pos(x, y)
                b = Builder(name)
                if e['texture'] == 'tile-tree':
                    # A gate of woven branches between two trunks, across the gap in the tree rows.
                    axis = self.door_axis(x, y)
                    hgt = 1.5
                    for s in (-1, 1):
                        px, py = (cx + s * 0.44, cy) if axis == 'x' else (cx, cy + s * 0.44)
                        props.cylinder((px, py, hgt / 2), 0.1, hgt, trunk, segments=8, radius2=0.07)
                        props.sphere((px, py, hgt + 0.15), 0.3, canopy, scale=(1, 1, 0.8), subdiv=1)
                    for k in range(5):
                        o = -0.32 + k * 0.16
                        lean = (hash2(x, y, 60 + k) - 0.5) * 0.08
                        if axis == 'x':
                            b.cylinder((cx + o + lean, cy, (hgt - 0.2) / 2), 0.035, hgt - 0.2, trunk, segments=6)
                        else:
                            b.cylinder((cx, cy + o + lean, (hgt - 0.2) / 2), 0.035, hgt - 0.2, trunk, segments=6)
                    for z in (0.3, 0.7, 1.1):
                        if axis == 'x':
                            b.box((cx, cy, z), (0.86, 0.12, 0.1), glow, bevel=0.02)
                        else:
                            b.box((cx, cy, z), (0.12, 0.86, 0.1), glow, bevel=0.02)
                    if axis == 'x':
                        b.box((cx, cy, hgt - 0.1), (0.9, 0.14, 0.12), glow, bevel=0.02)
                    else:
                        b.box((cx, cy, hgt - 0.1), (0.14, 0.9, 0.12), glow, bevel=0.02)
                    obj = b.build()
                elif e['texture'] == 'serpent':
                    r = 0.38
                    b.sphere((cx, cy, r), r, serpent_m, scale=(1.05, 1.0, 0.8), subdiv=2)
                    if i == 0:
                        # The head: a snout and two lit eyes.
                        b.sphere((cx, cy + 0.36, r + 0.05), 0.24, serpent_m, scale=(1, 1.2, 0.8), subdiv=1)
                        for sx in (-1, 1):
                            b.sphere((cx + sx * 0.16, cy + 0.3, r + 0.22), 0.06, serpent_eye, subdiv=1)
                    obj = b.build()
                else:
                    axis = self.door_axis(x, y)
                    hgt = 1.35
                    # The frame stays in the world; the slab is the object that opens.
                    for s in (-1, 1):
                        if axis == 'x':
                            props.box((cx + s * 0.42, cy, hgt / 2), (0.14, 0.26, hgt), frame, bevel=0.03)
                        else:
                            props.box((cx, cy + s * 0.42, hgt / 2), (0.26, 0.14, hgt), frame, bevel=0.03)
                    if axis == 'x':
                        props.box((cx, cy, hgt + 0.08), (1.0, 0.3, 0.18), frame, bevel=0.04)
                        b.box((cx, cy, (hgt - 0.1) / 2), (0.74, 0.1, hgt - 0.1), door_m, bevel=0.03)
                        b.sphere((cx + 0.22, cy - 0.07, 0.62), 0.05, knob, subdiv=1)
                    else:
                        props.box((cx, cy, hgt + 0.08), (0.3, 1.0, 0.18), frame, bevel=0.04)
                        b.box((cx, cy, (hgt - 0.1) / 2), (0.1, 0.74, hgt - 0.1), door_m, bevel=0.03)
                        b.sphere((cx - 0.07, cy + 0.22, 0.62), 0.05, knob, subdiv=1)
                    # The glowing edge: a thin strip up both sides and across the top, proud of both faces.
                    for s in (-1, 1):
                        if axis == 'x':
                            b.box((cx + s * 0.33, cy, (hgt - 0.1) / 2), (0.09, 0.2, hgt - 0.1), glow, bevel=0.01)
                        else:
                            b.box((cx, cy + s * 0.33, (hgt - 0.1) / 2), (0.2, 0.09, hgt - 0.1), glow, bevel=0.01)
                    if axis == 'x':
                        b.box((cx, cy, hgt - 0.14), (0.74, 0.2, 0.09), glow, bevel=0.01)
                    else:
                        b.box((cx, cy, hgt - 0.14), (0.2, 0.74, 0.09), glow, bevel=0.01)
                    obj = b.build()
                if obj:
                    objs.append(obj)
        return objs

    def build_gates(self, props):
        p = self.p
        objs = []
        pillar = material('pillar', shade(p['wall'], 0.85))
        bars = material('bars', shade(p['wall'], 0.5), rough=0.4, metal=0.5)
        for e in self.entities:
            if e['kind'] != 'gate':
                continue
            for i, (x, y) in enumerate(e['tiles']):
                cx, cy, _ = tile_pos(x, y)
                axis = self.door_axis(x, y)
                hgt = 1.5
                for s in (-1, 1):
                    if axis == 'x':
                        props.box((cx + s * 0.44, cy, hgt / 2), (0.2, 0.36, hgt), pillar, bevel=0.05)
                        props.box((cx + s * 0.44, cy, hgt + 0.08), (0.3, 0.46, 0.16), pillar, bevel=0.04)
                    else:
                        props.box((cx, cy + s * 0.44, hgt / 2), (0.36, 0.2, hgt), pillar, bevel=0.05)
                        props.box((cx, cy + s * 0.44, hgt + 0.08), (0.46, 0.3, 0.16), pillar, bevel=0.04)
                b = Builder(f"gate:{e['flag']}:{i}")
                for k in range(5):
                    o = -0.3 + k * 0.15
                    if axis == 'x':
                        b.cylinder((cx + o, cy, hgt / 2 - 0.1), 0.03, hgt - 0.2, bars, segments=6)
                    else:
                        b.cylinder((cx, cy + o, hgt / 2 - 0.1), 0.03, hgt - 0.2, bars, segments=6)
                if axis == 'x':
                    b.box((cx, cy, hgt - 0.25), (0.7, 0.08, 0.08), bars, bevel=0.01)
                    b.box((cx, cy, 0.15), (0.7, 0.08, 0.08), bars, bevel=0.01)
                else:
                    b.box((cx, cy, hgt - 0.25), (0.08, 0.7, 0.08), bars, bevel=0.01)
                    b.box((cx, cy, 0.15), (0.08, 0.7, 0.08), bars, bevel=0.01)
                objs.append(b.build())
        return objs

    def build_bench(self, props):
        p = self.p
        for e in self.entities:
            if e['kind'] != 'practice':
                continue
            x, y = e['tile']
            ax, ay = e['at']
            cx, cy, _ = tile_pos(x, y)
            wood = material('bench', p['bridge'], rough=0.7)
            dark = material('bench-dark', shade(p['bridge'], 0.6))
            # The lantern glass shares the doors' glow: kept in colour in a grey area and pulsed by the game,
            # so the bench reads as a place to go, like a door.
            lamp = material('door-glow', p['accent'], emission=p['accent'], rough=0.4)
            b = Builder('bench')
            # The seat faces the standing tile.
            along_x = ay != y
            if along_x:
                b.box((cx, cy, 0.42), (0.9, 0.36, 0.08), wood, bevel=0.02)
                b.box((cx, cy + (0.14 if ay > y else -0.14), 0.62), (0.9, 0.06, 0.3), wood, bevel=0.02)
                for s in (-1, 1):
                    b.box((cx + s * 0.36, cy, 0.2), (0.08, 0.3, 0.4), dark, bevel=0.01)
            else:
                b.box((cx, cy, 0.42), (0.36, 0.9, 0.08), wood, bevel=0.02)
                b.box((cx + (0.14 if ax > x else -0.14), cy, 0.62), (0.06, 0.9, 0.3), wood, bevel=0.02)
                for s in (-1, 1):
                    b.box((cx, cy + s * 0.36, 0.2), (0.3, 0.08, 0.4), dark, bevel=0.01)
            obj = b.build()
            # A lantern post beside it so the bench reads from afar.
            lx, ly = cx + (0.0 if along_x else 0.0) + (0.62 if along_x else 0.0), cy + (0.0 if along_x else 0.62)
            props.cylinder((lx, ly, 0.6), 0.04, 1.2, dark, segments=6)
            props.box((lx, ly, 1.26), (0.24, 0.24, 0.3), lamp, bevel=0.04)
            props.box((lx, ly, 1.42), (0.26, 0.26, 0.06), dark, bevel=0.02)
            return obj
        return None

    def build_stage(self, props):
        """A low deck for the people placed on 'stage' tiles: boards, a dark skirt, a step at the front,
        footlights along the front edge and two lamp posts with a rail, so the band reads as a band."""
        p = self.p
        for e in self.entities:
            if e['kind'] != 'stage':
                continue
            xs = [t[0] for t in e['tiles']]
            ys = [t[1] for t in e['tiles']]
            x0, x1, y0, y1 = min(xs), max(xs) + 1, min(ys), max(ys) + 1
            w, d = x1 - x0, y1 - y0
            cx, cy = (x0 + x1) / 2, -(y0 + y1) / 2
            front = cy - d / 2  # the south edge, toward the camera
            h = STAGE_H
            deck = material('stage', shade(p['bridge'], 1.05), rough=0.6)
            skirt = material('stage-skirt', shade(p['accent'], 0.45))
            dark = material('bench-dark', shade(p['bridge'], 0.6))
            lamp = material('lamp', p['accent'], emission=p['accent'], rough=0.3)
            foot = material('neon-gold', 0xFFD36A, emission=0xFFB347, rough=0.3)
            props.box((cx, cy, h - 0.04), (w - 0.06, d - 0.06, 0.08), deck, bevel=0.02)
            props.box((cx, cy, (h - 0.08) / 2), (w - 0.1, d - 0.1, h - 0.08), skirt)
            # Board lines across the deck.
            for i in range(1, int(w * 3)):
                props.box((x0 + i / 3, cy, h + 0.001), (0.012, d - 0.1, 0.004), dark, smooth=False)
            props.box((cx, front - 0.14, 0.06), (min(w - 1, 2.0), 0.28, 0.12), deck, bevel=0.02)
            for i in range(int(w * 2)):
                props.box((x0 + 0.25 + i * 0.5, front + 0.1, h + 0.04), (0.14, 0.08, 0.07), foot, bevel=0.01)
            for sx in (x0 + 0.14, x1 - 0.14):
                props.cylinder((sx, front + 0.16, h + 0.8), 0.035, 1.6, dark, segments=6)
                props.box((sx, front + 0.16, h + 1.66), (0.2, 0.2, 0.22), lamp, bevel=0.03)
                props.box((sx, front + 0.16, h + 1.8), (0.22, 0.22, 0.05), dark, bevel=0.02)
            props.box((cx, front + 0.16, h + 1.56), (w - 0.28, 0.04, 0.04), dark)

    def build_exits(self, props):
        p = self.p
        stone = material('pillar', shade(p['wall'], 0.85))
        lamp = material('lamp', p['accent'], emission=p['accent'], rough=0.3)
        for e in self.entities:
            if e['kind'] != 'exit':
                continue
            x, y = e['tiles'][0]
            cx, cy, _ = tile_pos(x, y)
            axis = self.door_axis(x, y)
            # Two low waymarkers with a lit cap at either side of the way out.
            for s in (-1, 1):
                if axis == 'x':
                    px, py = cx + s * 0.46, cy
                else:
                    px, py = cx, cy + s * 0.46
                props.box((px, py, 0.3), (0.16, 0.16, 0.6), stone, bevel=0.03)
                props.box((px, py, 0.64), (0.12, 0.12, 0.08), lamp, bevel=0.02)

    def area_props(self, props):
        """What makes each area itself: awnings and stalls in the town, neon and the band stand in the quarter, curtains on the stage."""
        p = self.p
        doors = [e for e in self.entities if e['kind'] == 'door']
        if self.style == 'town':
            awning = material('awning', p['accent'], rough=0.8)
            stripe = material('awning-stripe', 0xF6EFE2, rough=0.8)
            for e in doors:
                x, y = e['tiles'][0]
                cx, cy, _ = tile_pos(x, y)
                # A striped awning over the doorway on the side the street comes from.
                side = 1 if self.at(x, y + 1) != WALL else -1
                ay = cy - side * 0.62
                for i in range(5):
                    ox = -0.5 + (i + 0.5) / 5
                    props.box((cx + ox, ay, 1.55 - 0.08 * 0 ), (0.2, 0.5, 0.05), awning if i % 2 == 0 else stripe, bevel=0.01)
                for sx in (-1, 1):
                    props.cylinder((cx + sx * 0.46, ay - side * 0.22, 0.78), 0.03, 1.56, material('wall-trim', shade(p['wall'], 0.72)), segments=6)
            # Market crates near the stalls.
            crate = material('crate', shade(p['bridge'], 0.9))
            for e in doors:
                if 'stall' not in e['id']:
                    continue
                x, y = e['tiles'][0]
                side = 1 if self.at(x, y + 1) != WALL else -1
                for k, dx in enumerate((-2, 2)):
                    if self.at(x + dx, y + side) != GROUND:
                        continue
                    cx, cy, _ = tile_pos(x + dx, y + side)
                    props.box((cx, cy, 0.17), (0.4, 0.4, 0.34), crate, bevel=0.03)
                    if k == 0:
                        props.box((cx + 0.1, cy - 0.1, 0.5), (0.3, 0.3, 0.3), crate, bevel=0.03)
        elif self.style == 'jazz':
            neon = material('neon', p['accent'], emission=p['accent'], rough=0.3)
            neon2 = material('neon-blue', p['water'], emission=p['water'], rough=0.3)
            dark = material('sign-back', shade(p['wall'], 0.6))
            for i, e in enumerate(doors):
                x, y = e['tiles'][0]
                cx, cy, _ = tile_pos(x, y)
                # A hanging sign on the building corner above the street, lit in neon.
                for side in (-1, 1):
                    wy = cy + side * 0.5
                    props.box((cx, wy + side * 0.1, 1.5), (0.7, 0.14, 0.42), dark, bevel=0.02)
                    props.box((cx, wy + side * 0.2, 1.5), (0.56, 0.03, 0.08), neon if (i + side) % 2 else neon2)
                    props.box((cx, wy + side * 0.2, 1.36), (0.4, 0.03, 0.05), neon2 if (i + side) % 2 else neon)
            # The band stand: the block behind the stage gets a marquee slab and a neon fascia over the square.
            stand = material('stand', shade(p['bridge'], 1.1))
            post = material('post', shade(p['wall'], 0.5))
            for (x0, y, n) in self.wall_runs():
                if not (y in (12, 13) and 30 < x0 < 45):
                    continue
                cx = x0 + n / 2
                cy = -(y + 0.5)
                props.box((cx, cy, 1.95), (n + 0.3, 1.3, 0.18), stand, bevel=0.03)
                props.box((cx, cy - 0.7, 1.86), (n + 0.3, 0.06, 0.3), neon, bevel=0.01)
                for sx in (-1, 1):
                    for sy in (-1, 1):
                        props.cylinder((cx + sx * (n / 2 + 0.05), cy + sy * 0.55, 1.5), 0.04, 0.8, post, segments=6)
        elif self.style == 'stage':
            curtain = material('curtain', 0x9B2335, rough=0.9)
            gold = material('gold', p['accent'], rough=0.35, metal=0.6, emission=shade(p['accent'], 0.25))
            for e in doors:
                x, y = e['tiles'][0]
                cx, cy, _ = tile_pos(x, y)
                front = cy - 0.62
                # Curtains either side of the song door, hung as columns of folds, and a gilded proscenium.
                for side in (-1, 1):
                    for k in range(6):
                        ox = side * (0.65 + k * 0.42)
                        props.cylinder((cx + ox, front, 1.25), 0.2, 2.5, curtain, segments=8)
                    props.box((cx + side * 1.9, front - 0.05, 1.45), (2.6, 0.18, 0.25), gold, bevel=0.03)
                props.box((cx, front - 0.1, 2.62), (6.2, 0.42, 0.3), gold, bevel=0.05)
                props.box((cx, front - 0.1, 2.3), (6.0, 0.3, 0.4), curtain, bevel=0.03)
                for sx in (-1, 1):
                    props.box((cx + sx * 3.0, front - 0.1, 1.3), (0.34, 0.42, 2.6), gold, bevel=0.04)
            # Footlights along the apron (the bridge row).
            lamp = material('lamp', p['accent'], emission=p['accent'], rough=0.3)
            for y in range(self.h):
                for x in range(self.w):
                    if self.at(x, y) == BRIDGE and self.at(x, y + 1) != BRIDGE:
                        cx, cy, _ = tile_pos(x, y)
                        props.box((cx, cy - 0.46, 0.14), (0.16, 0.08, 0.12), lamp, bevel=0.02)
        elif self.style == 'hub':
            # The hearth: a chimney breast and embers by the first door.
            stone = material('pillar', shade(p['wall'], 0.85))
            ember = material('ember', 0xFF7A3A, emission=0xFF6A2A, rough=0.6)
            for e in doors:
                x, y = e['tiles'][0]
                cx, cy, _ = tile_pos(x, y)
                props.box((cx, cy + 1.5, 1.1), (0.9, 0.9, 2.2), stone, bevel=0.05)
                props.box((cx + 0.5, cy + 1.5, 0.35), (0.3, 0.5, 0.5), stone, bevel=0.03)
                props.box((cx + 0.56, cy + 1.5, 0.2), (0.2, 0.3, 0.2), ember, bevel=0.03)
        elif self.style == 'valley':
            # Standing stones flank the gates and the grove.
            stone = material('pillar', shade(p['wall'], 0.85))
            for e in doors:
                if 'serpent' in e['id'] or 'octave' in e['id'] or e['texture'] == 'tile-tree':
                    continue
                x, y = e['tiles'][0]
                cx, cy, _ = tile_pos(x, y)
                axis = self.door_axis(x, y)
                for side in (-1, 1):
                    if axis == 'x':
                        px, py = cx + side * 1.1, cy - 0.3
                    else:
                        px, py = cx - 0.3, cy + side * 1.1
                    if self.at(int(px), int(-py)) != GROUND:
                        continue
                    props.box((px, py, 0.6), (0.3, 0.26, 1.2 + 0.3 * hash2(x + side, y, 31)), stone, bevel=0.06)

    def decorate(self, props):
        """Small rocks and grass tufts on open ground, hashed per tile so every build is the same."""
        p = self.p
        rock = material('rock', shade(p['wall'], 1.05))
        tuft = material('tuft', shade(p['tree'], 1.15))
        for y in range(self.h):
            for x in range(self.w):
                if self.at(x, y) != GROUND or (x, y) in self.door_tiles or (x, y) in self.gate_tiles:
                    continue
                k = hash2(x, y, 11)
                cx, cy, _ = tile_pos(x, y)
                ox = (hash2(x, y, 12) - 0.5) * 0.6
                oy = (hash2(x, y, 13) - 0.5) * 0.6
                if k < 0.045:
                    r = 0.08 + 0.1 * hash2(x, y, 14)
                    props.sphere((cx + ox, cy + oy, r * 0.5), r, rock, scale=(1.3, 1, 0.7), subdiv=1)
                elif k < 0.13:
                    for i in range(3):
                        a = i * 2.1 + hash2(x, y, 15 + i) * 2
                        props.cylinder((cx + ox + math.cos(a) * 0.05, cy + oy + math.sin(a) * 0.05, 0.09), 0.025, 0.18, tuft, segments=4, radius2=0.0)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    _materials.clear()


def build_area(area, palette, out_dir):
    clear_scene()
    a = Area(area, palette)
    a.build_ground()
    a.build_water()
    a.build_walls()
    a.build_trees()
    a.build_bridges()
    props = Builder('props')
    a.build_doors(props)
    a.build_gates(props)
    a.build_bench(props)
    a.build_stage(props)
    a.build_exits(props)
    a.area_props(props)
    a.decorate(props)
    props.build()
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{area['id']}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_normals=True,
        export_vertex_color='ACTIVE',
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
    )
    size = os.path.getsize(path)
    print(f"wrote {path} ({size // 1024} KB), {a.w}x{a.h} tiles, {len(a.entities)} entities")


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', action='append', default=[])
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'world'))
    args = ap.parse_args(argv)
    with open(AREAS_TS) as f:
        areas = parse_areas(f.read())
    with open(PALETTE_TS) as f:
        palettes = parse_palettes(f.read())
    ids = list(areas) if args.all or not args.area else args.area
    for i in ids:
        area = areas[i]
        build_area(area, palettes[area['palette']], args.out)


if __name__ == '__main__':
    main()
