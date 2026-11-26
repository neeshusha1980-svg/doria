import { useEffect, useRef, useState } from 'react';
import * as pc from 'playcanvas';
import { ArrowLeft, ArrowRight, ArrowUp, RotateCcw, X, Trophy, Gem, Star, Orbit, Route, Users, LockKeyhole } from 'lucide-react';
import './ThreeGame.css';
import GamePassShop from './GamePassShop';
import GameChat from './GameChat';
import { api } from './lib/api';
import { ws } from './lib/ws';
import { createDoriaBlock, createDoriaVoxelApp, createDoriaVoxelAvatar, createDoriaMaterial, type DoriaVoxelAvatar, type DoriaAvatarLook } from './DoriaVoxelEngine';

function applySandboxCsp(source: string) {
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src \'none\'; form-action \'none\'; object-src \'none\'; base-uri \'none\'">';

  if (/<head\b[^>]*>/i.test(source)) {
    return source.replace(/<head\b[^>]*>/i, openingTag => openingTag + policy);
  }

  if (/<html\b[^>]*>/i.test(source)) {
    return source.replace(/<html\b[^>]*>/i, openingTag => openingTag + '<head>' + policy + '</head>');
  }

  return '<!doctype html><html><head>' + policy + '</head><body>' + source + '</body></html>';
}

type SceneItem = { kind: 'block' | 'tree' | 'crystal' | 'platform' | 'rock' | 'lamp' | 'door' | 'flower' | 'cloud' | 'flag'; x: number; z: number; color: string };
type ThreeGameProps = { gameId: string; gameName: string; genre: string; onClose: () => void; creationMode?: string; htmlCode?: string; sceneData?: SceneItem[] };
type BlockItem = { mesh: pc.Entity; used: boolean };
type MultiplayerPlayer = { userId: string; username: string; lane: number; distance: number; jump: number; score: number; status: string; updatedAt: string; isSelf?: boolean };

