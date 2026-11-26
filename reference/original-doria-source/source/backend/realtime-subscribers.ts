import { db, ws, json, error, requireAuth } from '@appdeploy/sdk';
import { canAccessGameRoom } from './room-access';

const SUBSCRIPTIONS_TABLE = 'entity_subscriptions';

export type SubscriptionRecord = {
  id: string;
  entity_type: string;
  entity_id: string;
  connection_id: string;
  created_at: number;
  owner_user_id: string;
};

async function requireSafety({ user }: { user?: { userId: string } }) {
  if (!user) return error('Sign in required.', 401);
  const [safety] = await db.get<{ status: string; supervisedAccess?: boolean }>(
    'safety_profiles',
    [user.userId],
    { consistent: true }
  );
  if (!safety || safety.status !== 'active' || safety.supervisedAccess !== true) {
    return error('Multiplayer is locked until a linked guardian enables supervised access.', 403);
  }
}

async function listSubscriptions(): Promise<SubscriptionRecord[]> {
  const { items } = await db.list(SUBSCRIPTIONS_TABLE, { limit: 500 });
  return items as SubscriptionRecord[];
}

async function isBlockedBetween(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const idA = ('block_' + userA + '_' + userB).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const idB = ('block_' + userB + '_' + userA).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const [a, b] = await Promise.all([
    db.get<{ id: string }>('user_blocks', [idA], { consistent: true }),
    db.get<{ id: string }>('user_blocks', [idB], { consistent: true }),
  ]);
  return Boolean(a[0] || b[0]);
}

export async function removeSubscriptionsByConnection(connectionId: string) {
  const items = await listSubscriptions();
  const matchIds = items
    .filter(item => item.connection_id === connectionId)
    .map(item => item.id);

  if (matchIds.length > 0) {
    await db.delete(SUBSCRIPTIONS_TABLE, matchIds);
  }
}

export async function addSubscription(
  entityType: string,
  entityId: string,
  connectionId: string,
  ownerUserId: string
): Promise<boolean> {
  const items = await listSubscriptions();
  const existingConnection = items.find(item => item.connection_id === connectionId);

  if (existingConnection && existingConnection.owner_user_id !== ownerUserId) {
    return false;
  }

  const existingSubscription = items.find(item =>
    item.entity_type === entityType &&
    item.entity_id === entityId &&
    item.connection_id === connectionId &&
    item.owner_user_id === ownerUserId
  );
  if (existingSubscription) return true;

  const [createdId] = await db.add(SUBSCRIPTIONS_TABLE, [{
    entity_type: entityType,
    entity_id: entityId,
    connection_id: connectionId,
    owner_user_id: ownerUserId,
    created_at: Date.now(),
  }]);

  return Boolean(createdId);
}

export async function removeSubscriptions(
  entityType: string,
  entityId: string,
  connectionId: string,
  ownerUserId: string
) {
  const items = await listSubscriptions();
  const matchIds = items
    .filter(item =>
      item.entity_type === entityType &&
      item.entity_id === entityId &&
      item.connection_id === connectionId &&
      item.owner_user_id === ownerUserId
    )
    .map(item => item.id);

  if (matchIds.length > 0) {
    await db.delete(SUBSCRIPTIONS_TABLE, matchIds);
  }
}

export async function notifySubscribers(
  entityType: string,
  entityId: string,
  payload: unknown,
  excludeConnectionId?: string
) {
  const items = await listSubscriptions();
  const roomSubscriptions = items.filter(item =>
    item.entity_type === entityType &&
    item.entity_id === entityId &&
    item.connection_id !== excludeConnectionId
  );

  const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const playerRecord = payloadRecord.player && typeof payloadRecord.player === 'object' ? payloadRecord.player as Record<string, unknown> : {};
  const actorId = String(payloadRecord.ownerId || payloadRecord.userId || playerRecord.userId || '');
  const authorised = await Promise.all(roomSubscriptions.map(async item => ({
    item,
    allowed: (entityType === 'chat' || entityType === 'game')
      && await canAccessGameRoom(entityId, item.owner_user_id)
      && (!actorId || !(await isBlockedBetween(actorId, item.owner_user_id))),
  })));

  const targetConnectionIds = Array.from(new Set(
    authorised
      .filter(entry => entry.allowed)
      .map(entry => entry.item.connection_id)
  ));

  if (targetConnectionIds.length === 0) return;

  await ws.send(targetConnectionIds, {
    v: 1,
    type: 'entity.update',
    payload: {
      entity_type: entityType,
      entity_id: entityId,
      data: payload,
    },
  });
}

export const realtimeSubscriptionRoutes = {
  'POST /api/subscriptions': [
    requireAuth(),
    requireSafety,
    async ({ body, user }) => {
      const { entity_type, entity_id, connection_id } = (body || {}) as Record<string, string>;
      if (
        !['chat', 'game'].includes(entity_type) ||
        typeof entity_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(entity_id) ||
        typeof connection_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,200}$/.test(connection_id)
      ) {
        return error('A valid game room and connection are required.', 400);
      }

      if (!(await canAccessGameRoom(entity_id, user!.userId))) {
        return error('You do not have access to this game room.', 403);
      }

      const added = await addSubscription(entity_type, entity_id, connection_id, user!.userId);
      if (!added) return error('This realtime connection is already registered to another account.', 409);

      return json({ ok: true });
    },
  ],

  'POST /api/subscriptions/remove': [
    requireAuth(),
    requireSafety,
    async ({ body, user }) => {
      const { entity_type, entity_id, connection_id } = (body || {}) as Record<string, string>;
      if (
        !['chat', 'game'].includes(entity_type) ||
        typeof entity_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(entity_id) ||
        typeof connection_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,200}$/.test(connection_id)
      ) {
        return error('A valid game room and connection are required.', 400);
      }

      await removeSubscriptions(entity_type, entity_id, connection_id, user!.userId);
      return json({ ok: true });
    },
  ],
};
