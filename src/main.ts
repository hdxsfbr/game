import './overlay/ui.css';
import { App } from './scenes3d/App';
import { AREAS } from './world/areas';
import { progress, saveProgress } from './state';

// Shortcuts: ?reset=1 clears saved progress. ?scene=world&area=valley&x=57&y=16 starts the world there after the title (dev).
// ?open=jazz (or ?open=all) marks that area's doors as solved so the whole street can be walked; ?reset=1 undoes it.
// ?ao=on turns the ambient occlusion on; it is off by default (see World.ts).
const params = new URLSearchParams(location.search);
if (params.get('reset')) {
  localStorage.removeItem('listening-kingdom.progress.v1');
  params.delete('reset');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
}
const open = params.get('open');
if (open) {
  for (const area of Object.values(AREAS)) {
    if (open !== 'all' && area.id !== open) continue;
    for (const e of area.entities) if (e.kind === 'door' && !progress.solved.includes(e.puzzle.id)) progress.solved.push(e.puzzle.id);
  }
  saveProgress(progress);
}

const x = Number(params.get('x'));
const y = Number(params.get('y'));
const startAt = params.get('scene') === 'world' ? { area: params.get('area') ?? undefined, at: x && y ? { x, y } : undefined } : {};

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const app = new App(canvas, ui);
void app.start(startAt);
