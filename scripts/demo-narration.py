#!/usr/bin/env python
"""The demo video's narration, in Andre's voice, with Chatterbox: one clip per scene, from the
"- NN: text" lines under "## Narration" in docs/demo-script.md, written to <outDir>/NN.mp3 with the
text beside it; a line whose text is unchanged is skipped.

Usage (in the chatterbox conda env):
  ~/miniconda3/envs/chatterbox/bin/python scripts/demo-narration.py [outDir] [--force]
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = Path.home() / 'code/chatterbox-play/voices/andre_voice_clean_ref.wav'
EXAGGERATION = 0.45
CFG = 0.45


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = Path(args[0]) if args else ROOT / 'scratch/demo/narration'
    force = '--force' in sys.argv
    doc = (ROOT / 'docs/demo-script.md').read_text().split('## Narration', 1)[1]
    lines = re.findall(r'^- (\d\d): (.+)$', doc, re.M)
    out.mkdir(parents=True, exist_ok=True)
    todo = [(n, t) for n, t in lines if force or not ((out / f'{n}.mp3').exists() and (out / f'{n}.txt').exists() and (out / f'{n}.txt').read_text() == t)]
    if not todo:
        print('nothing to do')
        return
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS

    model = ChatterboxTTS.from_pretrained(device='cuda')
    for n, text in todo:
        wav = model.generate(text, audio_prompt_path=str(VOICE), exaggeration=EXAGGERATION, cfg_weight=CFG)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            ta.save(tmp.name, wav, model.sr)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse', '-b:a', '96k', str(out / f'{n}.mp3')], check=True)
        os.unlink(tmp.name)
        (out / f'{n}.txt').write_text(text)
        print(f'{n}.mp3  {wav.shape[1] / model.sr:5.1f}s  {text[:70]}')


if __name__ == '__main__':
    main()
