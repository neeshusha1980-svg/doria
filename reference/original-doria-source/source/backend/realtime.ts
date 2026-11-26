import { removeSubscriptionsByConnection } from './realtime-subscribers';

type RealtimeEvent = {
  body?: string | null;
};

type RealtimeMessage = {
  type?: string;
  payload?: {
    connection_id?: string;
  };
};

export const realtime = async (event: RealtimeEvent) => {
  let message: RealtimeMessage = {};
  try {
    const parsed: unknown = JSON.parse(event.body || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      message = parsed as RealtimeMessage;
    }
  } catch {
    return { statusCode: 200 };
  }

  if (message.type === 'system.disconnected') {
    const connectionId = message.payload?.connection_id;
    if (connectionId) {
      await removeSubscriptionsByConnection(connectionId);
    }
  }

  return { statusCode: 200 };
};
