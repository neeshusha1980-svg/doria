import * as pc from 'playcanvas';

export type DoriaAvatarLook = { body?: string; accent?: string; style?: string };
export type DoriaVoxelAvatar = { root: pc.Entity; arms: pc.Entity[]; legs: pc.Entity[] };

export function doriaColor(hex: string): pc.Color {
  const value = hex.replace('#', '');
  return new pc.Color(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255
  );
}

export async function createDoriaVoxelApp(canvas: HTMLCanvasElement, background = '#17152b') {
  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2]
  });
  device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem
  ];
  const app = new pc.AppBase(canvas);
  app.init(options);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.43, 0.42, 0.56);
  const camera = new pc.Entity('doria-camera');
  camera.addComponent('camera', {
    clearColor: doriaColor(background),
    fov: 42,
    nearClip: 0.1,
    farClip: 260
  });
  app.root.addChild(camera);
  const light = new pc.Entity('doria-sun');
  light.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.94, 0.86), intensity: 1.25 });
  light.setEulerAngles(42, 32, 0);
  app.root.addChild(light);
  app.start();
  const resize = () => app.resizeCanvas();
  window.addEventListener('resize', resize);
  return {
    app,
    camera,
    dispose: () => {
      window.removeEventListener('resize', resize);
      app.destroy();
    }
  };
}

export function createDoriaMaterial(color: string, emissive = false): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.diffuse = doriaColor(color);
  if (emissive) {
    material.emissive = doriaColor(color);
    material.emissiveIntensity = 0.45;
  }
  material.shininess = 8;
  material.update();
  return material;
}

export function createDoriaBlock(
  app: pc.AppBase,
  name: string,
  color: string,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  emissive = false
): pc.Entity {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type: 'box', material: createDoriaMaterial(color, emissive) });
  entity.setPosition(position[0], position[1], position[2]);
  entity.setLocalScale(scale[0], scale[1], scale[2]);
  app.root.addChild(entity);
  return entity;
}

export function createDoriaVoxelAvatar(
  app: pc.AppBase,
  look: DoriaAvatarLook = {},
  scale = 1
): DoriaVoxelAvatar {
  const root = new pc.Entity('doria-voxel-avatar');
  app.root.addChild(root);
  const body = createDoriaMaterial(look.body || '#9b7bff');
  const skin = createDoriaMaterial('#f1c6a5');
  const accent = createDoriaMaterial(look.accent || '#7cebe5', true);
  const dark = createDoriaMaterial('#29263d');
  const part = (name: string, material: pc.StandardMaterial, pos: [number, number, number], size: [number, number, number]) => {
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type: 'box', material });
    entity.setLocalPosition(pos[0] * scale, pos[1] * scale, pos[2] * scale);
    entity.setLocalScale(size[0] * scale, size[1] * scale, size[2] * scale);
    root.addChild(entity);
    return entity;
  };
  part('square-torso', body, [0, 1.02, 0], [0.78, 0.84, 0.42]);
  part('square-head', skin, [0, 1.78, 0], [0.68, 0.68, 0.68]);
  // Keep the face readable from the gameplay camera: two dark square eyes and a small smile.
  part('left-eye', dark, [-0.16, 1.9, 0.354], [0.095, 0.11, 0.055]);
  part('right-eye', dark, [0.16, 1.9, 0.354], [0.095, 0.11, 0.055]);
  part('smile', dark, [0, 1.69, 0.356], [0.22, 0.055, 0.055]);
  part('belt', dark, [0, 0.58, 0], [0.8, 0.12, 0.45]);
  const arms: pc.Entity[] = [];
  const legs: pc.Entity[] = [];
  for (const side of [-1, 1]) {
    arms.push(part(side < 0 ? 'left-arm' : 'right-arm', body, [side * 0.54, 1.02, 0], [0.28, 0.78, 0.38]));
    const leg = part(side < 0 ? 'left-leg' : 'right-leg', dark, [side * 0.21, 0.24, 0], [0.31, 0.58, 0.38]);
    legs.push(leg);
    part('block-shoe', accent, [side * 0.21, -0.06, 0.08], [0.34, 0.18, 0.48]);
  }
  if (look.style === 'halo') {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      part('block-halo', accent, [Math.cos(a) * 0.48, 2.24, Math.sin(a) * 0.48], [0.17, 0.12, 0.17]);
    }
  } else if (look.style === 'crown') {
    for (let i = -1; i <= 1; i++) part('crown-block', accent, [i * 0.2, 2.2 + (i === 0 ? 0.12 : 0), 0], [0.18, i === 0 ? 0.34 : 0.2, 0.2]);
  }
  return { root, arms, legs };
}
