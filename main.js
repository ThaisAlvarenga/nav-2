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
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0); // ~1.6m standing height
scene.add(camera); // <-- we'll reparent this into the rig when XR starts

// Desktop navigation
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, -2);
controls.update();

// ========= World geometry (meters) =========
const floorGeometry = new THREE.PlaneGeometry(25, 20);
const floorMesh = new THREE.Mesh(
  floorGeometry,
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.name = 'Floor';
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.0);
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

// ========= Quest-style XR locomotion =========

// === Rig that we move in XR (the camera is parented into this in XR) ===
const rig = new THREE.Group();
scene.add(rig);

// Quest detection (kept simple; works on Quest/Oculus Browser/Meta Browser)
const questLikeUA = /OculusBrowser|Meta|Quest|Oculus/i.test(navigator.userAgent);

// Controller models (nice visuals in XR)
const controllerModelFactory = new XRControllerModelFactory();
for (let i = 0; i < 2; i++) {
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);
}

// Movement tuning
const NAV = {
  moveSpeed: 2.5,      // m/s
  rotateSpeed: 1.8,    // rad/s
  deadzone: 0.08
};

// Compute head-relative flat forward/right
function getHeadBasis() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).negate().normalize();
  return { fwd, right };
}

// Make sure the rig starts where the camera currently is (world space)
function syncRigToCamera() {
  const camWorldPos = new THREE.Vector3();
  camera.getWorldPosition(camWorldPos);
  rig.position.copy(camWorldPos);
  rig.rotation.set(0, 0, 0);
}

// Reparent camera for XR (and restore for desktop)
renderer.xr.addEventListener('sessionstart', () => {
  syncRigToCamera();
  rig.add(camera);
  controls.enabled = false;
});
renderer.xr.addEventListener('sessionend', () => {
  scene.add(camera);
  controls.enabled = true;
  controls.update();
});

// Per-frame XR locomotion (only if Quest-like)
function updateXRLocomotion(dt) {
  const session = renderer.xr.getSession?.();
  if (!session || !questLikeUA) return;

  // Aggregate inputs by handedness
  let leftX = 0, leftY = 0, rightX = 0;

  session.inputSources.forEach((src) => {
    const gp = src.gamepad;
    if (!gp) return;

    // Prefer [2,3] (common on Quest), fall back to [0,1]
    const axX = gp.axes[2] ?? gp.axes[0] ?? 0;
    const axY = gp.axes[3] ?? gp.axes[1] ?? 0;

    if (src.handedness === 'left') {
      leftX = Math.abs(axX) > NAV.deadzone ? axX : 0;
      leftY = Math.abs(axY) > NAV.deadzone ? axY : 0;
    } else if (src.handedness === 'right') {
      rightX = Math.abs(axX) > NAV.deadzone ? axX : 0;
    }
  });

  // Head-relative translation from left stick
  if (leftX !== 0 || leftY !== 0) {
    const { fwd, right } = getHeadBasis();
    // On most pads: up = -Y. We want up to move forward.
    const moveVec = new THREE.Vector3()
      .addScaledVector(fwd, -leftY)
      .addScaledVector(right, leftX)
      .multiplyScalar(NAV.moveSpeed * dt);
    rig.position.add(moveVec);
  }

  // Smooth yaw from right stick X
  if (rightX !== 0) {
    rig.rotation.y -= rightX * NAV.rotateSpeed * dt;
  }
}

// --------- Render loop (WebXR-friendly) ---------
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (renderer.xr.isPresenting) {
    updateXRLocomotion(dt);  // <-- Quest-style movement in XR
  } else {
    controls.update();       // desktop
  }

  renderer.render(scene, camera);
});

// --------- Resize handling ---------
window.addEventListener('resize', () => {
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
