type MessageHandler = (message: any) => void;
type VoidHandler = () => void;

function resolveWsUrl(): string {
  const configured = (import.meta.env.VITE_WS_URL || '').trim();
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export const ws = {
  connect() {
    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let resolveReady: (() => void) | null = null;
    const messageHandlers = new Set<MessageHandler>();
    const errorHandlers = new Set<VoidHandler>();
    const closeHandlers = new Set<VoidHandler>();

    const connection = {
      connectionId: '',
      ready: new Promise<void>(resolve => {
        resolveReady = resolve;
      }),
      onMessage(handler: MessageHandler) {
        messageHandlers.add(handler);
      },
      onError(handler: VoidHandler) {
        errorHandlers.add(handler);
      },
      onClose(handler: VoidHandler) {
        closeHandlers.add(handler);
      },
      disconnect() {
        closed = true;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        if (pingTimer) window.clearInterval(pingTimer);
        socket?.close();
      },
    };

    const openSocket = () => {
      if (closed) return;
      socket = new WebSocket(resolveWsUrl());

      socket.onopen = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      socket.onmessage = event => {
        try {
          const parsed = JSON.parse(String(event.data));
          if (parsed?.type === 'system.connected' && parsed?.payload?.connection_id) {
            connection.connectionId = String(parsed.payload.connection_id);
            reconnectAttempts = 0;
            resolveReady?.();
            resolveReady = null;
            return;
          }
          if (parsed?.type === 'pong') return;
          messageHandlers.forEach(handler => handler(parsed));
        } catch {
          // Ignore malformed frames
        }
      };

      socket.onerror = () => {
        errorHandlers.forEach(handler => handler());
      };

      socket.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        closeHandlers.forEach(handler => handler());
        if (!closed && reconnectAttempts < 5) {
          reconnectAttempts += 1;
          reconnectTimer = window.setTimeout(openSocket, Math.min(5000, reconnectAttempts * 1000));
        }
      };
    };

    openSocket();
    return connection;
  },
};
