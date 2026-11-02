import Phaser from 'phaser';
import { ResultsScene } from './scenes/ResultsScene';
import { TitleScene } from './scenes/TitleScene';
import { TunerScene } from './scenes/TunerScene';
import { WorldScene } from './scenes/WorldScene';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Shortcuts: ?reset=1 clears saved progress. ?scene=tuner, or ?scene=world&area=valley&x=57&y=16 to start the world there (dev).
const params = new URLSearchParams(location.search);
if (params.get('reset')) {
  localStorage.removeItem('listening-kingdom.progress.v1');
  params.delete('reset');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
}
const startScene = params.get('scene') === 'tuner' ? 'tuner' : params.get('scene') === 'world' ? 'world' : 'title';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#14151a',
  pixelArt: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, WorldScene, ResultsScene, TunerScene],
});

game.events.once('ready', () => {
  if (startScene === 'tuner') {
    game.scene.stop('title');
    game.scene.start('tuner', {});
  } else if (startScene === 'world') {
    // The title screen still runs first: choosing Sing or Play is the click that unlocks audio and asks for the mic.
    const x = Number(params.get('x'));
    const y = Number(params.get('y'));
    game.scene.getScene('title').scene.restart({ area: params.get('area') ?? undefined, at: x && y ? { x, y } : undefined });
  }
});