export default function ThreeGame({ gameId, gameName, genre, onClose, creationMode, htmlCode, sceneData = [] }: ThreeGameProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'ready'|'playing'|'won'|'finished'>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<MultiplayerPlayer[]>([]);
  const [multiplayerStatus, setMultiplayerStatus] = useState('Connecting to room…');
  const [chatOpen, setChatOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'third'|'first'>('third');
  const cameraModeRef = useRef<'third'|'first'>('third');
  const ownedPassesRef = useRef<string[]>([]);
  const ownedEffectsRef = useRef<Array<{id:string;gameId:string;effectType:string;effectValue:number}>>([]);
  const completionSentRef = useRef(false);
  const playSessionRef = useRef('');
  const [jumpRequested, setJumpRequested] = useState(0);
  const jumpRequestedRef = useRef(0);
  const laneTapRef = useRef(0);
  const restartRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => {
    let active = true;
    playSessionRef.current = '';
    api.post('/api/games/' + encodeURIComponent(gameId) + '/play', {}).then(result => {
      if (active && typeof result.data?.sessionId === 'string') {
        playSessionRef.current = result.data.sessionId;
      }
    }).catch(() => {});
    return () => {
      active = false;
      playSessionRef.current = '';
    };
  }, [gameId]);
  useEffect(() => {
    api.get('/api/gamepasses?gameId=' + encodeURIComponent(gameId) + '&gameName=' + encodeURIComponent(gameName)).then(r => {
      ownedPassesRef.current = Array.isArray(r.data?.owned) ? r.data.owned : [];
      ownedEffectsRef.current = Array.isArray(r.data?.ownedEffects) ? r.data.ownedEffects : [];
    }).catch(() => {});
    const onPassOwned = (event: Event) => {
      const pass = (event as CustomEvent).detail;
      if (!pass?.id) return;
      ownedPassesRef.current = Array.from(new Set([...ownedPassesRef.current, pass.id]));
      ownedEffectsRef.current = [...ownedEffectsRef.current.filter(item => item.id !== pass.id), { id: pass.id, gameId: pass.gameId || gameId, effectType: pass.effectType || '', effectValue: Number(pass.effectValue || 1) }];
    };
    window.addEventListener('doria-gamepass-owned', onPassOwned);
    return () => window.removeEventListener('doria-gamepass-owned', onPassOwned);
  }, [gameId, gameName]);
  useEffect(() => { jumpRequestedRef.current = jumpRequested; }, [jumpRequested]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || creationMode !== 'baseplate') return;

    let disposed = false;
    let scene: Awaited<ReturnType<typeof createDoriaVoxelApp>> | undefined;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Saved Doria creator world');
    canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:pan-y';
    mount.replaceChildren(canvas);

    const startWorld = async () => {
      try {
        scene = await createDoriaVoxelApp(canvas, '#17152b');
        if (disposed) {
          scene.dispose();
          return;
        }

        scene.camera.setPosition(11, 11, 13);
        scene.camera.lookAt(0, 0, 0);
        createDoriaBlock(scene.app, 'creator-world-baseplate', '#34314a', [0, -0.18, 0], [24, 0.36, 24]);
        createDoriaBlock(scene.app, 'creator-world-ground', '#28263b', [0, 0.015, 0], [23.8, 0.04, 23.8]);

        const animatedCrystals: pc.Entity[] = [];
        const add = (
          name: string,
          color: string,
          position: [number, number, number],
          scale: [number, number, number],
          emissive = false
        ) => createDoriaBlock(scene!.app, name, color, position, scale, emissive);

        sceneData.slice(0, 500).forEach((item, index) => {
          const x = Math.max(-11, Math.min(11, Number(item.x) || 0));
          const z = Math.max(-11, Math.min(11, Number(item.z) || 0));
          const color = /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : '#9b7bff';

          switch (item.kind) {
            case 'tree':
              add('creator-tree-trunk-' + index, '#76503a', [x, 0.72, z], [0.42, 1.44, 0.42]);
              add('creator-tree-canopy-' + index, color, [x, 1.95, z], [1.5, 1.5, 1.5]);
              break;
            case 'crystal': {
              const crystal = add('creator-crystal-' + index, color, [x, 0.9, z], [0.72, 1.05, 0.72], true);
              crystal.setEulerAngles(0, 45, 0);
              animatedCrystals.push(crystal);
              break;
            }
            case 'platform':
              add('creator-platform-' + index, color, [x, 0.2, z], [3.2, 0.35, 3.2]);
              break;
            case 'rock':
              add('creator-rock-' + index, color, [x, 0.58, z], [1.45, 0.9, 1.2]);
              break;
            case 'lamp':
              add('creator-lamp-post-' + index, '#77798c', [x, 1.05, z], [0.14, 2.1, 0.14]);
              add('creator-lamp-glow-' + index, '#ffe37b', [x, 2.15, z], [0.42, 0.42, 0.42], true);
              break;
            case 'door':
              add('creator-door-' + index, color, [x, 1.2, z], [1.4, 2.4, 0.25]);
              break;
            case 'flower':
              add('creator-flower-' + index, color, [x, 0.72, z], [0.55, 0.55, 0.55], true);
              break;
            case 'cloud':
              add('creator-cloud-' + index, color, [x, 3.4, z], [2.2, 0.85, 1.3]);
              break;
            case 'flag':
              add('creator-flag-pole-' + index, '#d5d5df', [x, 1.1, z], [0.1, 2.2, 0.1]);
              add('creator-flag-cloth-' + index, color, [x + 0.48, 1.8, z], [0.95, 0.7, 0.1]);
              break;
            default:
              add('creator-block-' + index, color, [x, 0.72, z], [1.4, 1.4, 1.4]);
              break;
          }
        });

        let elapsed = 0;
        scene.app.on('update', (dt: number) => {
          elapsed += dt;
          animatedCrystals.forEach((crystal, index) => {
            crystal.setEulerAngles(0, elapsed * 55 + index * 24, 0);
          });
        });
      } catch {
        if (!disposed) {
          mount.textContent = 'This world could not be rendered. Reload the game and try again.';
        }
      }
    };

    void startWorld();
    return () => {
      disposed = true;
      scene?.dispose();
      mount.replaceChildren();
    };
  }, [creationMode, sceneData]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || creationMode === 'html' || creationMode === 'neo' || creationMode === 'baseplate') return;
    let disposed = false;
    let running = false;
    let distance = 0, crystals = 0, lane = 0, jump = 0, jumpVelocity = 0, jumpSerial = 0;
    const keys = new Set<string>();
    const remoteAvatars = new Map<string, DoriaVoxelAvatar>();
    const knownPlayers = new Map<string, MultiplayerPlayer>();
    let multiplayerConnection: ReturnType<typeof ws.connect> | undefined;
    let multiplayerConnectionId = '';
    let multiplayerUserId = '';
    let multiplayerJoined = false;
    let networkElapsed = 0;
    let currentGameStatus: 'lobby' | 'playing' | 'finished' = 'lobby';
    const applyPlayerUpdate = (incoming: MultiplayerPlayer) => {
      if (!incoming?.userId) return;
      if (incoming.status === 'offline') {
        knownPlayers.delete(incoming.userId);
        const oldAvatar = remoteAvatars.get(incoming.userId);
        oldAvatar?.root.destroy();
        remoteAvatars.delete(incoming.userId);
      } else {
        knownPlayers.set(incoming.userId, incoming);
        if (incoming.userId !== multiplayerUserId && scene && !remoteAvatars.has(incoming.userId)) {
          const palette = ['#9b7bff', '#4cbbad', '#e58a62', '#668edb', '#c36db7', '#82a85b'];
          const shade = Array.from(incoming.userId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
          remoteAvatars.set(incoming.userId, createDoriaVoxelAvatar(scene.app, { body: palette[shade], accent: '#7cebe5' }, 0.82));
        }
      }
      setMultiplayerPlayers(Array.from(knownPlayers.values()).filter(item => item.status !== 'offline'));
    };
    const collectibles: BlockItem[] = [];
    const obstacles: BlockItem[] = [];
    let scene: Awaited<ReturnType<typeof createDoriaVoxelApp>> | undefined;
    let avatar: DoriaVoxelAvatar | undefined;
    // Each genre gets a world palette chosen for atmosphere and gameplay contrast,
    // rather than inheriting Doria's purple/yellow app branding.
    const paletteMap: Record<string, {bg:string;ground:string;trim:string;crystal:string;obstacle:string}> = {
      Adventure:{bg:'#9bc9df',ground:'#568b55',trim:'#d8b56b',crystal:'#52e0d0',obstacle:'#b85c43'},
      Obby:{bg:'#8ec9e8',ground:'#f0b83f',trim:'#28b9c8',crystal:'#fff176',obstacle:'#e84b58'},
      Roleplay:{bg:'#b6d6bd',ground:'#547b58',trim:'#d7c18a',crystal:'#8be3c0',obstacle:'#a65e48'},
      Racing:{bg:'#18232e',ground:'#394956',trim:'#ff8b36',crystal:'#6de2ff',obstacle:'#e64f50'},
      Simulator:{bg:'#a9d8cf',ground:'#5b9c91',trim:'#f0a27e',crystal:'#e9f58b',obstacle:'#bd668d'},
      Puzzle:{bg:'#a9c6dc',ground:'#526f8c',trim:'#e5d58b',crystal:'#b7ed83',obstacle:'#db8954'},
      Social:{bg:'#e9c1b6',ground:'#9b7772',trim:'#f2b66d',crystal:'#8bc8e8',obstacle:'#806b9f'}
    };
    const palette = paletteMap[genre] || paletteMap.Adventure;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label','Doria block-based voxel game');
    canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
    mount.appendChild(canvas);
    const startScene = async () => {
      try {
        scene = await createDoriaVoxelApp(canvas, palette.bg);
        if (disposed) { scene.dispose(); return; }
        const { app, camera } = scene;
        camera.setPosition(0, 6.4, 10);
        camera.lookAt(0, 0.8, -8);
        const grass = createDoriaMaterial(palette.ground);
        const dirt = createDoriaMaterial('#292b43');
        const trim = createDoriaMaterial(palette.trim, true);
        const crystalMat = createDoriaMaterial(palette.crystal, true);
        const obstacleMat = createDoriaMaterial(palette.obstacle);
        // Recycled block lanes keep the runner moving through an endless track.
        const trackTiles: pc.Entity[] = [];
        for (let z = -5; z >= -125; z -= 2) {
          for (let x = -1; x <= 1; x++) {
            const tile = new pc.Entity('voxel-track-block');
            tile.addComponent('render', { type: 'box', material: grass });
            tile.setPosition(x * 2.1, -0.22, z);
            tile.setLocalScale(2.04, 0.42, 2);
            app.root.addChild(tile);
            trackTiles.push(tile);
          }
          if (z % 6 === 0) {
            createDoriaBlock(app, 'lane-marker', palette.trim, [-1.05, 0.015, z], [0.055, 0.035, 0.85], true);
            createDoriaBlock(app, 'lane-marker', palette.trim, [1.05, 0.015, z], [0.055, 0.035, 0.85], true);
          }
          for (const side of [-1, 1]) {
            if (z % 10 === 0) {
              const height = 1 + ((Math.abs(z) / 10) % 4);
              createDoriaBlock(app, 'voxel-dirt-bank', '#34304d', [side * 5.2, height / 2, z], [2.5, height, 2], false);
              if (z % 20 === 0) {
                createDoriaBlock(app, 'voxel-tree-trunk', '#74513b', [side * 5.2, height + 0.65, z], [0.55, 1.5, 0.55]);
                createDoriaBlock(app, 'voxel-tree-leaves', '#4c9b68', [side * 5.2, height + 1.8, z], [1.8, 1.2, 1.8]);
              }
            }
          }
        }
        // Small block-built floating islands and chunky gate structures.
        for (let i = 0; i < 8; i++) {
          const z = -13 - i * 14;
          for (let x = -1; x <= 1; x++) {
            createDoriaBlock(app, 'floating-voxel', i % 2 ? '#564a79' : '#3f5875', [x * 1.8, 3.5 + (i % 3) * 0.4, z], [1.65, 0.7, 1.7]);
          }
          createDoriaBlock(app, 'voxel-gate-left', palette.trim, [-3.7, 1.4, z], [0.32, 2.8, 0.55], true);
          createDoriaBlock(app, 'voxel-gate-right', palette.trim, [3.7, 1.4, z], [0.32, 2.8, 0.55], true);
          createDoriaBlock(app, 'voxel-gate-top', palette.trim, [0, 2.7, z], [7.7, 0.32, 0.55], true);
        }
        const look = (() => { try { return JSON.parse(localStorage.getItem('doria-avatar-look') || '{}') as DoriaAvatarLook; } catch { return {}; } })();
        avatar = createDoriaVoxelAvatar(app, look, 1);
        const player = avatar.root;
        player.setPosition(0, 0, 0);

        const connectRoom = async () => {
          try {
            const joined = await api.post('/api/multiplayer/' + encodeURIComponent(gameId) + '/join', {});
            multiplayerUserId = String(joined.data?.player?.userId || '');
            if (!multiplayerUserId) throw new Error('Room join did not return a player identity.');
            multiplayerJoined = true;
            if (joined.data?.player) applyPlayerUpdate(joined.data.player as MultiplayerPlayer);

            const connection = ws.connect();
            multiplayerConnection = connection;
            connection.onMessage(message => {
              const payload = message?.payload;
              if (message?.type !== 'entity.update' || payload?.entity_type !== 'game' || payload?.entity_id !== gameId) return;
              const data = payload.data;
              if (data?.type === 'player.state' && data.player) applyPlayerUpdate(data.player as MultiplayerPlayer);
              if (data?.type === 'player.left' && typeof data.userId === 'string') {
                applyPlayerUpdate({ userId: data.userId, username: '', lane: 0, distance: 0, jump: 0, score: 0, status: 'offline', updatedAt: data.updatedAt || new Date().toISOString() });
              }
            });
            connection.onError(() => setMultiplayerStatus('Connection interrupted · retry by reopening the game'));
            connection.onClose(() => setMultiplayerStatus('Disconnected from multiplayer'));
            await connection.ready;
            multiplayerConnectionId = String(connection.connectionId || '');
            if (!multiplayerConnectionId) throw new Error('Realtime connection did not provide an ID.');
            await api.post('/api/subscriptions', { entity_type: 'game', entity_id: gameId, connection_id: multiplayerConnectionId });
            const snapshot = await api.get('/api/multiplayer/' + encodeURIComponent(gameId));
            const currentPlayers = Array.isArray(snapshot.data?.players) ? snapshot.data.players as MultiplayerPlayer[] : [];
            currentPlayers.forEach(applyPlayerUpdate);
            setMultiplayerStatus('Live multiplayer');
          } catch {
            setMultiplayerStatus('Solo play · multiplayer unavailable');
          }
        };
        void connectRoom();

        // Reusable block collectibles and obstacles are recycled as they pass the player.
        for (let z = -12; z >= -108; z -= 6) {
          const laneIndex = Math.floor(Math.random() * 3) - 1;
          if (Math.random() > 0.18) {
            const crystal = new pc.Entity('voxel-crystal');
            crystal.addComponent('render', { type: 'box', material: crystalMat });
            crystal.setPosition(laneIndex * 2.1, 1.15, z);
            crystal.setLocalScale(0.62, 0.62, 0.62);
            app.root.addChild(crystal);
            collectibles.push({ mesh: crystal, used: false });
          }
          if (Math.random() > 0.48) {
            const obstacle = new pc.Entity('voxel-obstacle');
            obstacle.addComponent('render', { type: 'box', material: obstacleMat });
            obstacle.setPosition((Math.floor(Math.random() * 3) - 1) * 2.1, 0.65, z - 2.8);
            obstacle.setLocalScale(1.12, 1.3, 1.12);
            app.root.addChild(obstacle);
            obstacles.push({ mesh: obstacle, used: false });
          }
        }
        const start = () => {
          distance = 0; crystals = 0; lane = 0; jump = 0; jumpVelocity = 0; jumpSerial = jumpRequestedRef.current; completionSentRef.current = false;
          player.setPosition(0, 0, 0);
          collectibles.forEach(i => { i.used = false; i.mesh.enabled = true; });
          obstacles.forEach(i => { i.used = false; i.mesh.enabled = true; });
          setScore(0); setStatus('playing'); currentGameStatus = 'playing'; running = true;
          if (hudRef.current) hudRef.current.textContent = 'Crystals: 0  •  Distance: 0 m';
        };
        startRef.current = start; restartRef.current = start;
        const update = (dt: number) => {
          if (disposed || document.hidden) return;
          const step = Math.min(dt, 0.04);
          networkElapsed += step;
          if (multiplayerJoined && networkElapsed >= 0.25) {
            networkElapsed = 0;
            void api.post('/api/multiplayer/' + encodeURIComponent(gameId) + '/state', {
              lane, distance, jump, score: crystals, status: currentGameStatus,
            }).catch(() => setMultiplayerStatus('Reconnecting · solo play remains available'));
          }
          if (!running) return;
          const activeEffects = ownedEffectsRef.current.filter(effect => !effect.gameId || effect.gameId === gameId);
          const speedBoost = Math.min(2, Math.max(1, ...activeEffects.filter(effect => effect.effectType === 'speed_boost').map(effect => effect.effectValue)));
          const jumpBoost = Math.min(2, Math.max(1, ...activeEffects.filter(effect => effect.effectType === 'jump_boost').map(effect => effect.effectValue)));
          const doubleCrystals = activeEffects.some(effect => effect.effectType === 'double_crystals');
          distance += step * 10 * speedBoost;
          if (laneTapRef.current) { lane = Math.max(-1, Math.min(1, lane + laneTapRef.current)); laneTapRef.current = 0; }
          if (keys.has('ArrowLeft') || keys.has('a')) lane = Math.max(-1, lane - step * 2.8);
          if (keys.has('ArrowRight') || keys.has('d')) lane = Math.min(1, lane + step * 2.8);
          if ((keys.has(' ') || keys.has('ArrowUp')) && jump <= 0.02) jumpVelocity = 5.3 * jumpBoost;
          if (jumpRequestedRef.current !== jumpSerial) { jumpSerial = jumpRequestedRef.current; if (jump <= 0.02) jumpVelocity = 5.3 * jumpBoost; }
          jumpVelocity -= step * 13;
          jump = Math.max(0, jump + jumpVelocity * step);
          if (jump === 0) jumpVelocity = 0;
          const px = lane * 2.1;
          const playerZ = -distance;
          player.setPosition(player.getPosition().x + (px - player.getPosition().x) * Math.min(1, step * 10), jump, playerZ);
          for (const [userId, remote] of knownPlayers) {
            if (userId === multiplayerUserId) continue;
            const remoteAvatar = remoteAvatars.get(userId);
            if (!remoteAvatar) continue;
            const delta = remote.distance - distance;
            const visible = remote.status !== 'offline' && Math.abs(delta) < 55;
            remoteAvatar.root.enabled = visible;
            if (visible) remoteAvatar.root.setPosition(remote.lane * 2.1, remote.jump, -distance - delta);
          }
          // Move passed floor blocks to the front so the run never reaches the end of the track.
          for (const tile of trackTiles) {
            const tilePos = tile.getPosition();
            if (tilePos.z > playerZ + 8) tile.setPosition(tilePos.x, tilePos.y, playerZ - 120);
          }
          const swing = Math.sin(performance.now() * 0.012) * 24;
          avatar?.arms[0].setLocalEulerAngles(0, 0, swing);
          avatar?.arms[1].setLocalEulerAngles(0, 0, -swing);
          avatar?.legs[0].setLocalEulerAngles(swing * 0.7, 0, 0);
          avatar?.legs[1].setLocalEulerAngles(-swing * 0.7, 0, 0);
          for (const item of collectibles) {
            if (item.mesh.getPosition().z > playerZ + 8) {
              item.mesh.setPosition((Math.floor(Math.random() * 3) - 1) * 2.1, 1.15, playerZ - 75 - Math.random() * 25);
              item.used = false; item.mesh.enabled = true;
            }
            if (!item.used && Math.abs(item.mesh.getPosition().z) < 999) {
              const p = item.mesh.getPosition();
              if (Math.abs(p.z - playerZ) < 1.05 && Math.abs(p.x - player.getPosition().x) < 0.95 && jump < 1.8) {
                item.used = true; item.mesh.enabled = false;
                crystals += doubleCrystals ? 2 : 1;
                setScore(crystals);
                if (crystals >= 10) { running = false; currentGameStatus = 'finished'; setStatus('won'); setScore(crystals); setBest(v => Math.max(v, crystals)); if (!completionSentRef.current) { completionSentRef.current = true; const sessionId = playSessionRef.current; if (sessionId) void api.post('/api/games/' + encodeURIComponent(gameId) + '/complete', { score: crystals, sessionId }).catch(() => {}); } }
              }
            }
          }
          for (const item of obstacles) {
            if (item.mesh.getPosition().z > playerZ + 8) {
              item.mesh.setPosition((Math.floor(Math.random() * 3) - 1) * 2.1, 0.65, playerZ - 75 - Math.random() * 25);
              item.used = false; item.mesh.enabled = true;
            }
            const p = item.mesh.getPosition();
            if (!item.used && Math.abs(p.z - playerZ) < 1 && Math.abs(p.x - player.getPosition().x) < 0.95 && jump < 0.85) {
              item.used = true; item.mesh.enabled = false; running = false; currentGameStatus = 'finished'; setStatus('finished'); setBest(v => Math.max(v, crystals));
            }
          }
          const p = player.getPosition();
          if (cameraModeRef.current === 'first') {
            camera.setPosition(p.x, p.y + 1.5, p.z + 0.12);
            camera.lookAt(p.x, p.y + 1.2, p.z - 10);
          } else {
            camera.setPosition(p.x * 0.25, 6.4 + jump * 0.25, p.z + 10);
            camera.lookAt(p.x * 0.4, 0.9 + jump * 0.2, p.z - 8);
          }
          if (hudRef.current) hudRef.current.textContent = 'Crystals: ' + crystals + '  •  Distance: ' + Math.floor(distance) + ' m';
        };
        app.on('update', update);
      } catch {
        if (!disposed) mount.innerHTML = '<div class="three-fallback">Voxel graphics could not start. Please try a browser with WebGL 2 support.</div>';
      }
    };
    void startScene();
    const keyDown = (e: KeyboardEvent) => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key)) e.preventDefault(); keys.add(key); };
    const keyUp = (e: KeyboardEvent) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const visibility = () => { if (document.hidden) running = false; };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true; running = false;
      if (multiplayerJoined) void api.post('/api/multiplayer/' + encodeURIComponent(gameId) + '/leave', {}).catch(() => {});
      if (multiplayerConnectionId) void api.post('/api/subscriptions/remove', { entity_type: 'game', entity_id: gameId, connection_id: multiplayerConnectionId }).catch(() => {});
      multiplayerConnection?.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      document.removeEventListener('visibilitychange', visibility);
      scene?.dispose(); canvas.remove();
    };
  }, [genre, creationMode, gameId]);

  const begin = () => startRef.current();
  const restart = () => restartRef.current();
  if (creationMode === 'baseplate') return <div className="three-game-backdrop" role="dialog" aria-modal="true" aria-label={gameName + ' creator world'}><section className="three-game-shell"><header className="three-game-header"><div className="three-game-brand"><span className="three-game-brand-icon"><Orbit size={20}/></span><div><b>{gameName}</b><small>CREATED IN DORIA STUDIO</small></div></div><button className="three-game-chat-toggle" onClick={() => setShopOpen(true)}><LockKeyhole size={14}/> Gamepasses</button><button className="three-game-close" onClick={onClose} aria-label="Close world"><X size={20}/></button></header><div className="three-game-stage"><div ref={mountRef} className="three-game-canvas"/></div><footer className="three-game-footer"><span>Saved 3D world · {sceneData.length} placed objects</span><button className="button-soft" onClick={onClose}>Exit world</button></footer></section>{shopOpen && <GamePassShop gameId={gameId} gameName={gameName} onClose={() => setShopOpen(false)}/>}</div>;
  if (creationMode === 'html' || creationMode === 'neo') return <div className="three-game-backdrop" role="dialog" aria-modal="true" aria-label={gameName + ' game'}><section className="three-game-shell"><header className="three-game-header"><div className="three-game-brand"><span className="three-game-brand-icon"><Orbit size={20}/></span><div><b>{gameName}</b><small>DORIA GAME PLAYER</small></div></div><button className="three-game-chat-toggle" onClick={() => setShopOpen(true)}><LockKeyhole size={14}/> Gamepasses</button><button className="three-game-close" onClick={onClose} aria-label="Close game"><X size={20}/></button></header><iframe title={gameName + ' playable game'} sandbox="allow-scripts" style={{display:'block',flex:1,minHeight:300,width:'100%',border:0,background:'#11101e'}} srcDoc={applySandboxCsp(htmlCode || '<html><body style="font:20px sans-serif;background:#151324;color:white;padding:3rem">Your game is being prepared.</body></html>')}/><footer className="three-game-footer"><span>Game running in a protected frame</span><button className="button-soft" onClick={onClose}>Exit game</button></footer></section>{shopOpen && <GamePassShop gameId={gameId} gameName={gameName} onClose={() => setShopOpen(false)}/>}</div>;
  return <div className="three-game-backdrop" role="dialog" aria-modal="true" aria-label={gameName + ' voxel game'} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="three-game-shell">
      <header className="three-game-header">
        <div className="three-game-brand"><span className="three-game-brand-icon"><Orbit size={20}/></span><div><b>{gameName}</b><small>DORIA • VOXEL PLAYGROUND</small></div></div>
        <div className="three-game-stats"><span><Gem size={15}/> {score} / 10</span><span><Trophy size={15}/> Best {best}</span></div>
        <span className="three-game-multiplayer" title={multiplayerStatus}><Users size={14}/> {Math.max(1, multiplayerPlayers.length)} here</span>
        <div className="three-game-view-toggle"><button className={cameraMode === 'third' ? 'selected' : ''} onClick={() => setCameraMode('third')}>3rd person</button><button className={cameraMode === 'first' ? 'selected' : ''} onClick={() => setCameraMode('first')}>1st person</button></div>
        <button className="three-game-chat-toggle" onClick={() => setChatOpen(v => !v)} aria-expanded={chatOpen}>{chatOpen ? 'Hide chat' : 'Live chat'}</button>
        <button className="three-game-chat-toggle" onClick={() => setShopOpen(true)}><LockKeyhole size={14}/> Gamepasses</button>
        <button className="three-game-close" onClick={onClose} aria-label="Close game"><X size={20}/></button>
      </header>
      <div className="three-game-stage"><div className="three-game-canvas" ref={mountRef}/><div className="three-game-hud" ref={hudRef}><span><Star size={13}/> 0 crystals</span><span><Route size={13}/> 0 m</span></div>
        {status !== 'playing' && <div className="three-game-overlay"><div className="three-game-overlay-card"><span className="three-game-orb">{status === 'won' ? <Trophy size={30}/> : status === 'finished' ? <Star size={30}/> : <Orbit size={30}/>}</span><h2>{status === 'won' ? 'Voxel champion!' : status === 'finished' ? 'Run complete!' : 'Ready to explore?'}</h2><p>{status === 'won' ? 'You collected 10 blocks. Excellent run.' : status === 'finished' ? 'You hit a block obstacle. Try again!' : 'Collect 10 glowing blocks and dodge the voxel barriers.'}</p><div className="three-game-instructions"><span>← → <b>Move</b></span><span>SPACE / ↑ <b>Jump</b></span><span>Touch <b>Use controls</b></span></div><button className="three-game-start" onClick={status === 'ready' ? begin : restart}>{status === 'ready' ? 'Start playing' : <><RotateCcw size={16}/> Play again</>}</button></div></div>}
      </div>
      {chatOpen && <GameChat gameId={gameId}/>}
      <footer className="three-game-footer"><span>Tap ◀ ▶ to switch lanes · tap ↑ to jump</span><div className="three-touch-controls"><button onClick={() => { laneTapRef.current = -1; }} aria-label="Move one lane left"><ArrowLeft size={21}/></button><button onClick={() => { laneTapRef.current = 1; }} aria-label="Move one lane right"><ArrowRight size={21}/></button><button onClick={() => setJumpRequested(v => v + 1)} aria-label="Jump"><ArrowUp size={21}/></button></div></footer>
      {shopOpen && <GamePassShop gameId={gameId} gameName={gameName} onClose={() => setShopOpen(false)}/>}
    </section>
  </div>;
}