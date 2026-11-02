import Phaser from 'phaser';
import { AudioEngine } from '../audio/engine';
import { uiClick } from '../audio/sfx';
import { playSequence } from '../audio/synth';
import { MicPitchDetector } from '../ear/pitchDetector';
import { clearProgress, defaultProgress, progress, saveProgress, type InputMode } from '../state';
import { PALETTES } from '../world/palette';
import { ensureTextures } from '../world/textures';
import type { WorldData } from './WorldScene';

const FONT = 'Georgia, "Times New Roman", serif';
/** The title card is queued once; a restart while it is still loading must not queue it again. */
let titleCardQueued = false;

export class TitleScene extends Phaser.Scene {
  private note!: Phaser.GameObjects.Text;
  /** Where to start the world after the player chooses how to answer. Empty for a normal start. */
  private startAt: WorldData = {};

  constructor() {
    super('title');
  }

  init(data: WorldData): void {
    this.startAt = data ?? {};
  }

  preload(): void {
    if (!this.textures.exists('card-title') && !titleCardQueued) {
      titleCardQueued = true;
      this.load.image('card-title', 'cards/title.png');
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => undefined);
    }
  }

  create(): void {
    ensureTextures(this);
    const { width, height } = this.scale;
    const p = PALETTES.hub;
    this.cameras.main.setBackgroundColor(0x1a1824);

    if (this.textures.exists('card-title')) {
      // The generated backdrop, darkened so the text reads over it.
      const img = this.add.image(width / 2, height / 2, 'card-title');
      img.setScale(Math.max(width / img.width, height / img.height));
      this.add.rectangle(0, 0, width, height, 0x0d0b16, 0.55).setOrigin(0);
    } else {
      // A quiet, grey kingdom silhouette: a few blocks and a single warm glow.
      const g = this.add.graphics();
      g.fillStyle(0x2a2733).fillRect(0, height - 150, width, 150);
      for (let i = 0; i < 12; i++) {
        const w = 40 + ((i * 37) % 50);
        const h = 50 + ((i * 53) % 90);
        g.fillStyle(0x34303f).fillRect(60 + i * 72, height - 150 - h, w, h);
      }
      this.add.image(width / 2, height - 170, 'glow').setScale(5).setTint(p.accent).setAlpha(0.5);
    }

    this.add.text(width / 2, 120, 'The Listening Kingdom', { fontFamily: FONT, fontSize: '54px', color: '#f6efe2' }).setOrigin(0.5);
    this.add
      .text(width / 2, 178, 'A kingdom gone silent. Win your voice back one note at a time.', { fontFamily: FONT, fontSize: '19px', color: '#d9d2c4', fontStyle: 'italic' })
      .setOrigin(0.5);

    this.add.text(width / 2, 232, 'How will you answer the doors?', { fontFamily: FONT, fontSize: '18px', color: '#f2c46d' }).setOrigin(0.5);

    this.button(width / 2 - 170, 290, 'Sing', 'Use your voice. Needs a microphone;\nheadphones recommended.', () => this.begin('sing'));
    this.button(width / 2 + 170, 290, 'Play', 'Your keyboard is a piano.\nWorks anywhere.', () => this.begin('play'));

    this.note = this.add.text(width / 2, 372, '', { fontFamily: FONT, fontSize: '15px', color: '#e0a3a3', align: 'center' }).setOrigin(0.5);

    if (progress.solved.length > 0) {
      const doors = progress.solved.filter((id) => !id.startsWith('fragment')).length;
      this.add.text(width / 2, 392, `Continuing your journey: ${doors} door${doors === 1 ? '' : 's'} opened.`, { fontFamily: FONT, fontSize: '15px', color: '#b9b2a6' }).setOrigin(0.5);
      const reset = this.add.rectangle(width / 2, 428, 150, 32, 0x26232f).setStrokeStyle(1, 0x6f6a78).setInteractive({ useHandCursor: true });
      this.add.text(width / 2, 428, 'Start over', { fontFamily: FONT, fontSize: '15px', color: '#f6efe2' }).setOrigin(0.5);
      reset.on('pointerover', () => reset.setStrokeStyle(1, PALETTES.hub.accent));
      reset.on('pointerout', () => reset.setStrokeStyle(1, 0x6f6a78));
      reset.on('pointerdown', () => {
        clearProgress();
        Object.assign(progress, defaultProgress());
        this.scene.restart();
      });
    }

    this.add.text(width / 2, height - 24, 'Walk with the arrow keys. Press Space at a door to listen. Every door can be answered by voice or by keys.', { fontFamily: FONT, fontSize: '13px', color: '#6f6a78' }).setOrigin(0.5);
  }

  private button(x: number, y: number, label: string, desc: string, onClick: () => void): void {
    const w = 280;
    const h = 92;
    const bg = this.add.rectangle(x, y, w, h, 0x26232f).setStrokeStyle(2, 0x4a4650).setInteractive({ useHandCursor: true });
    this.add.text(x, y - 22, label, { fontFamily: FONT, fontSize: '26px', color: '#f6efe2' }).setOrigin(0.5);
    this.add.text(x, y + 16, desc, { fontFamily: FONT, fontSize: '13px', color: '#b9b2a6', align: 'center' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setStrokeStyle(2, PALETTES.hub.accent));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4a4650));
    bg.on('pointerdown', () => {
      uiClick();
      void onClick();
    });
  }

  private async begin(mode: InputMode): Promise<void> {
    const engine = AudioEngine.get();
    await engine.unlock();
    if (mode === 'sing') {
      this.note.setText('Asking for the microphone…').setColor('#d9d2c4');
      const mic = new MicPitchDetector();
      const ok = await mic.start();
      if (!ok) {
        this.note.setText(
          mic.status === 'denied'
            ? 'The microphone was refused. You can still play with the keys.'
            : `Could not start the microphone. ${mic.lastError ?? ''}\nYou can still play with the keys.`,
        );
        return;
      }
      this.registry.set('mic', mic);
    }
    progress.inputMode = mode;
    if (!progress.startedAt) progress.startedAt = Date.now();
    saveProgress(progress);
    playSequence([60, 64, 67, 72], { timbre: 'bell', duration: 0.25, gap: 0.12, gain: 0.4 });
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(420, () => this.scene.start('world', this.startAt));
  }
}
