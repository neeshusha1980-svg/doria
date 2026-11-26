import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box, Trees, Gem, Layers, RotateCcw, Trash2, Mountain, Lamp, DoorOpen, Flower2, Cloud, Flag, Save, Hammer, type LucideIcon } from 'lucide-react';
import './BaseplateEditor.css';

type ItemKind = 'block' | 'tree' | 'crystal' | 'platform' | 'rock' | 'lamp' | 'door' | 'flower' | 'cloud' | 'flag';
type SceneItem = { kind: ItemKind; x: number; z: number; color: string };
const tools: { kind: ItemKind; label: string; icon: LucideIcon; color: string }[] = [
  { kind: 'block', label: 'Block', icon: Box, color: '#9b7bff' },
  { kind: 'tree', label: 'Tree', icon: Trees, color: '#55c99a' },
  { kind: 'crystal', label: 'Crystal', icon: Gem, color: '#6ee7ef' },
  { kind: 'platform', label: 'Platform', icon: Layers, color: '#ffb56b' },
  { kind: 'rock', label: 'Rock', icon: Mountain, color: '#9294a8' },
  { kind: 'lamp', label: 'Lamp', icon: Lamp, color: '#ffe37b' },
  { kind: 'door', label: 'Door', icon: DoorOpen, color: '#b87950' },
  { kind: 'flower', label: 'Flower', icon: Flower2, color: '#ff8fc7' },
  { kind: 'cloud', label: 'Cloud', icon: Cloud, color: '#a8d8ff' },
  { kind: 'flag', label: 'Flag', icon: Flag, color: '#ff6b6b' },
];

function makeObject(kind: ItemKind, x: number, z: number, color: string) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62 });
  let mesh: THREE.Mesh;
  if (kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .24, 1.15, 7), new THREE.MeshStandardMaterial({ color: '#76503a' }));
    trunk.position.set(x, .58, z);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(.85, 2.1, 7), material);
    leaves.position.set(x, 2.1, z);
    return [trunk, leaves];
  }
  if (kind === 'crystal') { mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.72), material); mesh.position.set(x, .8, z); }
  else if (kind === 'platform') { mesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, .35, 3.2), material); mesh.position.set(x, .2, z); }
  else if (kind === 'rock') { mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.8, 0), material); mesh.position.set(x, .7, z); mesh.scale.set(1.2, .8, 1); }
  else if (kind === 'lamp') { mesh = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, 2.1, 8), new THREE.MeshStandardMaterial({ color: '#77798c' })); mesh.position.set(x, 1.05, z); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 12), new THREE.MeshStandardMaterial({ color: '#ffe37b', emissive: '#d99a24', emissiveIntensity: .7 })); bulb.position.set(x, 2.15, z); return [mesh, bulb]; }
  else if (kind === 'door') { mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, .25), material); mesh.position.set(x, 1.2, z); }
  else if (kind === 'flower') { mesh = new THREE.Mesh(new THREE.SphereGeometry(.48, 10, 10), material); mesh.position.set(x, .9, z); }
  else if (kind === 'cloud') { mesh = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 12), material); mesh.position.set(x, 3.4, z); mesh.scale.set(1.5, .65, .8); }
  else if (kind === 'flag') { mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, .75, .08), material); mesh.position.set(x + .45, 1.9, z); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#d5d5df' })); pole.position.set(x, 1.1, z); return [mesh, pole]; }
  else { mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), material); mesh.position.set(x, .7, z); }
  return [mesh];
}

