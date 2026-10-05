import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { DisplayState, RenderProp, PropShape } from '../engine/displayLayer';

// 渲染层：只消费 DisplayState（PRD §15.6）。碰不到 RealState/Game（eslint 拦截）。
// 升级版 3D 呈现：每种 shape 走一套"细节程序化建模"（门框/立柱/发光基座/下沉深坑/
// 结晶体玩家），配 PBR 材质 + 环境反射 + 阴影 + 泛光(bloom)——不再是发光方块。
// 真假仍由 DisplayLayer 的谎言决定，这里照单全收。

// —— 共享几何体（省显存）——
const SHARED = new Set<THREE.BufferGeometry>();
function shared<T extends THREE.BufferGeometry>(g: T): T {
  SHARED.add(g);
  return g;
}
const G_ROUNDED = shared(new RoundedBoxGeometry(1, 1, 1, 4, 0.08));
const G_PLANE = shared(new THREE.PlaneGeometry(1, 1));
const G_ICO_CORE = shared(new THREE.IcosahedronGeometry(0.22, 1));
const G_ICO_SHELL = shared(new THREE.IcosahedronGeometry(0.34, 1));
const G_OCTA = shared(new THREE.OctahedronGeometry(0.3, 0));

function col(c: string): THREE.Color {
  return new THREE.Color(c);
}
function applyEmissive(m: THREE.MeshStandardMaterial, p: RenderProp): void {
  if (p.emissive === 'transparent' || p.emissiveIntensity <= 0) {
    m.emissive.set(0x000000);
    m.emissiveIntensity = 0;
  } else {
    m.emissive.set(p.emissive);
    m.emissiveIntensity = p.emissiveIntensity;
  }
}
function applyOpacity(m: THREE.Material, opacity: number): void {
  m.transparent = opacity < 1;
  m.opacity = opacity;
}

// 单件道具的视图：持有一个 group + 更新/销毁函数。shape 变化时整体重建（深坑↔平台的变形）。
interface PropView {
  shape: PropShape;
  group: THREE.Group;
  update: (p: RenderProp, time: number) => void;
  dispose: () => void;
  label?: THREE.Sprite;
  labelKey: string;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
      if (mesh.geometry && !SHARED.has(mesh.geometry)) mesh.geometry.dispose();
    }
  });
}

// ========================= 各 shape 的程序化建模 =========================

function buildBlock(): Omit<PropView, 'shape' | 'labelKey'> {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1b1030,
    roughness: 0.42,
    metalness: 0.4,
    envMapIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(G_ROUNDED, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // 顶面一圈暗金描边，脱离"纯色块"
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x3a2550,
    roughness: 0.3,
    metalness: 0.6,
    envMapIntensity: 1,
  });
  const edge = new THREE.Mesh(G_PLANE, edgeMat);
  edge.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh, edge);
  return {
    group,
    update(p) {
      mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      mesh.scale.set(p.size.x, p.size.y, p.size.z);
      mat.color.set(p.color);
      applyEmissive(mat, p);
      applyOpacity(mat, p.opacity);
      edge.position.set(p.pos.x, p.pos.y + p.size.y / 2 + 0.005, p.pos.z);
      edge.scale.set(p.size.x * 0.98, p.size.z * 0.98, 1);
    },
    dispose() {
      mat.dispose();
      edgeMat.dispose();
    },
  };
}

function buildPlatform(): Omit<PropView, 'shape' | 'labelKey'> {
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x201433,
    roughness: 0.55,
    metalness: 0.5,
    envMapIntensity: 1,
  });
  const base = new THREE.Mesh(G_ROUNDED, baseMat);
  base.castShadow = true;
  base.receiveShadow = true;
  // 发光顶面板（霓虹感来自这里，而非整块方块自发光）
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x05030a,
    roughness: 0.25,
    metalness: 0.1,
  });
  const glow = new THREE.Mesh(G_PLANE, glowMat);
  glow.rotation.x = -Math.PI / 2;
  // 顶面内嵌暗槽，增加层次
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x120a1e, roughness: 0.8, metalness: 0.2 });
  const rim = new THREE.Mesh(G_PLANE, rimMat);
  rim.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(base, rim, glow);
  return {
    group,
    update(p, time) {
      base.position.set(p.pos.x, p.pos.y, p.pos.z);
      base.scale.set(p.size.x, p.size.y, p.size.z);
      baseMat.color.set(p.color);
      applyOpacity(baseMat, p.opacity);
      const top = p.pos.y + p.size.y / 2;
      rim.position.set(p.pos.x, top + 0.008, p.pos.z);
      rim.scale.set(p.size.x * 0.9, p.size.z * 0.9, 1);
      glow.position.set(p.pos.x, top + 0.016, p.pos.z);
      glow.scale.set(p.size.x * 0.72, p.size.z * 0.72, 1);
      const lit = !(p.emissive === 'transparent' || p.emissiveIntensity <= 0);
      if (lit) {
        glowMat.color.set(p.emissive);
        const pulse = 0.55 + 0.25 * Math.sin(time * 2.2 + p.pos.x);
        glowMat.emissive.set(p.emissive);
        glowMat.emissiveIntensity = p.emissiveIntensity * (1.3 + pulse);
        glow.visible = true;
      } else {
        glow.visible = false;
      }
      applyOpacity(glowMat, p.opacity);
    },
    dispose() {
      baseMat.dispose();
      glowMat.dispose();
      rimMat.dispose();
    },
  };
}

