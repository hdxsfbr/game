#!/usr/bin/env python3
"""Generate the player sprite with PixelLab: four facings, then a walk, then export a sheet.

Token: ~/.config/agentforge/pixellab (one line). Never committed.

Usage:
  scripts/pixellab_player.py create [--size 32] [--seed N] [--desc "..."]   # one generation
  scripts/pixellab_player.py status <character_id>
  scripts/pixellab_player.py preview <character_id> [outdir]                 # rotations, native and x6
  scripts/pixellab_player.py animate <character_id> [--template walk]        # one generation per direction
  scripts/pixellab_player.py export <character_id> [public/sprites/player]   # sheet png + layout json

Each call that costs a generation says so and asks for --yes.
"""
import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

API = 'https://api.pixellab.ai/v2'
TOKEN_FILE = Path.home() / '.config' / 'agentforge' / 'pixellab'

DESCRIPTION = (
    'small young wandering singer, hooded cloak in warm ochre, long red scarf, round friendly face, '
    'simple boots, carrying a tiny wooden flute, 16-bit pixel art game character'
)


def token() -> str:
    return TOKEN_FILE.read_text().strip()


def call(method: str, path: str, body=None, raw=False):
    req = urllib.request.Request(API + path, method=method, headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=120) as r:
            payload = r.read()
            return payload if raw else json.loads(payload)
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code} {method} {path}: {e.read().decode()[:800]}', file=sys.stderr)
        raise


def confirm(args, what: str):
    if not args.yes:
        print(f'{what} costs generations from the monthly 40. Re-run with --yes.', file=sys.stderr)
        sys.exit(2)


def cmd_create(args):
    confirm(args, 'Creating a 4-direction character (1 generation)')
    body = {
        'description': args.desc,
        'image_size': {'width': args.size, 'height': args.size},
        'view': 'low top-down',
        'outline': 'single color black outline',
        'shading': 'basic shading',
        'detail': 'medium detail',
        'proportions': {'type': 'preset', 'name': 'chibi'},
    }
    if args.seed is not None:
        body['seed'] = args.seed
    r = call('POST', '/create-character-with-4-directions', body)
    print(json.dumps(r, indent=1))
    cid = r['character_id']
    wait_ready(cid)
    cmd_preview(argparse.Namespace(character_id=cid, outdir=args.outdir))


def wait_ready(cid: str, timeout=600):
    t0 = time.time()
    while time.time() - t0 < timeout:
        c = call('GET', f'/characters/{cid}')
        st = c.get('status')
        anims = [a.get('status') for a in c.get('animations') or []]
        print('status', st, anims, flush=True)
        if st in ('completed', 'ready', 'done') and all(a in ('completed', 'ready', 'done', None) for a in anims):
            return c
        if st == 'failed' or 'failed' in anims:
            raise SystemExit('generation failed')
        time.sleep(8)
    raise SystemExit('timed out waiting')


def cmd_status(args):
    print(json.dumps(call('GET', f'/characters/{args.character_id}'), indent=1)[:3000])


def cmd_preview(args):
    from PIL import Image  # pillow

    c = call('GET', f'/characters/{args.character_id}')
    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    urls = c.get('rotation_urls') or {}
    tiles = []
    for d in ('south', 'west', 'east', 'north'):
        if d not in urls:
            continue
        req = urllib.request.Request(urls[d], headers={'User-Agent': 'Mozilla/5.0 listening-kingdom'})
        with urllib.request.urlopen(req, timeout=60) as r:
            im = Image.open(io.BytesIO(r.read())).convert('RGBA')
        im.save(out / f'{d}.png')
        tiles.append(im)
    if tiles:
        w, h = tiles[0].size
        sheet = Image.new('RGBA', (w * len(tiles), h), (255, 0, 255, 255))
        for i, im in enumerate(tiles):
            sheet.paste(im, (i * w, 0), im)
        sheet.save(out / 'rotations-magenta.png')
        sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(out / 'rotations-x6.png')
        print(f'rotations {w}x{h} each, previews in {out}')


def wait_job(job_id: str, timeout=900):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = call('GET', f'/background-jobs/{job_id}')
        st = j.get('status')
        print('job', job_id[:8], st, flush=True)
        if st in ('completed', 'done', 'success'):
            return j
        if st in ('failed', 'error'):
            raise SystemExit('job failed: ' + json.dumps(j)[:500])
        time.sleep(10)
    raise SystemExit('timed out waiting for job')


def cmd_animate(args):
    confirm(args, 'Animating directions (about 1 generation per direction)')
    # The trial plan runs one job at a time, so the directions join one animation group in turn.
    group = args.group
    for d in args.directions.split(','):
        body = {'character_id': args.character_id, 'animation_name': args.name, 'directions': [d]}
        if group:
            body['animation_group_id'] = group
        if args.template:
            body['mode'] = 'template'
            body['template_animation_id'] = args.template
        else:
            body['mode'] = 'v3'
            body['action_description'] = args.action
            body['frame_count'] = args.frames
        r = call('POST', '/animate-character', body)
        print(d, json.dumps(r)[:300], flush=True)
        group = group or r.get('animation_group_id')
        for job in r.get('background_job_ids', []):
            wait_job(job)
    print('animation group', group)


def cmd_export(args):
    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    data = call('GET', f'/characters/{args.character_id}/spritesheet', raw=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            target = out / ('player.png' if name.endswith('.png') else 'player.json' if name.endswith('.json') else name)
            target.write_bytes(z.read(name))
            print('wrote', target)
    layout = json.loads((out / 'player.json').read_text())
    print(json.dumps(layout, indent=1)[:2000])


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('create')
    c.add_argument('--size', type=int, default=32)
    c.add_argument('--seed', type=int)
    c.add_argument('--desc', default=DESCRIPTION)
    c.add_argument('--outdir', default='scratch/pixellab/player')
    c.add_argument('--yes', action='store_true')
    s = sub.add_parser('status')
    s.add_argument('character_id')
    v = sub.add_parser('preview')
    v.add_argument('character_id')
    v.add_argument('outdir', nargs='?', default='scratch/pixellab/player')
    a = sub.add_parser('animate')
    a.add_argument('character_id')
    a.add_argument('--template', default='walk')
    a.add_argument('--action', default='walking')
    a.add_argument('--frames', type=int, default=4)
    a.add_argument('--name', default='walk')
    a.add_argument('--group', help='existing animation_group_id to add directions to')
    a.add_argument('--directions', default='south,west,east,north')
    a.add_argument('--yes', action='store_true')
    e = sub.add_parser('export')
    e.add_argument('character_id')
    e.add_argument('outdir', nargs='?', default='public/sprites/player')
    args = p.parse_args()
    {'create': cmd_create, 'status': cmd_status, 'preview': cmd_preview, 'animate': cmd_animate, 'export': cmd_export}[args.cmd](args)


if __name__ == '__main__':
    main()
