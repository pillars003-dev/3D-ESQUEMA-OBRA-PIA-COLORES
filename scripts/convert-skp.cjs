const fs = require('node:fs');
const path = require('node:path');
const { SkpFile, toInstancedGLB } = require('openskp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'source.skp');
const output = path.join(root, 'public', 'model.glb');

const scene = SkpFile.open(source).buildInstancedScene();
if (!scene.meshResources.length) {
  throw new Error(`No renderable meshes found in ${source}`);
}

// The source has a two-triangle ground plane spanning roughly 4 km around
// a 100 m building. It obscures the volume and distorts camera framing.
// Keep the other four ROOT primitives, which contain real model geometry.
const rootMesh = scene.meshResources.find((mesh) => mesh.definitionId === 'ROOT');
if (rootMesh) {
  rootMesh.primitives = rootMesh.primitives.filter((primitive) => {
    const positions = primitive.positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], positions[i + axis]);
        max[axis] = Math.max(max[axis], positions[i + axis]);
      }
    }
    return max.every((value, axis) => value - min[axis] < 500);
  });
}

const glb = toInstancedGLB(scene, { textures: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, glb);
console.log(`Converted ${scene.meshResources.length} meshes to ${output} (${glb.length} bytes)`);