// 画上去的假门用的"油画"贴图（trompe-l'oeil）：露馅时门变成一张画。
let paintingTex: THREE.CanvasTexture | null = null;
function doorPaintingTexture(): THREE.CanvasTexture {
  if (paintingTex) return paintingTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2c3a30';
  ctx.fillRect(0, 0, 256, 384);
  // 粗糙的"手绘门"：两块门板 + 歪扭的笔触
  ctx.strokeStyle = '#4a6b52';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 208, 336);
  ctx.strokeRect(44, 54, 168, 130);
  ctx.strokeRect(44, 200, 168, 130);
  ctx.fillStyle = '#3a5142';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.1 + Math.random() * 0.15;
    ctx.fillRect(Math.random() * 256, Math.random() * 384, 30, 4);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#8a7aa0';
  ctx.font = 'bold 26px "PingFang SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('（畫の）', 128, 360);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  paintingTex = t;
  return t;
}

function buildDoor(): Omit<PropView, 'shape' | 'labelKey'> {
  // 本地单位尺寸：门占 x∈[-0.5,0.5], y∈[-0.5,0.5]，深度沿 z 固定（不随 size.z 变）。
  const doorGroup = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x6b5330,
    roughness: 0.35,
    metalness: 0.8,
    envMapIntensity: 1.1,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1f8f4d,
    roughness: 0.5,
    metalness: 0.3,
    envMapIntensity: 0.9,
  });
  const insetMat = new THREE.MeshStandardMaterial({ color: 0x14502c, roughness: 0.6, metalness: 0.2 });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8,
    roughness: 0.2,
    metalness: 1,
    envMapIntensity: 1.4,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.0 });

  const postL = new THREE.Mesh(G_ROUNDED, frameMat);
  postL.position.set(-0.46, 0, 0);
  postL.scale.set(0.1, 1.0, 0.2);
  const postR = postL.clone();
  postR.position.x = 0.46;
  const lintel = new THREE.Mesh(G_ROUNDED, frameMat);
  lintel.position.set(0, 0.46, 0);
  lintel.scale.set(1.02, 0.1, 0.22);
  const panel = new THREE.Mesh(G_ROUNDED, panelMat);
  panel.position.set(0, -0.02, 0);
  panel.scale.set(0.8, 0.88, 0.12);
  const insetTop = new THREE.Mesh(G_ROUNDED, insetMat);
  insetTop.position.set(0, 0.16, 0.07);
  insetTop.scale.set(0.52, 0.3, 0.04);
  const insetBot = insetTop.clone();
  insetBot.position.set(0, -0.2, 0.07);
  const handle = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12)), handleMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.26, -0.02, 0.09);
  const glow = new THREE.Mesh(G_PLANE, glowMat);
  glow.position.set(0, 0, -0.08);
  glow.scale.set(1.15, 1.12, 1);
  [postL, postR, lintel, panel, insetTop, insetBot, handle].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  doorGroup.add(glow, postL, postR, lintel, panel, insetTop, insetBot, handle);

  // 露馅时的"画"：一张平面贴图
  const painting = new THREE.Mesh(
    G_PLANE,
    new THREE.MeshStandardMaterial({
      map: doorPaintingTexture(),
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  painting.visible = false;

  const group = new THREE.Group();
  group.add(doorGroup, painting);
  return {
    group,
    update(p) {
      const flat = p.size.z < 0.12;
      group.position.set(p.pos.x, p.pos.y, p.pos.z);
      doorGroup.scale.set(p.size.x, p.size.y, 1);
      doorGroup.visible = !flat;
      painting.visible = flat;
      painting.scale.set(p.size.x * 0.84, p.size.y * 0.94, 1);
      panelMat.color.set(p.color);
      applyEmissive(panelMat, p);
      const lit = !(p.emissive === 'transparent' || p.emissiveIntensity <= 0);
      glowMat.color.set(lit ? p.emissive : '#000000');
      glowMat.opacity = lit ? 0.5 : 0;
      frameMat.emissive.set(lit ? p.emissive : 0x000000);
      frameMat.emissiveIntensity = lit ? 0.15 : 0;
    },
    dispose() {
      frameMat.dispose();
      panelMat.dispose();
      insetMat.dispose();
      handleMat.dispose();
      glowMat.dispose();
      (painting.material as THREE.Material).dispose();
    },
  };
}

function buildPillar(): Omit<PropView, 'shape' | 'labelKey'> {
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x2a1b3d,
    roughness: 0.4,
    metalness: 0.5,
    envMapIntensity: 1,
  });
  const shaft = new THREE.Mesh(
    shared(new THREE.CylinderGeometry(0.42, 0.46, 1, 24, 1)),
    stoneMat,
  );
  const capital = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.6, 0.5, 0.14, 24)), stoneMat);
  capital.position.y = 0.52;
  const baseBlk = new THREE.Mesh(shared(new THREE.CylinderGeometry(0.5, 0.6, 0.14, 24)), stoneMat);
  baseBlk.position.y = -0.52;
  [shaft, capital, baseBlk].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  const group = new THREE.Group();
  group.add(shaft, capital, baseBlk);
  return {
    group,
    update(p) {
      group.position.set(p.pos.x, p.pos.y, p.pos.z);
      group.scale.set(p.size.x, p.size.y, p.size.z);
      stoneMat.color.set(p.color);
      applyOpacity(stoneMat, p.opacity);
    },
    dispose() {
      stoneMat.dispose();
    },
  };
}

