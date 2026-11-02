#!/usr/bin/env python3
"""Story cards and the title backdrop, generated locally with SDXL and finished as pixel art.

Pipeline (see docs/art-plan.md): one style sentence for every prompt, 1024x576 render, area-average
downscale to 256x144, quantise to a small palette, nearest-neighbour upscale back to 1024x576.
Writes public/cards/<name>.png and scratch/cards/<name>-raw.png.

Usage: scripts/gen_cards.py [--only title,valley] [--seed 7] [--steps 30]
Needs: torch with CUDA, diffusers, pillow. First run downloads stabilityai/stable-diffusion-xl-base-1.0.
"""
import argparse
import json
import time
from pathlib import Path

STYLE = (
    'coherent crisp 16-bit pixel art, strong hard pixel clusters, no smooth antialiasing, '
    'limited palette, wide landscape game illustration, no text'
)
NEGATIVE = 'text, letters, words, watermark, signature, blurry, photo, photorealistic, 3d render, smooth gradients, frame, border'

CARDS = {
    'title': 'a small hooded traveller with a red scarf looks out over a silent grey kingdom at dusk, a distant hilltop town with one lit window, a valley with a river and bridges, moody and still',
    'hub': 'inside a quiet stone hearth hall, a big wooden door with a round ring, a warm lantern on a bench, an open songbook, cosy and dim',
    'valley': 'a green valley with wooden bridges over a bright river, stone gates set into cliffs, two round trees, morning light',
    'town': 'a terracotta hilltop town square with a bell tower, market stalls with awnings, a stone well, a clock tower, warm afternoon light',
    'jazz': 'a violet night street of jazz clubs with glowing signs, a small band stand with a double bass, rain-wet cobbles, neon reflections',
    'stage': 'an empty golden stage in a dark theatre, one spotlight on the boards, red curtains, waiting silence',
    'results': 'the same hilltop kingdom in full colour at sunrise, music notes drifting over the town and the valley, joyful',
}

# Luminance-ordered palettes per card, from src/world/palette.ts, used as quantisation targets.
PALETTES = {
    'title': ['#0d0b16', '#2b2a4a', '#4a4d55', '#6f727a', '#8e9097', '#a5a8ae', '#d9b56a', '#f2c46d', '#e8d7b0', '#b8403a', '#f6efe2'],
    'hub': ['#1a1426', '#2b2a4a', '#5a3b2a', '#8a5a3c', '#b07a45', '#d9b56a', '#f2c46d', '#f6efe2', '#4f8fc9', '#3a3a3a'],
    'valley': ['#101c2c', '#203a5a', '#2e5a3a', '#3f8f4a', '#5b7c55', '#72b562', '#7fc36d', '#b8894f', '#4ea7d8', '#f7d35c', '#f6efe2'],
    'town': ['#1c1326', '#3a2a4e', '#7a3a2a', '#b0604a', '#c08a52', '#d8b482', '#e3c08f', '#f0a04b', '#5aa6d6', '#7bb463', '#f6efe2'],
    'jazz': ['#0b0814', '#1e1530', '#3a2a5e', '#5a3f8a', '#7c5fb3', '#9b84cc', '#ff6fb1', '#ffd0e8', '#3fd6c8', '#f6efe2'],
    'stage': ['#0d0b16', '#1e1a26', '#3a2f2a', '#6b4a2a', '#a8782e', '#ffd86b', '#fff2c0', '#8a1e2a', '#c43a3a', '#f6efe2'],
    'results': ['#1c1326', '#3a2a4e', '#5b7c55', '#7fc36d', '#b0604a', '#d9b56a', '#f2c46d', '#ffd86b', '#4ea7d8', '#ff6fb1', '#f6efe2'],
}


def hex_rgb(h: str):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def finish(raw, palette_hex, small=(256, 144)):
    """Area-average downscale, quantise to the palette plus a few extra tones, nearest upscale."""
    from PIL import Image

    im = raw.convert('RGB').resize(small, Image.BOX)
    # Quantise to the card palette extended with a few colours from the image itself, for texture.
    pal = [hex_rgb(h) for h in palette_hex]
    extra = im.quantize(colors=24, method=Image.Quantize.MEDIANCUT).getpalette()[: 24 * 3]
    colours = pal + [tuple(extra[i : i + 3]) for i in range(0, len(extra), 3)]
    pimg = Image.new('P', (1, 1))
    flat = [c for rgb in colours for c in rgb] + [0] * (768 - 3 * len(colours))
    pimg.putpalette(flat)
    q = im.quantize(palette=pimg, dither=Image.Dither.NONE)
    return q.convert('RGB').resize((small[0] * 4, small[1] * 4), Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--out', default='public/cards')
    args = ap.parse_args()
    names = [n for n in args.only.split(',') if n] or list(CARDS)

    import torch
    from diffusers import StableDiffusionXLPipeline

    t0 = time.time()
    pipe = StableDiffusionXLPipeline.from_pretrained('stabilityai/stable-diffusion-xl-base-1.0', torch_dtype=torch.float16, variant='fp16', use_safetensors=True).to('cuda')
    print(f'pipeline ready in {time.time() - t0:.0f}s', flush=True)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    Path('scratch/cards').mkdir(parents=True, exist_ok=True)
    log = []
    for name in names:
        prompt = f'{CARDS[name]}, {STYLE}'
        gen = torch.Generator('cuda').manual_seed(args.seed)
        t1 = time.time()
        img = pipe(prompt=prompt, negative_prompt=NEGATIVE, width=1024, height=576, num_inference_steps=args.steps, guidance_scale=7.0, generator=gen).images[0]
        img.save(f'scratch/cards/{name}-raw.png')
        finish(img, PALETTES[name]).save(out / f'{name}.png')
        print(f'{name}: {time.time() - t1:.0f}s', flush=True)
        log.append({'name': name, 'prompt': prompt, 'negative': NEGATIVE, 'seed': args.seed, 'steps': args.steps, 'model': 'stabilityai/stable-diffusion-xl-base-1.0'})
    (out / 'cards.json').write_text(json.dumps(log, indent=1))


if __name__ == '__main__':
    main()
