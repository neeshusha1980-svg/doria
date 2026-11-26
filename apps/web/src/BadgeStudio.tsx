import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { BadgePlus, Upload, CheckCircle2, LockKeyhole } from 'lucide-react';
import { getApiErrorMessage } from './apiErrors';

type Game = { id: string; name: string };
type BadgeRecord = { id: string; name: string; description?: string; gameId?: string; imageUrl?: string; artStyle?: string; creatorName?: string };

const builtInBadges = [
  ['first-steps','First Steps','Create your Doria account.','starter'],['world-maker','World Maker','Publish your first world.','creator'],['idea-starter','Idea Spark','Complete the idea-starter quest.','spark'],
  ['rising-creator','Rising Creator','Publish five worlds.','creator'],['studio-veteran','Studio Veteran','Publish ten worlds.','creator'],['first-friend','Friendly Face','Add your first friend.','community'],
  ['good-neighbour','Good Neighbour','Send a friendly message.','community'],['moment-maker','Moment Maker','Share your first Doria Moment.','creator'],['social-butterfly','Social Butterfly','Make five friends.','community'],
  ['starlit-saver','Starlit Saver','Collect 500 Starlits.','currency'],['starlit-star','Starlit Star','Collect 1,000 Starlits.','currency'],['crystal-collector','Crystal Collector','Collect ten crystals in a game.','game'],
  ['voxel-champion','Voxel Champion','Win a Doria voxel run.','game'],['first-purchase','First Purchase','Purchase your first gamepass.','game'],['style-icon','Style Icon','Equip a community-made item.','style'],
  ['ugc-artist','UGC Artist','Publish your first 3D item.','creator'],['model-master','Model Master','Publish five 3D items.','creator'],['badge-designer','Badge Designer','Publish your first custom badge.','creator'],
  ['badge-collector','Badge Collector','Earn ten badges.','collection'],['badge-hunter','Badge Hunter','Earn twenty badges.','collection'],['explorer','World Explorer','Play five different worlds.','game'],
  ['puzzle-solver','Puzzle Solver','Complete a puzzle world.','game'],['speed-runner','Speed Runner','Finish a race world.','game'],['team-player','Team Player','Play a multiplayer session.','community'],
  ['builder-brain','Builder Brain','Place fifty world objects.','creator'],['architect','Architect','Publish a world with 100 objects.','creator'],['neo-pioneer','Neo Pioneer','Create a game with Neo.','creator'],
  ['html-artist','HTML Artist','Publish an HTML game.','creator'],['weekend-creator','Weekend Creator','Create on a weekend.','creator'],['community-helper','Community Helper','Help another creator.','community'],
  ['kindness-counts','Kindness Counts','Receive a positive community recognition.','community'],['orbit-traveller','Orbit Traveller','Explore a space-themed game.','game'],['nature-friend','Nature Friend','Build a nature-themed world.','creator'],
  ['colour-expert','Colour Expert','Use five colours in a model.','style'],['detail-lover','Detail Lover','Create a model with ten parts.','creator'],['collector-pro','Collector Pro','Own five community UGC items.','collection'],
  ['pass-collector','Pass Collector','Own three gamepasses.','collection'],['all-rounder','All-Rounder','Create, play and connect on Doria.','collection'],['early-explorer','Early Explorer','Join Doria early.','special'],
  ['star-builder','Star Builder','Publish a featured world.','special'],['doria-original','Doria Original','Be part of the first creator generation.','special'],
] as const;

const palettes: Record<string, [string,string,string]> = {
  starter: ['#6dd6d0','#214f68','#e7ffff'], creator: ['#b18cff','#51368d','#fff0a8'], spark: ['#ffd46f','#9d552f','#fff7d6'],
  community: ['#ff91bd','#873b74','#fff1f7'], currency: ['#ffe27b','#a56b20','#fff8d9'], game: ['#77cfff','#285b9a','#eaf8ff'],
  style: ['#ed9bff','#713c91','#fff0ff'], collection: ['#9ee5a9','#276b55','#f0fff2'], special: ['#f5c56c','#82512a','#fff5d5'],
};

