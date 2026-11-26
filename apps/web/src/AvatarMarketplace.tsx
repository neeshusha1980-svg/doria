import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from './lib/api';
import { Box, Circle, Cone, Cylinder, Gem, RotateCcw, Save, Trash2, ShoppingBag, Coins, Check, Plus, Layers3, type LucideIcon } from 'lucide-react';
import { getApiErrorMessage } from './apiErrors';

type Shape = 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus' | 'octahedron';
type Part = { shape: Shape; x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; ry: number };
type Item = { id: string; name: string; description: string; price: number; creatorName: string; ownerId: string; modelData: Part[] };

const shapeOptions: { id: Shape; label: string; icon: LucideIcon }[] = [
  { id: 'box', label: 'Cube', icon: Box },
  { id: 'sphere', label: 'Sphere', icon: Circle },
  { id: 'cone', label: 'Cone', icon: Cone },
  { id: 'cylinder', label: 'Cylinder', icon: Cylinder },
  { id: 'torus', label: 'Ring', icon: Circle },
  { id: 'octahedron', label: 'Gem', icon: Gem },
];

function geometryFor(shape: Shape): THREE.BufferGeometry {
  if (shape === 'sphere') return new THREE.SphereGeometry(0.5, 24, 16);
  if (shape === 'cone') return new THREE.ConeGeometry(0.5, 1, 20);
  if (shape === 'cylinder') return new THREE.CylinderGeometry(0.45, 0.45, 1, 24);
  if (shape === 'torus') return new THREE.TorusGeometry(0.42, 0.14, 12, 32);
  if (shape === 'octahedron') return new THREE.OctahedronGeometry(0.62, 0);
  return new THREE.BoxGeometry(1, 1, 1);
}

function ModelPreview({ parts }: { parts: Part[] }) {
  const host = useRef<HTMLDivElement>(null);
  const serialized = JSON.stringify(parts);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171526');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(4.5, 3.6, 5.4);
    camera.lookAt(0, 0.35, 0);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { el.textContent = '3D preview needs WebGL'; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(el.clientWidth || 320, el.clientHeight || 250);
    el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#ffffff', '#38324f', 2.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(4, 8, 5);
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48), new THREE.MeshStandardMaterial({ color: '#28263a', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.1;
    scene.add(floor);
    const group = new THREE.Group();
    scene.add(group);
    (JSON.parse(serialized) as Part[]).forEach(part => {
      const mesh = new THREE.Mesh(geometryFor(part.shape), new THREE.MeshStandardMaterial({ color: part.color, metalness: 0.18, roughness: 0.38 }));
      mesh.position.set(part.x, part.y, part.z);
      mesh.scale.set(part.sx, part.sy, part.sz);
      mesh.rotation.y = part.ry;
      mesh.castShadow = true;
      group.add(mesh);
    });
    let frame = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      group.rotation.y += 0.004;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    const observer = new ResizeObserver(() => {
      if (!el.clientWidth) return;
      camera.aspect = el.clientWidth / (el.clientHeight || 250);
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight || 250);
    });
    observer.observe(el);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [serialized]);
  return <div ref={host} className="ugc-model-preview" aria-label="Interactive 3D model preview" />;
}

