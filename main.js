// --- CDN imports (works on GitHub Pages) ---
import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRControllerModelFactory.js';

// --------- Renderer (enable WebXR) ---------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0x222230);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true; // <— WebXR on
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer)); // <— VR button

// --------- Scene ---------
const scene = new THREE.Scene();

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(2, 5, 10);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.1));

// --------- Camera ---------
// In VR, pose/FOV/aspect come from the VR system. We set a reasonable standing height for non-VR.
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0); // ~1.6m standing height

// Desktop navigation (disabled by the VR runtime when in XR)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, -2);
controls.update();

// --------- World geometry (meters) ---------
const floorGeometry = new THREE.PlaneGeometry(25, 20);
const floorMesh = new THREE.Mesh(
  floorGeometry,
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.name = 'Floor';
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);         // 1m cubes (VR uses meters)
const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.0); // 1m tall cylinder
const material = new THREE.MeshLambertMaterial();

function createMesh(geometry, material, x, y, z, name, layer) {
  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.layers.set(layer);
  return mesh;
}

// Place things ~2m in front of the camera centerline at user eye-height
const cylinders = new THREE.Group();
cylinders.add(createMesh(cylinderGeometry, material,  0.8, 1.6, -2, 'Cylinder A', 0));
cylinders.add(createMesh(cylinderGeometry, material,  2.0, 1.6, -2, 'Cylinder B', 0));
cylinders.add(createMesh(cylinderGeometry, material,  1.4, 2.6, -2, 'Cylinder C', 0));
scene.add(cylinders);

const boxes = new THREE.Group();
boxes.add(createMesh(boxGeometry, material, -0.5, 1.6, -2, 'Box A', 0));
boxes.add(createMesh(boxGeometry, material, -3.0, 1.6, -2, 'Box B', 0));
boxes.add(createMesh(boxGeometry, material, -1.8, 2.6, -2, 'Box C', 0));
scene.add(boxes);

// --------- Render loop (WebXR-friendly) ---------
function render(time) {
  // time *= 0.001; // use if you animate by time

  // Keep desktop controls smooth when not in VR
  if (!renderer.xr.isPresenting) controls.update();

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render); // <— Let three.js drive the loop (needed for VR)

// --------- Resize handling ---------
window.addEventListener('resize', () => {
  // In VR, projection is managed by the runtime; this is for desktop mode.
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========= RAYCASTING (desktop click) =========
const raycaster = new THREE.Raycaster();

document.addEventListener('mousedown', onMouseDown);

function onMouseDown(event) {
  const coords = new THREE.Vector2(
    (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
    -((event.clientY / renderer.domElement.clientHeight) * 2 - 1),
  );

  raycaster.setFromCamera(coords, camera);

  const intersections = raycaster.intersectObjects(scene.children, true);
  if (intersections.length > 0) {
    const selectedObject = intersections[0].object;
    if (selectedObject.material?.color) {
      selectedObject.material.color = new THREE.Color(Math.random(), Math.random(), Math.random());
    }
    console.log(`${selectedObject.name} was clicked!`);
  }
}
