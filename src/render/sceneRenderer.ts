import * as THREE from 'three';
import type { DisplayState, RenderProp } from '../engine/displayLayer';

// 渲染层：只消费 DisplayState（PRD §15.6）。碰不到 RealState/Game（eslint 拦截）。
// 3D 呈现：Three.js 把 DisplayState 里的"道具 + 相机 + 灯光"摆成一个小型 3D 解谜场景。
// 它完全不知道谁真谁假——真假早在 DisplayLayer 被谎言决定好了，这里照单全收。

interface PropView {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  label?: THREE.Sprite;
  labelKey: string;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export class SceneRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private props = new Map<string, PropView>();
  private player: THREE.Mesh;
  private playerMat: THREE.MeshStandardMaterial;
  private playerLight: THREE.PointLight;
  private ambient: THREE.AmbientLight;
  private floor: THREE.Mesh;
  private gridHelper: THREE.GridHelper | null = null;
  private currentYaw = 0;
  private yawInit = false;
  private labelCache = new Map<string, THREE.Texture>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x0b0410, 0);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b0410, 14, 40);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

    // 灯光：葬爱霓虹的半球光（粉顶 / 青底）+ 一盏主方向光，保留纵深与体积感。
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);
    const hemi = new THREE.HemisphereLight(0xff6ab0, 0x28406b, 0.6);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(6, 12, 8);
    this.scene.add(dir);

    // 地面：深紫面板 + 霓虹网格线，强调这是个 3D 空间而非平面贴图。
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x160921,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.floor = new THREE.Mesh(UNIT_BOX, floorMat);
    this.scene.add(this.floor);

    // 玩家：发光的小球，颜色=真实血量的诚实通道。
    this.playerMat = new THREE.MeshStandardMaterial({
      color: 0x7cffb0,
      emissive: 0x7cffb0,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    });
    this.player = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), this.playerMat);
    this.scene.add(this.player);
    this.playerLight = new THREE.PointLight(0x7cffb0, 1.1, 6);
    this.scene.add(this.playerLight);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  draw(d: DisplayState): void {
    this.syncFloor(d);
    this.syncProps(d);
    this.syncPlayer(d);
    this.ambient.intensity = d.ambient;
    this.updateCamera(d);
    this.renderer.render(this.scene, this.camera);
  }

  private syncFloor(d: DisplayState): void {
    const cx = d.grid.w / 2 - 0.5;
    const cz = d.grid.h / 2 - 0.5;
    this.floor.scale.set(d.grid.w + 0.6, 0.4, d.grid.h + 0.6);
    this.floor.position.set(cx, -0.22, cz);
    if (!this.gridHelper) {
      const size = Math.max(d.grid.w, d.grid.h) + 1;
      this.gridHelper = new THREE.GridHelper(size, size, 0x4a2f6b, 0x2a1740);
      this.scene.add(this.gridHelper);
    }
    this.gridHelper.position.set(cx, 0.001, cz);
  }

  private syncProps(d: DisplayState): void {
    const seen = new Set<string>();
    for (const p of d.props) {
      seen.add(p.id);
      let view = this.props.get(p.id);
      if (!view) {
        const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15 });
        const mesh = new THREE.Mesh(UNIT_BOX, material);
        this.scene.add(mesh);
        view = { mesh, material, labelKey: '' };
        this.props.set(p.id, view);
      }
      this.applyProp(view, p);
    }
    // 关卡切换：清掉不再出现的道具
    for (const [id, view] of this.props) {
      if (!seen.has(id)) {
        this.disposeProp(view);
        this.props.delete(id);
      }
    }
  }

  private applyProp(view: PropView, p: RenderProp): void {
    view.mesh.visible = p.visible;
    view.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    view.mesh.scale.set(p.size.x, p.size.y, p.size.z);
    const m = view.material;
    m.color.set(p.color);
    if (p.emissive === 'transparent' || p.emissiveIntensity <= 0) {
      m.emissive.set(0x000000);
      m.emissiveIntensity = 0;
    } else {
      m.emissive.set(p.emissive);
      m.emissiveIntensity = p.emissiveIntensity;
    }
    m.transparent = p.opacity < 1;
    m.opacity = p.opacity;

    // 标签（道具上方的漂浮字），billboard 永远朝向相机
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
      view.label.position.set(p.pos.x, p.pos.y + p.size.y / 2 + 0.4, p.pos.z);
    } else if (view.label) {
      view.label.visible = false;
    }
  }

  private syncPlayer(d: DisplayState): void {
    const shake = d.player.shake;
    const jx = shake > 0 ? (Math.sin(shake * 12.9) * 0.5) * 0.12 : 0;
    const jz = shake > 0 ? (Math.cos(shake * 7.7) * 0.5) * 0.12 : 0;
    this.player.position.set(d.player.pos.x + jx, d.player.pos.y, d.player.pos.z + jz);
    this.playerMat.color.set(d.player.color);
    this.playerMat.emissive.set(d.player.color);
    this.playerLight.position.set(d.player.pos.x, d.player.pos.y + 0.6, d.player.pos.z);
    this.playerLight.color.set(d.player.color);
  }

  private updateCamera(d: DisplayState): void {
    const c = d.camera;
    if (!this.yawInit) {
      this.currentYaw = c.yaw;
      this.yawInit = true;
    }
    // 平滑插值到目标偏航，让 Q/E 转镜头顺滑
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
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
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
    tex.anisotropy = 4;
    this.labelCache.set(key, tex);
    return tex;
  }

  private disposeProp(view: PropView): void {
    this.scene.remove(view.mesh);
    view.material.dispose();
    if (view.label) {
      this.scene.remove(view.label);
      view.label.material.dispose();
    }
  }
}
