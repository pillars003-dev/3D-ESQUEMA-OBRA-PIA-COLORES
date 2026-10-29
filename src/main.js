import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';

const container = document.getElementById('canvas-container');
const overlay = document.getElementById('loading-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const uploadPrompt = document.getElementById('upload-prompt');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('model-preview');
const statusText = document.getElementById('status-text');
const modelName = document.getElementById('model-name');
const compassNeedle = document.getElementById('compass-needle');
const viewButtons = ['view-iso', 'view-front', 'view-top'].map((id) => document.getElementById(id));
const gridButton = document.getElementById('toggle-grid');

let renderer;
let scene;
let camera;
let controls;
let grid;
let model;
let modelSize = new THREE.Vector3(1, 1, 1);
let target = new THREE.Vector3();
let framingDistance = 8;
let activeLoad = 0;
let cameraMotion = null;

function showOverlay(title, message, loading = false) {
  overlay.classList.remove('hidden');
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  progressBar.parentElement.hidden = !loading;
  progressLabel.hidden = !loading;
  uploadPrompt.hidden = loading;
  preview.hidden = loading;
  document.querySelector('.loading-mark').hidden = !loading;
}

function setActiveView(id) {
  for (const button of viewButtons) button.classList.toggle('active', button.id === id);
}

function placeCamera(direction, animate = true) {
  if (!model) return;
  const destination = target.clone().add(direction.clone().normalize().multiplyScalar(framingDistance));
  if (!animate) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
    return;
  }
  cameraMotion = { from: camera.position.clone(), to: destination, start: performance.now(), duration: 500 };
}

function fitModel() {
  if (!model) return;
  const aspect = Math.max(container.clientWidth / Math.max(container.clientHeight, 1), 0.1);
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  framingDistance = Math.max(
    modelSize.y / (2 * Math.tan(vertical / 2)),
    Math.max(modelSize.x, modelSize.z) / (2 * Math.tan(horizontal / 2)),
    modelSize.length() * 0.65,
  ) * 1.55;
  controls.minDistance = Math.max(modelSize.length() * 0.08, 0.05);
  controls.maxDistance = Math.max(framingDistance * 8, 8);
  target.set(0, modelSize.y * 0.44, 0);
  controls.target.copy(target);
  setActiveView('view-iso');
  placeCamera(new THREE.Vector3(1, 0.8, 1), false);
}

function disposeModel() {
  if (!model) return;
  scene.remove(model);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
  model = null;
}

function installModel(gltf, label) {
  disposeModel();
  model = gltf.scene;
  model.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let visibleMeshes = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    meshBounds.setFromObject(object);
    const size = meshBounds.getSize(new THREE.Vector3());
    // The SketchUp file contains an isolated ROOT surface several kilometres away.
    // Keep it in the model, but frame the actual architectural volume.
    if (object.name === 'ROOT' && Math.max(size.x, size.y, size.z) > 500) return;
    bounds.union(meshBounds);
    visibleMeshes++;
  });
  if (!visibleMeshes) bounds.setFromObject(model);
  if (bounds.isEmpty()) throw new Error('El archivo no contiene geometría visible.');
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
  scene.add(model);
  bounds.getSize(modelSize);
  model.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  const span = Math.max(modelSize.x, modelSize.z, 1) * 2.7;
  grid.scale.setScalar(span / 20);
  grid.position.y = -Math.max(modelSize.y * 0.001, 0.001);
  fitModel();
  modelName.textContent = label;
  statusText.textContent = 'Modelo listo para explorar';
  overlay.classList.add('hidden');
}

function loadModel(url, label, revoke = false) {
  const request = ++activeLoad;
  showOverlay('Preparando el modelo', 'Estamos cargando el volumen para que puedas explorarlo.', true);
  statusText.textContent = 'Cargando modelo';
  progressBar.style.width = '5%';
  progressLabel.textContent = 'CARGANDO…';
  const loader = new GLTFLoader();
  loader.load(url, (gltf) => {
    if (revoke) URL.revokeObjectURL(url);
    if (request !== activeLoad) return;
    try {
      installModel(gltf, label);
    } catch (error) {
      modelError(error.message);
    }
  }, (event) => {
    if (request !== activeLoad || !event.total) return;
    const percent = Math.min(100, Math.round(event.loaded / event.total * 100));
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `${percent}% CARGADO`;
  }, (error) => {
    if (revoke) URL.revokeObjectURL(url);
    if (request !== activeLoad) return;
    modelError(error?.message || 'No se pudo abrir el archivo.');
  });
}

function modelError(detail) {
  const missing = detail.includes('404') || detail.includes('fetch') || detail.includes('Unexpected token');
  showOverlay(
    missing ? 'Vista previa del proyecto' : 'No se pudo cargar el modelo',
    missing
      ? 'Esta imagen procede del archivo SketchUp original. Para orbitar el volumen, abre una versión exportada en formato .GLB.'
      : `Comprueba que el archivo sea un modelo .GLB válido. ${detail}`,
  );
  progressLabel.textContent = 'VISTA PREVIA · SIN ÓRBITA';
  progressLabel.hidden = false;
  statusText.textContent = missing ? 'Vista previa · modelo 3D pendiente' : 'Error al cargar el modelo';
}

function initViewer() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.maxPolarAngle = Math.PI * 0.96;
  controls.addEventListener('start', () => { cameraMotion = null; setActiveView(null); });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c7ba, 2.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(20, 35, 17);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdbe8e8, 1.1);
  fill.position.set(-18, 12, -15);
  scene.add(fill);
  grid = new THREE.GridHelper(20, 24, 0xb0aca1, 0xd1cec4);
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  scene.add(grid);
  camera.position.set(6, 5, 6);
  controls.update();

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  new ResizeObserver(resize).observe(container);
  resize();
  const frame = (time) => {
    requestAnimationFrame(frame);
    if (cameraMotion) {
      const t = Math.min((time - cameraMotion.start) / cameraMotion.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(cameraMotion.from, cameraMotion.to, eased);
      if (t === 1) cameraMotion = null;
    }
    controls.update();
    const heading = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    compassNeedle.style.transform = `rotate(${-heading}rad)`;
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}

for (const [id, direction] of [
  ['view-iso', new THREE.Vector3(1, 0.8, 1)],
  ['view-front', new THREE.Vector3(0, 0.2, 1)],
  ['view-top', new THREE.Vector3(0, 1, 0.001)],
]) {
  document.getElementById(id).addEventListener('click', () => {
    setActiveView(id);
    placeCamera(direction);
  });
}
document.getElementById('view-fit').addEventListener('click', fitModel);
gridButton.addEventListener('click', () => {
  grid.visible = !grid.visible;
  gridButton.classList.toggle('active', grid.visible);
  gridButton.setAttribute('aria-pressed', String(grid.visible));
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.glb')) {
    modelError('Selecciona un archivo con extensión .glb.');
    return;
  }
  loadModel(URL.createObjectURL(file), file.name.replace(/\.glb$/i, ''), true);
});

try {
  initViewer();
  loadModel('/model.glb', 'Obra Pía');
} catch (error) {
  showOverlay('No se pudo abrir el visor 3D', 'Tu navegador necesita tener WebGL activado.');
  statusText.textContent = 'WebGL no disponible';
  console.error(error);
}
