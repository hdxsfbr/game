import Phaser from 'phaser';
import { uiClick } from '../audio/sfx';
import { playSequence } from '../audio/synth';
import { clearProgress, defaultProgress, progress } from '../state';
import { PALETTES } from '../world/palette';
import { ensureTextures } from '../world/textures';

const FONT = 'Georgia, "Times New Roman", serif';

interface Row {
  area: string;
  name: string;
  lesson: string;
}

const ROWS: Row[] = [
  { area: 'valley', name: 'Valley of Intervals', lesson: 'An interval is a distance. You can hear it before you can name it.' },
  { area: 'town', name: 'Tonic Town', lesson: 'Every note has a job in its key. Home is degree one.' },
  { area: 'jazz', name: 'Jazz Quarter', lesson: 'A chord\'s quality lives in its third and its seventh.' },
  { area: 'stage', name: 'The Silent Stage', lesson: 'A song is all three at once.' },
];

function medal(misses: number): { name: string; color: string } {
  if (misses <= 2) return { name: 'Gold', color: '#f2c46d' };
  if (misses <= 6) return { name: 'Silver', color: '#c9cdd4' };
  return { name: 'Bronze', color: '#c98a5a' };
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The ending: what the journey took, what each area taught, and the way back in. */
export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('results');
  }

  preload(): void {
    if (!this.textures.exists('card-results')) {
      this.load.image('card-results', 'cards/results.png');
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => undefined);
    }
  }

  create(): void {
    ensureTextures(this);
    const { width, height } = this.scale;
    const p = PALETTES.stage;
    this.cameras.main.setBackgroundColor(p.sky);
    this.cameras.main.fadeIn(600, 0, 0, 0);
    if (this.textures.exists('card-results')) {
      const img = this.add.image(width / 2, height / 2, 'card-results');
      img.setScale(Math.max(width / img.width, height / img.height));
      this.add.rectangle(0, 0, width, height, 0x0d0b16, 0.7).setOrigin(0);
    }
    this.add.image(width / 2, 110, 'glow').setScale(6).setTint(p.accent).setAlpha(0.35);

    this.add.text(width / 2, 60, 'The kingdom is listening again.', { fontFamily: FONT, fontSize: '40px', color: '#f6efe2' }).setOrigin(0.5);
    const took = progress.finishedAt && progress.startedAt ? fmtTime(progress.finishedAt - progress.startedAt) : null;
    const hubMisses = progress.areaMisses.hub ?? 0;
    const quiets = progress.quiets ?? 0;
    const quietLine = quiets ? ` You went quiet ${quiets === 1 ? 'once' : `${quiets} times`} and practised your way back.` : ' Your voice never ran out.';
    this.add
      .text(width / 2, 108, (took ? `Your voice came back in ${took}${hubMisses ? `, with ${hubMisses} stumble${hubMisses === 1 ? '' : 's'} at the hearth` : ''}.` : 'Your voice came back.') + quietLine, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#b9b2a6',
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    let y = 170;
    for (const r of ROWS) {
      const misses = progress.areaMisses[r.area] ?? 0;
      const m = medal(misses);
      this.add.rectangle(width / 2, y + 22, 760, 64, 0x1a1626).setStrokeStyle(1, 0x3b3842);
      this.add.circle(width / 2 - 350, y + 22, 12, Phaser.Display.Color.HexStringToColor(m.color).color);
      this.add.text(width / 2 - 322, y + 4, r.name, { fontFamily: FONT, fontSize: '20px', color: '#f6efe2' });
      this.add.text(width / 2 - 322, y + 28, r.lesson, { fontFamily: FONT, fontSize: '14px', color: '#b9b2a6', fontStyle: 'italic' });
      this.add.text(width / 2 + 350, y + 22, `${m.name}  ·  ${misses} miss${misses === 1 ? '' : 'es'}`, { fontFamily: FONT, fontSize: '15px', color: m.color }).setOrigin(1, 0.5);
      y += 76;
    }

    this.button(width / 2 - 150, height - 54, 'Walk the kingdom', () => this.scene.start('world', { area: 'hub' }));
    this.button(width / 2 + 150, height - 54, 'Start over', () => {
      clearProgress();
      Object.assign(progress, defaultProgress());
      this.scene.start('title', {});
    });

    this.time.delayedCall(300, () => playSequence([60, 64, 67, 72, 76], { timbre: 'bell', duration: 0.35, gap: 0.16, gain: 0.4 }));
    if (import.meta.env.DEV) (window as unknown as { __lkResults: boolean }).__lkResults = true;
  }

  private button(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 240, 44, 0x26232f).setStrokeStyle(2, 0x4a4650).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '18px', color: '#f6efe2' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setStrokeStyle(2, PALETTES.stage.accent));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4a4650));
    bg.on('pointerdown', () => {
      uiClick();
      onClick();
    });
  }
}
