#!/usr/bin/env python
"""The bench guides' narration, in Andre's voice, with Chatterbox (the default model, not turbo).

Reads src/world/narration.json (one list of lines per bench) and writes public/narration/<bench>-<n>.mp3,
one per line. A line whose text has not changed since its clip was made is skipped (the text is kept
beside the clip in a .txt), so a rewrite of one line regenerates one clip.

Usage (in the chatterbox conda env):
  ~/miniconda3/envs/chatterbox/bin/python scripts/narrate.py [--force] [bench ...]
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = Path.home() / 'code/chatterbox-play/voices/andre_voice_clean_ref.wav'
OUT = ROOT / 'public/narration'
# The settings Andre's own clone tests use: a calm read.
EXAGGERATION = 0.45
CFG = 0.45


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    lines = json.loads((ROOT / 'src/world/narration.json').read_text())
    benches = args or list(lines)
    OUT.mkdir(parents=True, exist_ok=True)
    todo = []
    for bench in benches:
        for i, text in enumerate(lines[bench]):
            mp3 = OUT / f'{bench}-{i}.mp3'
            txt = OUT / f'{bench}-{i}.txt'
            if not force and mp3.exists() and txt.exists() and txt.read_text() == text:
                continue
            todo.append((bench, i, text, mp3, txt))
    if not todo:
        print('nothing to do')
        return
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    model = ChatterboxTTS.from_pretrained(device='cuda')
    for bench, i, text, mp3, txt in todo:
        wav = model.generate(text, audio_prompt_path=str(VOICE), exaggeration=EXAGGERATION, cfg_weight=CFG)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            ta.save(tmp.name, wav, model.sr)
        # Trim the silence Chatterbox leaves at both ends, so a clip ends when the voice does.
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse', '-b:a', '64k', str(mp3)], check=True)
        os.unlink(tmp.name)
        txt.write_text(text)
        print(f'{mp3.name}  {wav.shape[1] / model.sr:5.1f}s  {text[:60]}')


if __name__ == '__main__':
    main()
