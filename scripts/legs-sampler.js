// Frozen-legs diagnosis. Paste SNIPPET 1 into the game tab's DevTools console (Cmd+Option+J)
// after reloading the page. Play, run until the legs freeze, keep holding the key a few seconds,
// then paste SNIPPET 2: it copies the last forty seconds of samples to the clipboard.
// Each row: time, moving, run frame (clip), run frame (leg), run weight (leg), idle weight (leg),
// run paused, idle paused, blend count, blend total weight, joint quaternion, run's value, idle's value.

// ---- SNIPPET 1 ----
window.__s=[];setInterval(()=>{const w=window.__lk,p=w&&w.player;if(!p||!p.clips)return;const sc=p.root.getScene();const j=sc.getTransformNodeByName('mixamorig:LeftUpLeg');const pick=(g)=>{const i=g.targetedAnimations.findIndex(t=>t.target===j&&t.animation.targetProperty==='rotationQuaternion');const a=g.animatables[i];const ra=a&&a.getAnimations()[0];return a?[+a.masterFrame.toFixed(0),+a.weight.toFixed(3),a._paused?1:0,a._previousWeight,ra&&ra.currentValue?ra.currentValue.asArray().map(v=>+v.toFixed(2)).join(' '):'-']:['none']};const h=j._lateAnimationHolders&&j._lateAnimationHolders.rotationQuaternion;window.__s.push([Date.now()%100000,p.moving?1:0,+p.clips.run.animatables[0].masterFrame.toFixed(0),pick(p.clips.run),pick(p.clips.idle),h?[h.animations.length,+h.totalWeight.toFixed(3),h.animations.map(a=>+a.weight.toFixed(3)).join('/')]:'noholder',j.rotationQuaternion?j.rotationQuaternion.asArray().map(v=>+v.toFixed(2)).join(' '):'noq'])},250);'on'

// ---- SNIPPET 2 ----
copy(JSON.stringify(window.__s.slice(-160)))