function buildHole(): Omit<PropView, 'shape' | 'labelKey'> {
  // 下沉深坑：内壁用 BackSide 暗面做出"凹进去"的体积 + 坑底一圈冷光
  const cavityMat = new THREE.MeshStandardMaterial({
    color: 0x070410,
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
  });
  const cavity = new THREE.Mesh(G_ROUNDED, cavityMat);
  cavity.receiveShadow = true;
  const abyssMat = new THREE.MeshBasicMaterial({ color: 0x2a1150, transparent: true, opacity: 0.8 });
  const abyss = new THREE.Mesh(G_PLANE, abyssMat);
  abyss.rotation.x = -Math.PI / 2;
  // 坑沿暗金描边
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x23152e, roughness: 0.5, metalness: 0.6 });
  const rim = new THREE.Mesh(shared(new THREE.TorusGeometry(0.5, 0.04, 8, 24)), rimMat);
  rim.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(cavity, abyss, rim);
  return {
    group,
    update(p, time) {
      cavity.position.set(p.pos.x, p.pos.y, p.pos.z);
      cavity.scale.set(p.size.x, p.size.y, p.size.z);
      abyss.position.set(p.pos.x, p.pos.y - p.size.y / 2 + 0.03, p.pos.z);
      abyss.scale.set(p.size.x * 0.82, p.size.z * 0.82, 1);
      abyssMat.opacity = 0.55 + 0.25 * Math.sin(time * 1.6 + p.pos.z);
      rim.position.set(p.pos.x, p.pos.y + p.size.y / 2 - 0.02, p.pos.z);
      rim.scale.set(p.size.x, p.size.z, 1);
    },
    dispose() {
      cavityMat.dispose();
      abyssMat.dispose();
      rimMat.dispose();
    },
  };
}

function buildMarker(): Omit<PropView, 'shape' | 'labelKey'> {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x28e0d0,
    emissive: 0x28e0d0,
    emissiveIntensity: 1,
    roughness: 0.2,
    metalness: 0.3,
  });
  const gem = new THREE.Mesh(G_OCTA, mat);
  gem.castShadow = true;
  const group = new THREE.Group();
  group.add(gem);
  return {
    group,
    update(p, time) {
      gem.position.set(p.pos.x, p.pos.y + 0.1 * Math.sin(time * 2), p.pos.z);
      gem.scale.set(p.size.x, p.size.y, p.size.z);
      gem.rotation.y = time * 1.5;
      mat.color.set(p.color);
      applyEmissive(mat, p);
    },
    dispose() {
      mat.dispose();
    },
  };
}

function buildForShape(shape: PropShape): Omit<PropView, 'shape' | 'labelKey'> {
  switch (shape) {
    case 'block':
      return buildBlock();
    case 'platform':
      return buildPlatform();
    case 'door':
      return buildDoor();
    case 'pillar':
      return buildPillar();
    case 'hole':
      return buildHole();
    case 'marker':
      return buildMarker();
    default:
      return buildBlock();
  }
}