export default function AvatarMarketplace() {
  const [items, setItems] = useState<Item[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(50);
  const [shape, setShape] = useState<Shape>('box');
  const [color, setColor] = useState('#9b7bff');
  const [parts, setParts] = useState<Part[]>([
    { shape: 'box', x: 0, y: 0, z: 0, sx: 1.1, sy: 1.1, sz: 1.1, color: '#9b7bff', ry: 0 },
    { shape: 'sphere', x: 0.15, y: 0.75, z: 0, sx: 0.55, sy: 0.55, sz: 0.55, color: '#7cebe5', ry: 0 },
  ]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    const result = await api.get('/api/ugc');
    setItems(Array.isArray(result.data?.items) ? result.data.items : []);
    setOwned(Array.isArray(result.data?.owned) ? result.data.owned : []);
  };
  useEffect(() => { void load().catch(() => setMessage('Sign in to use the UGC marketplace.')); }, []);
  const addPart = () => {
    if (parts.length >= 24) { setMessage('A model can contain up to 24 parts.'); return; }
    setParts(current => [...current, { shape, x: (current.length % 3 - 1) * 0.55, y: 0.25 + Math.floor(current.length / 3) * 0.25, z: 0, sx: 0.7, sy: 0.7, sz: 0.7, color, ry: 0 }]);
  };
  const updatePart = (index: number, patch: Partial<Part>) => setParts(current => current.map((part, i) => i === index ? { ...part, ...patch } : part));
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 3) { setMessage('Give your item a name of at least 3 characters.'); return; }
    setBusy('create'); setMessage('');
    try {
      await api.post('/api/ugc', { name: name.trim(), description, assetType: 'model', color: parts[0]?.color || color, price, modelData: parts });
      setName(''); setDescription(''); setMessage('Your 3D item is now in the creator marketplace.');
      await load();
    } catch (error: unknown) { setMessage(getApiErrorMessage(error, 'Could not publish your 3D item.')); }
    finally { setBusy(''); }
  };
  const buy = async (item: Item) => {
    setBusy(item.id); setMessage('');
    try {
      const result = await api.post('/api/ugc/' + encodeURIComponent(item.id) + '/purchase', {});
      setOwned(current => current.includes(item.id) ? current : [...current, item.id]);
      window.dispatchEvent(new CustomEvent('doria-ugc-owned', { detail: result.data?.item }));
      setMessage('3D item added to your inventory.');
    } catch (error: unknown) { setMessage(getApiErrorMessage(error, 'Purchase failed.')); }
    finally { setBusy(''); }
  };
  const equip = async (item: Item) => {
    setBusy(item.id);
    try {
      await api.post('/api/ugc/' + encodeURIComponent(item.id) + '/equip', {});
      const look = (() => { try { return JSON.parse(localStorage.getItem('doria-avatar-look') || '{}'); } catch { return {}; } })();
      localStorage.setItem('doria-avatar-look', JSON.stringify({ ...look, style: 'model', accent: item.color, ugcId: item.id, ugcModelData: item.modelData }));
      window.dispatchEvent(new Event('doria-avatar-updated'));
      setMessage('Your 3D item is equipped on your avatar profile.');
    } catch (error: unknown) { setMessage(getApiErrorMessage(error, 'Could not equip this item.')); }
    finally { setBusy(''); }
  };
  return <section className="panel ugc-marketplace">
    <div className="page-intro"><span className="eyebrow"><Layers3 size={13}/> 3D CREATOR MARKETPLACE</span><h2>Build your own UGC</h2><p>Model an original wearable from 3D parts, rotate the live preview, then publish it for other Doria players.</p></div>
    <form className="ugc-create-form ugc-model-builder" onSubmit={create}>
      <div className="ugc-builder-heading"><div><h3><Plus size={17}/> 3D Item Workshop</h3><p className="panel-sub">Add and colour parts to create your own model. No preset-only catalogue.</p></div><span className="ugc-part-count">{parts.length}/24 parts</span></div>
      <div className="ugc-builder-layout">
        <div className="ugc-builder-controls">
          <label>Item name<input required minLength={3} maxLength={36} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Solar Crown"/></label>
          <label>Description<input maxLength={120} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe what your item does or looks like"/></label>
          <label>Part shape<select value={shape} onChange={event => setShape(event.target.value as Shape)}>{shapeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label>Part colour<input type="color" value={color} onChange={event => setColor(event.target.value)}/></label>
          <div className="ugc-shape-palette">{shapeOptions.map(option => <button type="button" key={option.id} className={shape === option.id ? 'selected' : ''} onClick={() => setShape(option.id)} title={option.label}><option.icon size={18}/><small>{option.label}</small></button>)}</div>
          <button type="button" className="button-soft" onClick={addPart} disabled={parts.length >= 24}><Plus size={15}/> Add 3D part</button>
          <label>Price in Starlits<input type="number" min={0} max={5000} step={5} value={price} onChange={event => setPrice(Number(event.target.value))}/></label>
          <button type="button" className="button-soft" onClick={() => setParts([{ shape: 'box', x: 0, y: 0, z: 0, sx: 1.1, sy: 1.1, sz: 1.1, color: '#9b7bff', ry: 0 }])}><RotateCcw size={14}/> Reset model</button>
        </div>
        <div className="ugc-builder-preview"><ModelPreview parts={parts}/><div className="ugc-preview-caption"><span>LIVE 3D PREVIEW</span><small>Rotating 3D preview · {parts.length} mesh parts</small></div></div>
      </div>
      <div className="ugc-parts-list"><div className="section-head"><div><h3>Model parts</h3><p>Adjust scale and remove individual pieces.</p></div></div>{parts.map((part, index) => <div className="ugc-part-row" key={index}><b>{index + 1}. {part.shape}</b><label>Scale <input type="range" min="0.25" max="2.5" step="0.05" value={part.sx} onChange={event => updatePart(index, { sx: Number(event.target.value), sy: Number(event.target.value), sz: Number(event.target.value) })}/></label><label>Colour <input type="color" value={part.color} onChange={event => updatePart(index, { color: event.target.value })}/></label><button type="button" className="icon-button" aria-label={'Remove part ' + (index + 1)} onClick={() => setParts(current => current.filter((_, i) => i !== index))} disabled={parts.length === 1}><Trash2 size={15}/></button></div>)}</div>
      <button className="button-primary" disabled={busy === 'create'}><Save size={15}/>{busy === 'create' ? 'Publishing model…' : 'Publish 3D item'}</button>
    </form>
    {message && <p className="panel-sub" role="status">{message}</p>}
    <div className="section-head"><div><h3>Community 3D items</h3><p>Player-created models, stored with their 3D part data.</p></div></div>
    <div className="ugc-grid">{items.map(item => <article className="panel ugc-card" key={item.id}><div className="ugc-model-card-art"><span style={{ background: item.color || '#9b7bff' }}/><small>3D MODEL</small></div><h3>{item.name}</h3><p>{item.description || 'A creator-made 3D wearable'}</p><small>By @{item.creatorName} · {item.modelData?.length || 0} parts</small><div className="ugc-card-bottom"><b><Coins size={14}/>{item.price} Starlits</b>{owned.includes(item.id) ? <button className="button-soft" onClick={() => void equip(item)} disabled={busy === item.id}><Check size={14}/> Equip</button> : <button className="button-primary" onClick={() => void buy(item)} disabled={busy === item.id}>{busy === item.id ? 'Working…' : 'Buy'}</button>}</div></article>)}{items.length === 0 && <div className="empty-state"><ShoppingBag size={28}/><h3>Make the first 3D item</h3><p>Your published model will appear here for the community.</p></div>}</div>
  </section>;
}
