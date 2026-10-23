import * as THREE from 'three';
import './style.css';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { advance, lampZ, SPACING } from './driving';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}
const canvas = element<HTMLCanvasElement>('#scene');
try {
  initialize();
} catch (error) {
  element('#error').hidden = false;
  element('#error').textContent =
    '描画を開始できませんでした。WebGL対応のブラウザーで開き直してください。';
  element<HTMLButtonElement>('#start').disabled = true;
  console.error(error);
}
function initialize() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x010202);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x010202, 0.009);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 900);
  camera.position.set(-2.5, 1.28, 0);
  camera.rotation.x = -0.025;
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x4c6583, 0x12100e, 0.045));
  const roadMaterial = new THREE.ShaderMaterial({
    uniforms: { carX: { value: -2.5 }, distance: { value: 0 }, spacing: { value: SPACING } },
    vertexShader: `varying vec3 world; void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader: `
      uniform float carX; uniform float distance; uniform float spacing; varying vec3 world;
      void main(){
        float along = world.z-distance;
        float dz = mod(along+spacing*.5,spacing)-spacing*.5;
        float pool = exp(-pow(abs(dz/5.4),2.));
        float across = .25+.75*exp(-pow(abs(world.x/4.4),4.));
        // Band-limit asphalt detail and markings so distant fragments do not shimmer.
        float footprint=max(length(dFdx(world.xz)),length(dFdy(world.xz)));
        float detail=1.-smoothstep(.025,.18,footprint);
        float grit=fract(sin(dot(floor(vec2(world.x,along)*18.),vec2(12.9898,78.233)))*43758.5453);
        vec3 asphalt=vec3(.014,.016,.017)*(1.+(grit-.5)*.12*detail);
        float aa=max(fwidth(world.x),.006);
        float edge=1.-smoothstep(.045-aa,.045+aa,abs(abs(world.x)-5.));
        float dash=abs(mod(-along+3.,12.)-6.);
        float dashAA=min(fwidth(along),2.);
        float center=(1.-smoothstep(.06-aa,.06+aa,abs(world.x)))
          *(1.-smoothstep(3.-dashAA,3.+dashAA,dash));
        vec3 surface=mix(asphalt,vec3(.12,.125,.11),edge);
        surface=mix(surface,vec3(.55,.31,.023),center);
        float leftBeam=exp(-pow(abs((world.x-carX+.72)/1.55),2.));
        float rightBeam=exp(-pow(abs((world.x-carX-.72)/1.55),2.));
        float beam=(leftBeam+rightBeam)*.5*exp(-pow(abs((world.z+17.)/19.),2.));
        vec3 color=surface*(vec3(.012,.019,.024)+vec3(3.2,2.6,1.55)*pool*across+vec3(.42,.43,.39)*beam);
        float fog = 1.-exp(-pow(abs(world.z)*.006,2.));
        gl_FragColor=vec4(mix(color,vec3(.0002,.0003,.0003),fog),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 920), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -420;
  scene.add(road);
  const metal = new THREE.MeshStandardMaterial({ color: 0x45484c, roughness: 0.7 });
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0x31333a, roughness: 0.95 });
  function box(
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  for (const side of [-1, 1]) {
    box(0.35, 0.7, 900, barrierMaterial, scene, side * 5.8, 0.35, -410);
    box(0.12, 0.065, 900, metal, scene, side * 5.6, 0.76, -410);
  }
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const ctx = glowCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,238,185,1)');
  gradient.addColorStop(0.055, 'rgba(255,227,174,.5)');
  gradient.addColorStop(0.2, 'rgba(255,193,113,.07)');
  gradient.addColorStop(0.55, 'rgba(255,171,89,.015)');
  gradient.addColorStop(1, 'rgba(255,160,65,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const glowMaterial = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.65,
  });
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffe1a4, toneMapped: false });
  const lamps: THREE.Group[] = [];
  for (let i = 0; i < 24; i++) {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      box(0.11, 7.3, 0.11, metal, group, side * 5.5, 3.65, 0);
      box(2.1, 0.09, 0.12, metal, group, side * 4.5, 7.3, 0);
      box(0.85, 0.07, 0.3, bulb, group, side * 3.6, 7.22, 0);
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.set(side * 3.6, 7.19, 0);
      glow.scale.set(2.1, 1.35, 1);
      group.add(glow);
    }
    scene.add(group);
    lamps.push(group);
  }
  // Only the nearest fixtures need dynamic lights; the road uses the same analytic phase.
  const lights = Array.from({ length: 3 }, () => {
    const light = new THREE.PointLight(0xffbd52, 290, 26, 2);
    scene.add(light);
    return light;
  });
  // Soft reflected light travels across the cabin as each fixture passes overhead.
  // Camera-local coordinates keep the sweep attached to the cabin, not the screen.
  const cabinMaterial = new THREE.ShaderMaterial({
    uniforms: { phase: { value: 0 } },
    vertexShader: `varying vec3 cabin; varying vec3 faceNormal;
      void main(){cabin=(modelMatrix*vec4(position,1.)).xyz;
        cabin=(viewMatrix*vec4(cabin,1.)).xyz;
        faceNormal=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*vec4(cabin,1.);}`,
    fragmentShader: `uniform float phase; varying vec3 cabin; varying vec3 faceNormal;
      void main(){
        float envelope=exp(-pow(abs(phase/7.),4.));
        float travel=cabin.z-cabin.y*.32+cabin.x*.12;
        float reflected=exp(-pow(abs((travel-(-.76+phase*.1))/.34),2.));
        float facing=.06+.94*pow(max(faceNormal.y,0.),1.4);
        vec3 color=vec3(.0002,.00025,.0003)
          +vec3(.16,.105,.048)*envelope*reflected*facing
          *(1.-smoothstep(-.95,-.3,cabin.z));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // A low curved cowl catches grazing light without a bright rectangular front face.
  const dashGeometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];
  const columns = 40;
  const rows = 12;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let col = 0; col <= columns; col++) {
      const x = (col / columns - 0.5) * 2.8;
      const y = -0.72 + 0.095 * Math.sin(t * Math.PI) - 0.025 * (x * x);
      vertices.push(x, y, -1.4 + t * 1.12);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  dashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  dashGeometry.setIndex(indices);
  dashGeometry.computeVertexNormals();
  camera.add(new THREE.Mesh(dashGeometry, cabinMaterial));
  box(2.8, 0.3, 0.9, new THREE.MeshBasicMaterial({ color: 0x000000 }), camera, 0, -0.91, -0.74);
  for (const side of [-1, 1]) {
    const pillar = box(0.075, 1.75, 0.13, cabinMaterial, camera, side * 1.08, 0.02, -0.95);
    pillar.rotation.z = side * 0.23;
    box(0.19, 0.2, 1.6, cabinMaterial, camera, side * 1.23, -0.59, -0.35);
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.027, 8, 48), cabinMaterial);
  wheel.position.set(-0.43, -0.64, -0.64);
  wheel.rotation.x = -0.22;
  camera.add(wheel);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  const film = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
      void main(){
        vec3 color=texture2D(tDiffuse,vUv).rgb;
        float grain=fract(sin(dot(gl_FragCoord.xy+floor(time*24.),vec2(12.9898,78.233)))*43758.5453)-.5;
        float vignette=1.-.65*smoothstep(.18,.72,length((vUv-.5)*vec2(1.,.9)));
        color=pow(color,vec3(1.1))*vignette;
        color+=grain*.035*(.02+sqrt(max(color.r,max(color.g,color.b))));
        gl_FragColor=vec4(max(color,vec3(0.)),1.);
      }`,
  });
  composer.addPass(film);
  const state = { speed: 0, distance: 12, x: -2.5, steering: 0 };
  const keys = new Set<string>();
  const touches = new Map<number, string>();
  let running = false;
  let started = false;
  const recognized = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyD'];
  window.addEventListener('keydown', (event) => {
    if (!recognized.includes(event.code) || !running) return;
    event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  function clearInput() {
    keys.clear();
    touches.clear();
  }
  function pause() {
    if (!running) return;
    running = false;
    clearInput();
    element('#intro').hidden = false;
    element('#hud').hidden = true;
    element('#touch').hidden = true;
    element('#start').textContent = 'RESUME';
    document.body.classList.remove('driving');
  }
  element('#start').addEventListener('click', () => {
    running = true;
    started = true;
    clearInput();
    element('#intro').hidden = true;
    element('#hud').hidden = false;
    element('#touch').hidden = false;
    document.body.classList.add('driving');
  });
  element('#pause').addEventListener('click', pause);
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
    button.addEventListener('pointerdown', (event) => {
      if (!running) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, button.dataset.control ?? '');
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, (event) => touches.delete((event as PointerEvent).pointerId));
    }
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) {
      const touch = [...touches.values()];
      const gas = keys.has('ArrowUp') || keys.has('KeyW') || touch.includes('gas');
      const left = keys.has('ArrowLeft') || keys.has('KeyA') || touch.includes('left');
      const right = keys.has('ArrowRight') || keys.has('KeyD') || touch.includes('right');
      advance(state, gas, Number(right) - Number(left), dt);
    }
    roadMaterial.uniforms.distance.value = state.distance;
    roadMaterial.uniforms.carX.value = state.x;
    cabinMaterial.uniforms.phase.value = ((state.distance + SPACING / 2) % SPACING) - SPACING / 2;
    film.uniforms.time.value = now / 1000;
    wheel.rotation.z = -state.steering * 0.18;
    lamps.forEach((lamp, i) => (lamp.position.z = lampZ(i, state.distance)));
    lights.forEach((light, i) => light.position.set(0, 6.8, lampZ(i, state.distance)));
    camera.position.x = state.x;
    camera.rotation.z = -state.steering * 0.012;
    camera.rotation.y = -state.steering * 0.022;
    element('#speed').textContent = Math.round(state.speed * 3.6)
      .toString()
      .padStart(3, '0');
    // Intro is stationary so the first press establishes the light rhythm.
    if (!started) camera.rotation.y = -0.035;
    composer.render();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    pause();
    renderer.setAnimationLoop(null);
    element('#error').hidden = false;
    element('#error').textContent = '描画が中断されました。ページを再読み込みしてください。';
  });
}