// ============================= 渲染器主体 =============================

export class SceneRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private props = new Map<string, PropView>();
  private playerGroup: THREE.Group;
  private playerCoreMat: THREE.MeshStandardMaterial;
  private playerShellMat: THREE.MeshStandardMaterial;
  private playerHalo: THREE.Sprite;
  private playerLight: THREE.PointLight;
  private ambient: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private floor: THREE.Mesh;
  private grid: THREE.GridHelper | null = null;
  private gridKey = '';
  private currentYaw = 0;
  private yawInit = false;
  private labelCache = new Map<string, THREE.Texture>();
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x0b0410, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0410);
    this.scene.fog = new THREE.Fog(0x0a0410, 16, 46);

    // PBR 环境反射：用程序化 RoomEnvironment 生成 envMap（无需外部贴图）
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambient);
    const hemi = new THREE.HemisphereLight(0xff6ab0, 0x24406b, 0.45);
    this.scene.add(hemi);
    this.keyLight = new THREE.DirectionalLight(0xfff0f8, 1.3);
    this.keyLight.position.set(7, 14, 9);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.0006;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 60;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);
    // 冷色补光，拉开葬爱霓虹氛围
    const rim = new THREE.DirectionalLight(0x4aa8ff, 0.5);
    rim.position.set(-8, 6, -6);
    this.scene.add(rim);

    this.floor = this.buildFloor();
    this.scene.add(this.floor);

    this.playerGroup = new THREE.Group();
    this.playerCoreMat = new THREE.MeshStandardMaterial({
      color: 0x7cffb0,
      emissive: 0x7cffb0,
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.2,
    });
    this.playerShellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      envMapIntensity: 1.4,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(G_ICO_CORE, this.playerCoreMat);
    core.castShadow = true;
    const shell = new THREE.Mesh(G_ICO_SHELL, this.playerShellMat);
    this.playerHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture(),
        color: 0x7cffb0,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.playerHalo.scale.set(1.6, 1.6, 1);
    this.playerGroup.add(core, shell, this.playerHalo);
    this.playerGroup.userData.core = core;
    this.playerGroup.userData.shell = shell;
    this.scene.add(this.playerGroup);
    this.playerLight = new THREE.PointLight(0x7cffb0, 1.3, 7, 2);
    this.scene.add(this.playerLight);

    // 后期：bloom 让霓虹发光真正"亮起来"
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildFloor(): THREE.Mesh {
    const tex = floorTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x160b22,
      roughness: 0.55,
      metalness: 0.35,
      envMapIntensity: 0.8,
      map: tex,
    });
    const mesh = new THREE.Mesh(G_PLANE, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  resize(): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  draw(d: DisplayState): void {
    const time = this.clock.getElapsedTime();
    this.syncFloor(d);
    this.syncProps(d, time);
    this.syncPlayer(d, time);
    this.ambient.intensity = 0.25 + 0.3 * d.ambient;
    this.updateCamera(d);
    this.composer.render();
  }

  private syncFloor(d: DisplayState): void {
    const cx = d.grid.w / 2 - 0.5;
    const cz = d.grid.h / 2 - 0.5;
    const span = Math.max(d.grid.w, d.grid.h);
    this.floor.position.set(cx, -0.02, cz);
    this.floor.scale.set(d.grid.w + 8, d.grid.h + 8, 1);
    const key = `${d.grid.w}x${d.grid.h}`;
    if (this.gridKey !== key) {
      this.gridKey = key;
      if (this.grid) {
        this.scene.remove(this.grid);
        this.grid.geometry.dispose();
        (this.grid.material as THREE.Material).dispose();
      }
      const n = Math.max(d.grid.w, d.grid.h);
      this.grid = new THREE.GridHelper(n, n, 0x6a3f8f, 0x2a1740);
      (this.grid.material as THREE.Material).transparent = true;
      (this.grid.material as THREE.Material).opacity = 0.35;
      this.scene.add(this.grid);
      // 阴影相机随网格范围
      const s = span * 0.8 + 3;
      const cam = this.keyLight.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.updateProjectionMatrix();
    }
    this.grid?.position.set(cx, 0.015, cz);
    this.keyLight.target.position.set(cx, 0, cz);
    this.keyLight.position.set(cx + 7, 14, cz + 9);
  }

  private syncProps(d: DisplayState, time: number): void {
    const seen = new Set<string>();
    for (const p of d.props) {
      seen.add(p.id);
      let view = this.props.get(p.id);
      if (view && view.shape !== p.shape) {
        // shape 变了（深坑↔伪装平台）：整件重建
        this.removeProp(p.id, view);
        view = undefined;
      }
      if (!view) {
        const built = buildForShape(p.shape);
        view = { shape: p.shape, labelKey: '', ...built };
        this.scene.add(view.group);
        this.props.set(p.id, view);
      }
      view.group.visible = p.visible;
      view.update(p, time);
      this.syncLabel(view, p);
    }
    for (const [id, view] of this.props) {
      if (!seen.has(id)) this.removeProp(id, view);
    }
  }

  private removeProp(id: string, view: PropView): void {
    this.scene.remove(view.group);
    disposeGroup(view.group);
    view.dispose();
    if (view.label) {
      this.scene.remove(view.label);
      view.label.material.dispose();
    }
    this.props.delete(id);
  }

  private syncLabel(view: PropView, p: RenderProp): void {
    const key = `${p.label}|${p.labelColor}`;
    if (p.label) {
      if (!view.label) {
        view.label = this.makeSprite(p.label, p.labelColor);
        this.scene.add(view.label);
        view.labelKey = key;
      } else if (view.labelKey !== key) {
        view.label.material.map = this.labelTexture(p.label, p.labelColor);
        view.label.material.needsUpdate = true;
        view.labelKey = key;
      }
      view.label.visible = p.visible;
      view.label.position.set(p.pos.x, p.pos.y + p.size.y / 2 + 0.45, p.pos.z);
    } else if (view.label) {
      view.label.visible = false;
    }
  }

  private syncPlayer(d: DisplayState, time: number): void {
    const shake = d.player.shake;
    const jx = shake > 0 ? Math.sin(shake * 12.9) * 0.06 : 0;
    const jz = shake > 0 ? Math.cos(shake * 7.7) * 0.06 : 0;
    const bob = 0.06 * Math.sin(time * 2.4);
    this.playerGroup.position.set(d.player.pos.x + jx, d.player.pos.y + 0.12 + bob, d.player.pos.z + jz);
    const core = this.playerGroup.userData.core as THREE.Mesh;
    const shell = this.playerGroup.userData.shell as THREE.Mesh;
    core.rotation.y = time * 1.1;
    core.rotation.x = time * 0.5;
    shell.rotation.y = -time * 0.6;
    this.playerCoreMat.color.set(d.player.color);
    this.playerCoreMat.emissive.set(d.player.color);
    (this.playerHalo.material as THREE.SpriteMaterial).color.set(d.player.color);
    this.playerLight.position.set(d.player.pos.x, d.player.pos.y + 0.7, d.player.pos.z);
    this.playerLight.color.set(d.player.color);
  }

  private updateCamera(d: DisplayState): void {
    const c = d.camera;
    if (!this.yawInit) {
      this.currentYaw = c.yaw;
      this.yawInit = true;
    }
    this.currentYaw += (c.yaw - this.currentYaw) * 0.18;
    const tx = d.grid.w / 2 - 0.5;
    const tz = d.grid.h / 2 - 0.5;
    const ty = c.targetHeight;
    const horiz = c.distance * Math.cos(c.pitch);
    const camX = tx + horiz * Math.sin(this.currentYaw);
    const camZ = tz + horiz * Math.cos(this.currentYaw);
    const camY = ty + c.distance * Math.sin(c.pitch);
    const sh = d.player.shake > 0 ? d.player.shake * 0.01 : 0;
    this.camera.position.set(camX + Math.sin(sh * 40) * sh, camY, camZ + Math.cos(sh * 37) * sh);
    this.camera.lookAt(tx, ty, tz);
  }

  // —— 文字 billboard（canvas 贴图）——
  private makeSprite(text: string, color: string): THREE.Sprite {
    const tex = this.labelTexture(text, color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.1, 0.55, 1);
    return sprite;
  }

  private labelTexture(text: string, color: string): THREE.Texture {
    const key = `${text}|${color}`;
    const cached = this.labelCache.get(key);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 72px "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.labelCache.set(key, tex);
    return tex;
  }
}

// 玩家光晕贴图（径向渐变）
function haloTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(160,255,210,0.5)');
  g.addColorStop(1, 'rgba(160,255,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// 地面贴图：细网点 + 轻微噪声 + 中心暗角，脱离"纯色大板"
function floorTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#140a20';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(120,70,160,0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 60},${20 + Math.random() * 40},${60 + Math.random() * 70},${Math.random() * 0.18})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}