export default function BaseplateEditor({ onPublish }: { onPublish: (data: { name: string; genre: string; description: string; sceneData: SceneItem[] }) => Promise<void> }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rayRef = useRef(new THREE.Raycaster());
  const groundRef = useRef<THREE.Mesh | null>(null);
  const objectsRef = useRef<THREE.Object3D[]>([]);
  const [selected, setSelected] = useState<ItemKind>('block');
  const [items, setItems] = useState<SceneItem[]>([]);
  const [notice, setNotice] = useState('Choose a Toolbox item, then drag it onto your world.');
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('Adventure');
  const [description, setDescription] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#151324');
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 200);
    camera.position.set(11, 11, 13);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { el.innerHTML = '<p>WebGL is required for Doria Studio 3D building.</p>'; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(el.clientWidth || 700, el.clientHeight || 440);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#e6e4ff', '#2a2840', 2));
    const sun = new THREE.DirectionalLight('#fff0d2', 2.6);
    sun.position.set(7, 12, 5);
    sun.castShadow = true;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: '#28263b', roughness: .9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    groundRef.current = ground;
    scene.add(ground);
    const grid = new THREE.GridHelper(24, 24, '#8c78e8', '#46415e');
    grid.position.y = .015;
    scene.add(grid);
    const base = new THREE.Mesh(new THREE.BoxGeometry(24, .22, 24), new THREE.MeshStandardMaterial({ color: '#34314a' }));
    base.position.y = -.13;
    scene.add(base);
    let frame = 0, disposed = false;
    const animate = () => { if (disposed) return; renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
    animate();
    const resize = () => { if (!el.clientWidth) return; camera.aspect = el.clientWidth / (el.clientHeight || 440); camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight || 440); };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const place = (clientX: number, clientY: number, kind: ItemKind) => {
    const el = host.current, scene = sceneRef.current, camera = cameraRef.current, ground = groundRef.current;
    if (!el || !scene || !camera || !ground) return;
    const rect = el.getBoundingClientRect();
    const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    rayRef.current.setFromCamera(mouse, camera);
    const hit = rayRef.current.intersectObject(ground)[0];
    if (!hit) { setNotice('Drop the item onto the baseplate surface.'); return; }
    const x = Math.max(-11, Math.min(11, Math.round(hit.point.x)));
    const z = Math.max(-11, Math.min(11, Math.round(hit.point.z)));
    const color = tools.find(tool => tool.kind === kind)?.color || '#9b7bff';
    const created = makeObject(kind, x, z, color);
    created.forEach(mesh => { mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.doriaTool = true; scene.add(mesh); objectsRef.current.push(mesh); });
    setItems(current => [...current, { kind, x, z, color }]);
    setNotice(tools.find(tool => tool.kind === kind)?.label + ' added at ' + x + ', ' + z + '.');
  };
  const clear = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    objectsRef.current.forEach(object => { scene.remove(object); if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
    objectsRef.current = [];
    setItems([]);
    setNotice('Scene cleared. Add objects to start again.');
  };
  const publish = async () => {
    if (name.trim().length < 3) { setNotice('Add a game name with at least 3 characters.'); return; }
    if (!items.length) { setNotice('Place at least one item before publishing your world.'); return; }
    setPublishing(true);
    try { await onPublish({ name: name.trim(), genre, description: description.trim(), sceneData: items }); setNotice('Your world was published and is now available in Discover.'); }
    catch { setNotice('Could not publish. Check your connection and try again.'); }
    finally { setPublishing(false); }
  };

  return <section className="baseplate-editor panel">
    <div className="baseplate-top"><div><span className="eyebrow">DORIA STUDIO · 3D EDITOR</span><h2>World Builder</h2><p>Arrange objects on the baseplate and publish your world when it is ready.</p></div><button className="button-soft" onClick={clear}><Trash2 size={15}/> Clear scene</button></div>
    <div className="baseplate-workspace">
      <aside className="toolbox"><b>Toolbox</b><small>Drag an object onto the baseplate</small>
        {tools.map(item => <button draggable key={item.kind} className={selected === item.kind ? 'toolbox-item selected' : 'toolbox-item'} onClick={() => { setSelected(item.kind); setNotice('Selected ' + item.label + '. Drag its tile onto the world.'); }} onDragStart={event => { event.dataTransfer.setData('application/x-doria-tool', item.kind); setSelected(item.kind); }}><item.icon size={18}/><span>{item.label}</span><i style={{ background: item.color }}/></button>)}
        <div className="toolbox-count"><b>{items.length}</b><small>objects in world</small></div>
      </aside>
      <div ref={host} className="baseplate-canvas" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const kind = (event.dataTransfer.getData('application/x-doria-tool') || selected) as ItemKind; place(event.clientX, event.clientY, tools.some(tool => tool.kind === kind) ? kind : selected); }} onPointerDown={event => { if (event.pointerType === 'touch') place(event.clientX, event.clientY, selected); }}/>
      <div className="baseplate-controls"><span>{notice}</span><button className="button-soft" onClick={() => { const camera = cameraRef.current; if (camera) { camera.position.set(11, 11, 13); camera.lookAt(0, 0, 0); } }}><RotateCcw size={14}/> Reset view</button></div>
    </div>
    <div className="baseplate-publish">
      <h3><Hammer size={17}/> Publish your world</h3>
      <div className="baseplate-publish-grid">
        <label>Game name<input value={name} onChange={event => setName(event.target.value)} minLength={3} maxLength={42} placeholder="My first Doria world"/></label>
        <label>Genre<select value={genre} onChange={event => setGenre(event.target.value)}>{['Adventure','Obby','Roleplay','Simulator','Racing','Puzzle','Social'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="baseplate-description">Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={180} placeholder="What can players do in your world?"/></label>
      </div>
      <button className="button-primary" disabled={publishing} onClick={() => void publish()}><Save size={16}/>{publishing ? 'Publishing…' : 'Save & publish world'}</button>
      <p className="fine-print">Published worlds appear in Discover immediately. Your placed objects are saved with the listing.</p>
    </div>
  </section>;
}