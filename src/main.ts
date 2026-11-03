import './overlay/ui.css';
import { App } from './scenes3d/App';

// Shortcuts: ?reset=1 clears saved progress. ?scene=world&area=valley&x=57&y=16 starts the world there after the title (dev).
// ?ao=on|off forces the ambient occlusion on or off (see World.ts).
const params = new URLSearchParams(location.search);
if (params.get('reset')) {
  localStorage.removeItem('listening-kingdom.progress.v1');
  params.delete('reset');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
}

const x = Number(params.get('x'));
const y = Number(params.get('y'));
const startAt = params.get('scene') === 'world' ? { area: params.get('area') ?? undefined, at: x && y ? { x, y } : undefined } : {};

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const app = new App(canvas, ui);
void app.start(startAt);
