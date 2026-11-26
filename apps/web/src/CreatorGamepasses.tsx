import { useState } from 'react';
import { api } from './lib/api';
import { LockKeyhole, Plus, Coins } from 'lucide-react';
import { getApiErrorMessage } from './apiErrors';
type Game = { id: string; name: string };
export default function CreatorGamepasses({ games }: { games: Game[] }) {
  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [price, setPrice] = useState(75);
  const [effectType, setEffectType] = useState('double_crystals');
  const [effectValue, setEffectValue] = useState(2);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!gameId) { setMessage('Publish a game first.'); return; }
    setBusy(true); setMessage('');
    try {
      await api.post('/api/games/' + encodeURIComponent(gameId) + '/gamepasses', { name, detail, price, effectType, effectValue });
      setName(''); setDetail(''); setMessage('Gamepass created. Players can now buy it and receive its gameplay effect.');
    } catch (error: unknown) { setMessage(getApiErrorMessage(error, 'Could not create gamepass.')); }
    finally { setBusy(false); }
  };
  return <section className="panel creator-pass-panel"><span className="eyebrow"><LockKeyhole size={13}/> CREATOR MONETIZATION</span><h2>Create gamepasses</h2><p className="panel-sub">Define what players get. Effects are applied by Doria's supported game runtime.</p>
    <form onSubmit={publish} className="creator-pass-form">
      <label>Your game<select value={gameId} onChange={event => setGameId(event.target.value)}>{games.map(game => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
      <label>Pass name<input required minLength={3} maxLength={36} value={name} onChange={event => setName(event.target.value)} placeholder="Double Crystal Pack"/></label>
      <label>Player-facing description<input required minLength={8} maxLength={140} value={detail} onChange={event => setDetail(event.target.value)} placeholder="Get twice as many crystals in this game."/></label>
      <div className="creator-pass-row"><label>Price (Starlits)<input type="number" min={5} max={5000} step={5} value={price} onChange={event => setPrice(Number(event.target.value))}/></label><label>Gameplay effect<select value={effectType} onChange={event => setEffectType(event.target.value)}><option value="double_crystals">Double crystals</option><option value="jump_boost">Higher jump</option><option value="speed_boost">Faster movement</option></select></label><label>Effect strength<input type="number" min={1} max={3} value={effectValue} onChange={event => setEffectValue(Number(event.target.value))}/></label></div>
      <button className="button-primary" disabled={busy || !games.length}><Plus size={15}/>{busy ? 'Creating…' : 'Create gamepass'}</button>
    </form>{message && <p className="panel-sub" role="status">{message}</p>}
  </section>;
}