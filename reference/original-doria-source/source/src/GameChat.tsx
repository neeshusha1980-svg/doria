import { useEffect, useRef, useState } from 'react';
import { api, auth, ws } from '@appdeploy/client';
import { MessageCircle, Send, LogIn, LoaderCircle } from 'lucide-react';
import './GameChat.css';

type ChatMessage = { id: string; gameId: string; username: string; text: string; createdAt: string };
export default function GameChat({ gameId }: { gameId: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    auth.getUser().then(user => { if (active) setSignedIn(Boolean(user)); }).catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const connection = ws.connect();
    const append = (message: ChatMessage) => {
      if (!alive || !message?.id) return;
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message].slice(-60));
    };
    connection.onMessage(message => {
      const payload = message?.payload;
      if (message?.type === 'entity.update' && payload?.entity_type === 'chat' && payload?.entity_id === gameId) append(payload.data as ChatMessage);
    });
    (async () => {
      try {
        const result = await api.get('/api/chat?gameId=' + encodeURIComponent(gameId));
        if (alive) setMessages(Array.isArray(result.data?.messages) ? result.data.messages : []);
      } catch {
        if (alive) setNotice('Sign in to use game chat.');
      }
      try {
        await connection.ready;
        const connectionId = connection.connectionId;
        if (alive && connectionId) await api.post('/api/subscriptions', { entity_type: 'chat', entity_id: gameId, connection_id: connectionId });
      } catch {
        if (alive) setNotice('Live chat connection unavailable. You can still try sending a message.');
      }
    })();
    return () => {
      alive = false;
      if (connection.connectionId) void api.post('/api/subscriptions/remove', { entity_type: 'chat', entity_id: gameId, connection_id: connection.connectionId }).catch(() => {});
      connection.disconnect();
    };
  }, [gameId, signedIn]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages]);

  async function signIn() {
    try { await auth.signInWithRedirect(); }
    catch (error) {
      const code = (error as { code?: string }).code;
      setNotice(code === 'auth/storage-unavailable' ? 'Enable browser storage and retry sign-in.' : 'Sign-in could not start. Please try again.');
    }
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || busy) return;
    if (!signedIn) { setNotice('Sign in before chatting.'); return; }
    setBusy(true);
    try {
      const result = await api.post('/api/chat', { gameId, text: clean });
      const message = result.data?.message as ChatMessage;
      if (message) setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message].slice(-60));
      setText('');
      setNotice('');
    } catch { setNotice('Message could not be sent. Please try again.'); }
    finally { setBusy(false); }
  }

  return <section className="game-chat">
    <div className="game-chat-title"><MessageCircle size={15}/><b>In-game chat</b><span>{signedIn ? 'Live room' : 'Sign in required'}</span></div>
    {!signedIn ? <div className="game-chat-signin"><span>Sign in to chat with players in this world.</span><button onClick={signIn}><LogIn size={14}/> Sign in</button></div> : <>
      <div className="game-chat-messages" ref={listRef}>{messages.length ? messages.map(message => <p key={message.id}><b>{message.username}</b><span>{message.text}</span></p>) : <small className="game-chat-empty">No messages yet. Say hi to the room.</small>}</div>
      <form className="game-chat-form" onSubmit={sendMessage}><input aria-label="Chat message" value={text} onChange={event => setText(event.target.value)} maxLength={240} placeholder="Message this game..." /><button disabled={busy || !text.trim()} aria-label="Send message">{busy ? <LoaderCircle size={15} className="spin"/> : <Send size={15}/>}</button></form>
    </>}
    {notice && <small className="game-chat-notice">{notice}</small>}
  </section>;
}
