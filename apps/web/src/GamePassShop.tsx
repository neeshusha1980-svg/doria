import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { Coins, LockKeyhole, Check, X } from 'lucide-react';
import './GamePassShop.css';
import { getApiErrorMessage } from './apiErrors';

type Pass = { id: string; name: string; game: string; gameId: string; detail: string; price: number; effectType: string; effectValue: number };
export default function GamePassShop({ gameId, gameName, onClose }: { gameId: string; gameName: string; onClose: () => void }) {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('Loading this game’s passes…');
  useEffect(() => {
    let active = true;
    api.get('/api/gamepasses?gameId=' + encodeURIComponent(gameId) + '&gameName=' + encodeURIComponent(gameName)).then(result => {
      if (!active) return;
      setPasses(Array.isArray(result.data?.catalog) ? result.data.catalog : []);
      setOwned(Array.isArray(result.data?.owned) ? result.data.owned : []);
      setMessage('');
    }).catch(() => active && setMessage('Gamepasses could not be loaded. Please retry.'));
    return () => { active = false; };
  }, [gameId, gameName]);
  const purchase = async (pass: Pass) => {
    setBusy(pass.id); setMessage('');
    try {
      const result = await api.post('/api/gamepasses/purchase', { passId: pass.id, gameId });
      setOwned(current => current.includes(pass.id) ? current : [...current, pass.id]);
      window.dispatchEvent(new CustomEvent('doria-gamepass-owned', { detail: { ...pass, ...(result.data?.pass || {}) } }));
      setMessage('Purchased ' + pass.name + '. Its gameplay effect is now active in this game.');
    } catch (error: unknown) { setMessage(getApiErrorMessage(error, 'Purchase failed. Your Starlits were not deducted.')); }
    finally { setBusy(''); }
  };
  return <div className="gamepass-shop-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="gamepass-shop panel" role="dialog" aria-modal="true" aria-label="In-game gamepass shop">
      <header><div><span className="eyebrow"><LockKeyhole size={13}/> IN-GAME SHOP</span><h2>Gamepasses</h2><p>Buy an upgrade without leaving {gameName}.</p></div><button className="icon-button" onClick={onClose} aria-label="Close gamepass shop"><X size={19}/></button></header>
      {message && <p className="panel-sub" role="status">{message}</p>}
      <div className="gamepass-shop-list">{passes.map(pass => <article className="gamepass-shop-item" key={pass.id}><div className="gamepass-shop-icon"><LockKeyhole size={20}/></div><div className="gamepass-shop-copy"><b>{pass.name}</b><small>{pass.detail}</small><span>{pass.effectType.replaceAll('_',' ')} · ×{pass.effectValue}</span></div><div className="gamepass-shop-action"><b><Coins size={13}/>{pass.price}</b><button className={owned.includes(pass.id) ? 'button-soft' : 'button-primary'} disabled={owned.includes(pass.id) || busy === pass.id} onClick={() => void purchase(pass)}>{owned.includes(pass.id) ? <><Check size={14}/> Owned</> : busy === pass.id ? 'Buying…' : 'Buy'}</button></div></article>)}</div>
      {!passes.length && !message && <p className="panel-sub">This game has no passes yet. The creator can add them in Doria Studio.</p>}
      <small className="fine-print">Purchases use virtual Starlits. Pass effects are applied by the Doria game runtime.</small>
    </section>
  </div>;
}