function BadgeArtwork({ style = 'creator', title }: { style?: string; title: string }) {
  const colors = palettes[style] || palettes.creator;
  const safe = style.replace(/[^a-z0-9]/gi, '') + title.replace(/[^a-z0-9]/gi, '').slice(0,8);
  return <svg viewBox="0 0 120 120" role="img" aria-label={title + ' graphic badge'} className="doria-badge-art">
    <defs>
      <linearGradient id={'g'+safe} x1="0" y1="0" x2="1" y2="1"><stop stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/></linearGradient>
      <radialGradient id={'r'+safe}><stop stopColor={colors[2]}/><stop offset="1" stopColor={colors[0]}/></radialGradient>
      <filter id={'s'+safe}><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".45"/></filter>
    </defs>
    <path d="M60 4 72 14 89 12 96 28 111 39 104 57 111 75 96 88 89 106 70 104 60 116 47 104 29 106 22 88 8 76 15 57 8 39 23 28 30 12 48 14Z" fill={'url(#g'+safe+')'} stroke={colors[2]} strokeWidth="2" filter={'url(#s'+safe+')'}/>
    <circle cx="60" cy="57" r="37" fill={'url(#r'+safe+')'} stroke={colors[2]} strokeWidth="3"/>
    <circle cx="60" cy="57" r="30" fill="none" stroke={colors[1]} strokeWidth="2" strokeDasharray="3 4"/>
    <path d="M60 27 67 45 86 46 71 58 76 77 60 66 44 77 49 58 34 46 53 45Z" fill={colors[2]} stroke={colors[1]} strokeWidth="2" strokeLinejoin="round"/>
    <path d="M34 91 42 105 60 111 78 105 86 91" fill="none" stroke={colors[2]} strokeWidth="3" strokeLinecap="round"/>
    <circle cx="60" cy="57" r="5" fill={colors[1]}/>
  </svg>;
}

export function BadgeGallery() {
  const [custom, setCustom] = useState<BadgeRecord[]>([]);
  const [earned, setEarned] = useState<string[]>([]);
  useEffect(() => {
    api.get('/api/badges').then(result => {
      setCustom(Array.isArray(result.data?.custom) ? result.data.custom : []);
      setEarned(Array.isArray(result.data?.earnedIds) ? result.data.earnedIds : []);
    }).catch(() => {});
  }, []);
  return <section className="panel doria-badge-gallery">
    <div className="section-head"><div><h3>Badge collection</h3><p>Graphic achievements from Doria and creator-made game badges.</p></div><span className="badge-total">{earned.length} earned</span></div>
    <div className="doria-badge-grid">
      {builtInBadges.map(([id,name,description,style]) => <article className={'doria-badge-tile '+(earned.includes(id)?'earned':'locked')} key={id}><BadgeArtwork style={style} title={name}/><b>{name}</b><small>{earned.includes(id)?'Earned':description}</small>{!earned.includes(id) && <LockKeyhole size={13}/>}</article>)}
      {custom.map(item => <article className="doria-badge-tile" key={item.id}>{item.imageUrl ? <img className="doria-badge-art" src={item.imageUrl} alt={item.name}/> : <BadgeArtwork style={item.artStyle || 'creator'} title={item.name}/>}<b>{item.name}</b><small>{item.description || 'Creator-made badge'}{item.gameId ? ' · Game badge' : ''}</small>{earned.includes(item.id) && <CheckCircle2 size={14}/>}</article>)}
    </div>
  </section>;
}

