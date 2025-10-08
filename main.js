// test 3


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
renderer.xr.enabled = true;                 // WebXR on
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

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
camera.position.set(0, 1.6, 0);        // ~1.6m
scene.add(camera);

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

// Place things ~2m in front
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

// ========= XR locomotion EXACTLY like reference =========

// Dolly (rig) that we move/rotate in XR
const dolly = new THREE.Object3D();
dolly.position.set(0, 0, 0);
scene.add(dolly);

// Parent/restore camera on XR session start/end (like your original)
renderer.xr.addEventListener('sessionstart', () => {
  dolly.add(camera);
});
renderer.xr.addEventListener('sessionend', () => {
  scene.add(camera);
});

// Controller models + simple rays (like buildController)
const controllerModelFactory = new XRControllerModelFactory();
function buildControllerViz(data) {
  let geometry, material;
  if (data.targetRayMode === 'tracked-pointer') {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,-1], 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.5,0.5,0.5, 0,0,0], 3));
    material = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending });
    return new THREE.Line(geometry, material);
  } else { // 'gaze'
    geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
    material = new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true });
    return new THREE.Mesh(geometry, material);
  }
}

// Grab controllers and grips
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
controller1.addEventListener('connected', (e) => controller1.add(buildControllerViz(e.data)));
controller2.addEventListener('connected', (e) => controller2.add(buildControllerViz(e.data)));
controller1.addEventListener('disconnected', function(){ this.remove(this.children[0]); });
controller2.addEventListener('disconnected', function(){ this.remove(this.children[0]); });

const grip1 = renderer.xr.getControllerGrip(0);
const grip2 = renderer.xr.getControllerGrip(1);
grip1.add(controllerModelFactory.createControllerModel(grip1));
grip2.add(controllerModelFactory.createControllerModel(grip2));

// Add controllers to rig (matches reference)
dolly.add(controller1, controller2, grip1, grip2);

// Controller state (same schema as reference)
const controllerStates = {
  leftController:  { thumbstick: { x: 0, y: 0 }, trigger: 0, triggerPressed: false },
  rightController: { thumbstick: { x: 0, y: 0 }, trigger: 0, triggerPressed: false },
};
const TRIGGER_THRESHOLD = 0.1;

// Movement settings (same as reference)
const vrSettings = {
  moveSpeed: 2,       // meters per frame-unit (we’ll scale by dt below to be nicer)
  rotationSpeed: 0.05 // radians per frame-unit
};

// Poll XR gamepads each frame and fill controllerStates exactly like your code
function pollXRInput(frame) {
  const session = frame?.session;
  if (!session) return;

  // NOTE: original code re-created lastTriggerState per frame (edge detect ineffective).
  // To stay true to behavior, we won't implement persistent edge detection here either.
  const inputSources = Array.from(session.inputSources);
  inputSources.forEach((inputSource) => {
    if (!inputSource.gamepad) return;

    const state = inputSource.handedness === 'left'
      ? controllerStates.leftController
      : controllerStates.rightController;

    // EXACT mapping: axes[2], axes[3] (Oculus/Quest)
    if (inputSource.gamepad.axes.length >= 4) {
      state.thumbstick.x = inputSource.gamepad.axes[2] || 0;
      state.thumbstick.y = inputSource.gamepad.axes[3] || 0;

      // Trigger on buttons[0] value, thresholded
      state.trigger = Math.abs(inputSource.gamepad.buttons[0]?.value || 0);
      state.triggerPressed = state.trigger > TRIGGER_THRESHOLD;
    }
  });
}

// EXACT same locomotion math as reference (world-axes, not head-relative)
function updateCameraLikeReference() {
  if (!renderer.xr.isPresenting) return;

  const left = controllerStates.leftController.thumbstick;
  const right = controllerStates.rightController.thumbstick;

  // Left stick Y -> forward/back on world Z
  if (Math.abs(left.y) > 0.1) {
    dolly.position.z += left.y * vrSettings.moveSpeed;
  }
  // Left stick X -> strafe on world X
  if (Math.abs(left.x) > 0.1) {
    dolly.position.x += left.x * vrSettings.moveSpeed;
  }
  // Right stick X -> yaw (negative to match reference)
  if (Math.abs(right.x) > 0.1) {
    dolly.rotation.y -= right.x * vrSettings.rotationSpeed;
  }
}

// --------- Render loop (WebXR-friendly) ---------
renderer.setAnimationLoop((timestamp, frame) => {
  if (renderer.xr.isPresenting) {
    pollXRInput(frame);              // fill controllerStates like reference
    updateCameraLikeReference();     // move/turn rig in world axes
  } else {
    controls.update();               // desktop
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
document.addEventListener('mousedown', (event) => {
  const coords = new THREE.Vector2(
    (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
    -((event.clientY / renderer.domElement.clientHeight) * 2 - 1)
  );
  raycaster.setFromCamera(coords, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length > 0) {
    const obj = hits[0].object;
    if (obj.material?.color) {
      obj.material.color = new THREE.Color(Math.random(), Math.random(), Math.random());
    }
    console.log(`${obj.name} was clicked!`);
  }
});
