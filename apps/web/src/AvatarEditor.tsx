import { useEffect, useRef, useState } from 'react';
import { api } from './lib/api';
import { RotateCcw, Save, Sparkles } from 'lucide-react';
import './AvatarEditor.css';
import {
  createDoriaBlock,
  createDoriaVoxelApp,
  createDoriaVoxelAvatar,
  type DoriaAvatarLook,
} from './DoriaVoxelEngine';

type AvatarLook = {
  body: string;
  accent: string;
  style: string;
  ugcId?: string;
  ugcModelData?: unknown;
};

const defaults: AvatarLook = {
  body: '#9b7bff',
  accent: '#7cebe5',
  style: 'classic',
};

const bodyColors = ['#9b7bff', '#ff7db7', '#55d6be', '#f4c000', '#69a8ff', '#f0f0f7'];
const accentColors = ['#7cebe5', '#ffe37b', '#ff8ed5', '#a6f2a6', '#ffffff'];
const presetStyles = new Set(['classic', 'halo', 'crown']);

function readLocalLook(): AvatarLook {
  try {
    const stored = JSON.parse(localStorage.getItem('doria-avatar-look') || '{}');
    return {
      ...defaults,
      ...stored,
    };
  } catch {
    return defaults;
  }
}

export default function AvatarEditor() {
  const mount = useRef<HTMLDivElement>(null);
  const lookRef = useRef<AvatarLook>(defaults);
  const userEdited = useRef(false);
  const [look, setLook] = useState<AvatarLook>(readLocalLook);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  lookRef.current = look;

  useEffect(() => {
    let active = true;

    api.get('/api/avatar-look').then(result => {
      if (!active || userEdited.current) return;

      const remote = result.data?.avatarLook;
      if (!remote || !bodyColors.includes(remote.body) || !accentColors.includes(remote.accent)) return;

      const local = readLocalLook();
      const next: AvatarLook = {
        body: remote.body,
        accent: local.style === 'model' ? local.accent : remote.accent,
        style: local.style === 'model' ? 'model' : presetStyles.has(remote.style) ? remote.style : 'classic',
        ...(local.style === 'model' ? { ugcId: local.ugcId, ugcModelData: local.ugcModelData } : {}),
      };

      setLook(next);
      try {
        localStorage.setItem('doria-avatar-look', JSON.stringify(next));
      } catch {
        setMessage('Your browser could not cache the avatar preview.');
      }
    }).catch(() => {
      // Guests can still preview an avatar locally; account sync requires sign-in.
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    let disposed = false;
    let scene: Awaited<ReturnType<typeof createDoriaVoxelApp>> | undefined;
    let avatar: ReturnType<typeof createDoriaVoxelAvatar> | undefined;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Rotating Doria voxel avatar preview');
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y';
    host.replaceChildren(canvas);

    const start = async () => {
      try {
        scene = await createDoriaVoxelApp(canvas, '#17152b');
        if (disposed) {
          scene.dispose();
          return;
        }

        createDoriaBlock(scene.app, 'preview-platform', '#343052', [0, -0.12, 0], [4.2, 0.24, 4.2]);
        createDoriaBlock(scene.app, 'platform-edge', '#7d69bd', [0, -0.25, 0], [4.4, 0.08, 4.4], true);
        avatar = createDoriaVoxelAvatar(scene.app, lookRef.current as DoriaAvatarLook, 1.12);
        scene.camera.setPosition(3.8, 2.8, 5.5);
        scene.camera.lookAt(0, 1.1, 0);

        scene.app.on('update', (dt: number) => {
          if (avatar) avatar.root.rotate(0, dt * 22, 0);
        });
      } catch {
        if (!disposed) {
          host.innerHTML = '<p class="three-fallback">3D preview could not start. Please try a browser with WebGL 2 support.</p>';
        }
      }
    };

    void start();
    return () => {
      disposed = true;
      scene?.dispose();
      host.replaceChildren();
    };
  }, [look.body, look.accent, look.style, look.ugcId]);

  const update = (patch: Partial<AvatarLook>) => {
    userEdited.current = true;
    setMessage('');
    setLook(current => ({ ...current, ...patch }));
  };

  const saveAvatar = async (nextLook: AvatarLook = look) => {
    setSaving(true);
    setMessage('');

    const serverLook = {
      body: nextLook.body,
      accent: nextLook.accent,
      style: presetStyles.has(nextLook.style) ? nextLook.style : 'classic',
    };

    try {
      await api.put('/api/avatar-look', serverLook);
      localStorage.setItem('doria-avatar-look', JSON.stringify(nextLook));
      window.dispatchEvent(new Event('doria-avatar-updated'));
      setMessage('Avatar saved to your Doria account.');
    } catch {
      try {
        localStorage.setItem('doria-avatar-look', JSON.stringify(nextLook));
        window.dispatchEvent(new Event('doria-avatar-updated'));
        setMessage('Saved on this device only. Doria account sync was unavailable.');
      } catch {
        setMessage('Avatar could not be saved. Check browser storage and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const resetAvatar = () => {
    userEdited.current = true;
    setLook(defaults);
    void saveAvatar(defaults);
  };

  return (
    <section className="avatar-editor">
      <div className="avatar-preview-head">
        <div>
          <span className="eyebrow"><Sparkles size={13} /> 3D AVATAR LAB</span>
          <h2>Your look, your world.</h2>
          <p>Your block avatar is shared with Doria's voxel games.</p>
        </div>
        <button className="button-soft" type="button" onClick={resetAvatar} disabled={saving}>
          <RotateCcw size={15} /> Reset
        </button>
      </div>

      <div className="avatar-editor-grid">
        <div className="avatar-canvas" ref={mount} />
        <div className="avatar-controls">
          <label>
            Body colour
            <div className="color-options">
              {bodyColors.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={'Body colour ' + color}
                  className={look.body === color ? 'color-swatch selected' : 'color-swatch'}
                  style={{ background: color }}
                  onClick={() => update({ body: color })}
                />
              ))}
            </div>
          </label>

          <label>
            Glow colour
            <div className="color-options">
              {accentColors.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={'Glow colour ' + color}
                  className={look.accent === color ? 'color-swatch selected' : 'color-swatch'}
                  style={{ background: color }}
                  onClick={() => update({ accent: color })}
                />
              ))}
            </div>
          </label>

          <label>
            Accessory
            <select value={presetStyles.has(look.style) ? look.style : 'classic'} onChange={event => update({ style: event.target.value })}>
              <option value="classic">Classic</option>
              <option value="halo">Orbit halo</option>
              <option value="crown">Creator crown</option>
            </select>
          </label>

          <button className="button-primary full-button" type="button" onClick={() => void saveAvatar()} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save avatar'}
          </button>
          <small role="status" aria-live="polite">
            {message || 'Your saved appearance syncs to your Doria account when signed in.'}
          </small>
        </div>
      </div>
    </section>
  );
}