export default function BadgeStudio({ games }: { games: Game[] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gameId, setGameId] = useState('');
  const [artStyle, setArtStyle] = useState('creator');
  const [imageBase64, setImageBase64] = useState('');
  const [imageName, setImageName] = useState('');
  const [custom, setCustom] = useState<BadgeRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    const result = await api.get('/api/badges');
    setCustom(Array.isArray(result.data?.custom) ? result.data.custom : []);
  };
  useEffect(() => { void load().catch(() => setMessage('Sign in to manage creator badges.')); }, []);
  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setMessage('Use a PNG, JPG or WebP image up to 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setImageBase64(String(reader.result || '')); setImageName(file.name); };
    reader.onerror = () => setMessage('Could not read that badge image.');
    reader.readAsDataURL(file);
  };
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 3) { setMessage('Badge name must be at least 3 characters.'); return; }
    setBusy(true); setMessage('');
    try {
      await api.post('/api/badges', { name: name.trim(), description: description.trim(), gameId: gameId || undefined, artStyle, imageBase64: imageBase64 || undefined });
      setName(''); setDescription(''); setImageBase64(''); setImageName('');
      setMessage('Your graphic badge has been published.');
      await load();
    } catch (error: unknown) { setMessage(getApiErrorMessage(error, 'Could not publish the badge.')); }
    finally { setBusy(false); }
  };
  return <section className="panel badge-studio">
    <div className="page-intro"><span className="eyebrow"><BadgePlus size={13}/> DORIA STUDIO · BADGE WORKSHOP</span><h2>Create graphic badges</h2><p>Make a badge for your game or for the wider Doria community. Upload your own badge artwork or choose a graphic medal style.</p></div>
    <form className="badge-create-form" onSubmit={publish}>
      <div className="badge-form-grid">
        <label>Badge name<input required minLength={3} maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Crystal Guardian"/></label>
        <label>Badge artwork style<select value={artStyle} onChange={event => setArtStyle(event.target.value)}>{Object.keys(palettes).map(key => <option key={key} value={key}>{key[0].toUpperCase()+key.slice(1)} medal</option>)}</select></label>
        <label className="badge-description">Description<textarea maxLength={160} value={description} onChange={event => setDescription(event.target.value)} placeholder="Explain how players earn this badge."/></label>
        <label>Attach to a game (optional)<select value={gameId} onChange={event => setGameId(event.target.value)}><option value="">Doria community badge</option>{games.map(game => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
      </div>
      <div className="badge-upload-row"><label className="badge-upload"><Upload size={17}/><span>{imageName || 'Upload badge image (PNG, JPG, WebP)'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseImage(event.target.files?.[0])}/></label>{imageBase64 && <button type="button" className="button-soft" onClick={() => {setImageBase64('');setImageName('');}}>Remove image</button>}</div>
      <div className="badge-live-preview">{imageBase64 ? <img src={imageBase64} alt="Badge upload preview"/> : <BadgeArtwork style={artStyle} title={name || 'Your badge'}/>}<div><b>{name || 'Your badge name'}</b><small>{description || 'Your badge description will appear here.'}</small><span>{gameId ? 'GAME BADGE' : 'DORIA BADGE'}</span></div></div>
      <button className="button-primary" disabled={busy}><BadgePlus size={15}/>{busy ? 'Publishing…' : 'Publish badge'}</button>
    </form>
    {message && <p className="panel-sub" role="status">{message}</p>}
    <div className="section-head"><div><h3>Your published badges</h3><p>Game badges are awarded when a player completes the supported game experience.</p></div></div>
    <div className="doria-badge-grid">{custom.map(item => <article className="doria-badge-tile" key={item.id}>{item.imageUrl ? <img className="doria-badge-art" src={item.imageUrl} alt={item.name}/> : <BadgeArtwork style={item.artStyle || 'creator'} title={item.name}/>}<b>{item.name}</b><small>{item.gameId ? 'Game badge' : 'Doria badge'}</small></article>)}{!custom.length && <p className="panel-sub">No custom badges yet. Publish your first one above.</p>}</div>
  </section>;
}
