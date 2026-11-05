// Reproduces the frozen-legs bug headless (see docs/design.md, "the legs that froze"): hold a key, then
// force the crossfade weights to the pair a Mac settled on, whose float sum is one ulp under 1, and
// measure how far the left upper leg swings over the next second and a half.
// Usage: node scripts/legs-repro.mjs [baseUrl]   (prints swing before and after forcing the weights)
import { spawnSync } from 'node:child_process';
const base = process.argv[2] ?? 'https://localhost:5182';
const start = `w.keys.add('ArrowRight'); return 'moving'`;
const sample = (tag) => `const p=w.player, sc=p.root.getScene(), j=sc.getTransformNodeByName('mixamorig:LeftUpLeg');
  const run=p.clips.run, idle=p.clips.idle; const i=run.targetedAnimations.findIndex(t=>t.target===j&&t.animation.targetProperty==='rotationQuaternion');
  const ra=run.animatables[i].getAnimations()[0]; const alias = ra.currentValue === j.rotationQuaternion;
  window.__ys=[]; window.__eq=0; window.__n=0; clearInterval(window.__t);
  window.__t=setInterval(()=>{ const q=j.rotationQuaternion; window.__ys.push(q.y); window.__n++;
    const ia=idle.animatables[i].getAnimations()[0].currentValue; if (Math.abs(Math.abs(q.x*ia.x+q.y*ia.y+q.z*ia.z+q.w*ia.w)-1)<1e-4) window.__eq++; }, 50);
  return {tag:'${tag}', alias, runW: run.animatables[0].weight, idleW: idle.animatables[0].weight}`;
const force = `w.player.clips.run.setWeightForAllAnimatables(0.9990886203238337); w.player.clips.idle.setWeightForAllAnimatables(0.0009113796761661971); return 'forced'`;
const read = (tag) => `clearInterval(window.__t); const ys=window.__ys; return {tag:'${tag}', samples: ys.length, swing: +(Math.max(...ys)-Math.min(...ys)).toFixed(3), equalsIdle: window.__eq + '/' + window.__n}`;
const r = spawnSync('node', ['scripts/inspect3d.mjs', base, 'hub', '--quiet',
  '--eval', start, '--eval', sample('natural'), '--eval', read('natural'),
  '--eval', force, '--eval', sample('forced'), '--eval', read('forced')], { encoding: 'utf8' });
process.stdout.write(r.stdout.split('\n').filter((l) => l.startsWith('eval:')).join('\n') + '\n');
if (r.status) process.stderr.write(r.stderr);
