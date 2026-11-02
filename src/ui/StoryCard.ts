import Phaser from 'phaser';

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/** One line under each area's card, shown the first time the player arrives. */
export const CARD_LINES: Record<string, string> = {
  hub: 'Hearthstone. The hall where the songs were kept. The doors still remember them, if someone will listen.',
  valley: 'The Valley of Intervals. Every bridge and gate here asks for a distance: a note, and another a certain way above it.',
  town: 'Tonic Town. Every tune in this town comes home to one note. The bell will tell you which.',
  jazz: 'The Jazz Quarter. Four moods, one band, and a last door that wants the whole set.',
  stage: 'The Silent Stage. Three fragments, one song. The kingdom plays it once; you give it back.',
};

/**
 * A full-screen picture with a line of story, shown once per area. Fixed to the camera, above
 * everything. Space, Enter or a click dismisses it; the scene blocks movement while it is up.
 */
export class StoryCard {
  readonly container: Phaser.GameObjects.Container;
  private image: Phaser.GameObjects.Image | null = null;
  private line: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  onDone: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(300).setVisible(false);
    const bg = scene.add.rectangle(0, 0, width, height, 0x0d0b16, 1).setOrigin(0).setInteractive();
    bg.on('pointerdown', () => this.hide());
    const band = scene.add.rectangle(0, height - 118, width, 118, 0x0d0b16, 0.92).setOrigin(0);
    this.title = scene.add.text(40, height - 104, '', { fontFamily: FONT, fontSize: '24px', color: '#f2c46d' });
    this.line = scene.add.text(40, height - 70, '', { fontFamily: FONT, fontSize: '17px', color: '#e4ddd0', wordWrap: { width: width - 80 }, lineSpacing: 5 });
    const hint = scene.add.text(width - 24, height - 20, 'Space: continue', { fontFamily: MONO, fontSize: '13px', color: '#8f8a80' }).setOrigin(1, 0.5);
    this.container.add([bg, band, this.title, this.line, hint]);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  /** Show the card for an area. Returns false, showing nothing, when its picture is not loaded. */
  show(areaId: string, areaName: string): boolean {
    const key = `card-${areaId}`;
    if (!this.scene.textures.exists(key)) return false;
    const { width, height } = this.scene.scale;
    if (this.image) this.image.destroy();
    this.image = this.scene.add.image(width / 2, (height - 118) / 2 + 10, key);
    const scale = Math.min(width / this.image.width, (height - 118) / this.image.height);
    this.image.setScale(scale);
    this.container.addAt(this.image, 1);
    this.title.setText(areaName);
    this.line.setText(CARD_LINES[areaId] ?? '');
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 500 });
    return true;
  }

  hide(): void {
    if (!this.container.visible) return;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 350,
      onComplete: () => {
        this.container.setVisible(false);
        this.onDone?.();
      },
    });
  }
}
