import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';

/**
 * The world is lit flat and warm, not physically. Every glTF material becomes a StandardMaterial
 * with the same albedo, emission and alpha, which suits the stylized look and keeps the
 * colour-spread shader plugin simple. Converted materials are shared by name.
 */
export function toStandard(mesh: AbstractMesh, scene: Scene, cache: Map<Material, StandardMaterial>): void {
  const src = mesh.material;
  if (!src || src instanceof StandardMaterial) return;
  let out = cache.get(src);
  if (!out) {
    out = new StandardMaterial(src.name, scene);
    if (src instanceof PBRMaterial) {
      // glTF colours are linear; StandardMaterial works in gamma space.
      out.diffuseColor = src.albedoColor.toGammaSpace();
      out.emissiveColor = src.emissiveColor.toGammaSpace();
      out.alpha = src.alpha;
      if (src.albedoTexture) {
        out.diffuseTexture = src.albedoTexture;
        out.diffuseColor = new Color3(1, 1, 1);
      }
      if (src.emissiveTexture) out.emissiveTexture = src.emissiveTexture;
      const rough = src.roughness ?? 0.8;
      out.specularColor = new Color3(0.08, 0.08, 0.08).scale(1 - rough).add(new Color3(0.02, 0.02, 0.02));
      out.specularPower = 16 + (1 - rough) * 64;
    }
    // Sky, sun, the bench lamp, the stage lamps and the four finale lights can all fall on one mesh.
    out.maxSimultaneousLights = 10;
    out.backFaceCulling = true;
    if (out.alpha < 1) {
      out.transparencyMode = 2; // alpha blend
      out.backFaceCulling = false;
    }
    cache.set(src, out);
  }
  mesh.material = out;
}

export function hexToColor3(hex: number): Color3 {
  return new Color3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}
