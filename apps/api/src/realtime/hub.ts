import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { Redis } from 'ioredis';
import {
  canAccessGameRoom,
  ensureSafetyProfile,
  getParentalSettingsForChild,
  isBlockedEitherWay,
} from '../auth/guards.js';
import { env } from '../config/env.js';

type ClientConnection = {
  connectionId: string;
  userId: string;
  socket: WebSocket;
  subscriptions: Set<string>;
};

const REDIS_CHANNEL = 'doria:realtime:events';
const MAX_CONNECTIONS_PER_USER = 5;

export class RealtimeHub {
  private connections = new Map<string, ClientConnection>();
  private userConnections = new Map<string, Set<string>>();
  private roomMembers = new Map<string, Set<string>>();
  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;

  constructor() {
    if (env.REDIS_URL) {
      try {
        this.redisPub = new Redis(env.REDIS_URL, { lazyConnect: true });
        this.redisSub = new Redis(env.REDIS_URL, { lazyConnect: true });
        void this.initRedis();
      } catch (err) {
        console.warn('[realtime] Redis initialization skipped, using local memory hub:', err);
      }
    }
  }

  private async initRedis(): Promise<void> {
    if (!this.redisPub || !this.redisSub) return;
    await Promise.all([this.redisPub.connect(), this.redisSub.connect()]);
    await this.redisSub.subscribe(REDIS_CHANNEL);
    this.redisSub.on('message', (_channel: string, raw: string) => {
      try {
        const event = JSON.parse(raw) as {
          entityType: 'chat' | 'game';
          entityId: string;
          payload: unknown;
          excludeConnectionId?: string;
        };
        void this.deliverLocally(
          event.entityType,
          event.entityId,
          event.payload,
          event.excludeConnectionId
        );
      } catch {
        // Ignore malformed pub/sub messages
      }
    });
  }

  registerConnection(userId: string, socket: WebSocket): string {
    const existingSet = this.userConnections.get(userId);
    if (existingSet && existingSet.size >= MAX_CONNECTIONS_PER_USER) {
      const oldestId = existingSet.values().next().value;
      if (oldestId) {
        const oldest = this.connections.get(oldestId);
        try {
          oldest?.socket.close(4429, 'Connection limit exceeded');
        } catch {
          // Ignore close errors
        }
        this.removeConnection(oldestId);
      }
    }

    const connectionId = `conn_${randomUUID().replace(/-/g, '')}`;
    const entry: ClientConnection = {
      connectionId,
      userId,
      socket,
      subscriptions: new Set(),
    };
    this.connections.set(connectionId, entry);

    let userSet = this.userConnections.get(userId);
    if (!userSet) {
      userSet = new Set();
      this.userConnections.set(userId, userSet);
    }
    userSet.add(connectionId);

    socket.send(
      JSON.stringify({
        v: 1,
        type: 'system.connected',
        payload: { connection_id: connectionId },
      })
    );

    socket.on('message', raw => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string };
        if (msg?.type === 'ping') {
          socket.send(JSON.stringify({ v: 1, type: 'pong', payload: { ts: Date.now() } }));
        }
      } catch {
        // Ignore non-JSON frames
      }
    });

    socket.on('close', () => {
      this.removeConnection(connectionId);
    });

    socket.on('error', () => {
      this.removeConnection(connectionId);
    });

    return connectionId;
  }

  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    for (const roomKey of conn.subscriptions) {
      const members = this.roomMembers.get(roomKey);
      if (members) {
        members.delete(connectionId);
        if (members.size === 0) this.roomMembers.delete(roomKey);
      }
    }
    const userSet = this.userConnections.get(conn.userId);
    if (userSet) {
      userSet.delete(connectionId);
      if (userSet.size === 0) this.userConnections.delete(conn.userId);
    }
    this.connections.delete(connectionId);
  }

  subscribe(
    entityType: 'chat' | 'game',
    entityId: string,
    connectionId: string,
    ownerUserId: string
  ): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;
    if (conn.userId !== ownerUserId) return false;

    const roomKey = `${entityType}:${entityId}`;
    conn.subscriptions.add(roomKey);
    let members = this.roomMembers.get(roomKey);
    if (!members) {
      members = new Set();
      this.roomMembers.set(roomKey, members);
    }
    members.add(connectionId);
    return true;
  }

  unsubscribe(
    entityType: 'chat' | 'game',
    entityId: string,
    connectionId: string,
    ownerUserId: string
  ): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.userId !== ownerUserId) return false;

    const roomKey = `${entityType}:${entityId}`;
    conn.subscriptions.delete(roomKey);
    const members = this.roomMembers.get(roomKey);
    if (members) {
      members.delete(connectionId);
      if (members.size === 0) this.roomMembers.delete(roomKey);
    }
    return true;
  }

  async notifySubscribers(
    entityType: 'chat' | 'game',
    entityId: string,
    payload: unknown,
    excludeConnectionId?: string
  ): Promise<void> {
    if (this.redisPub && this.redisPub.status === 'ready') {
      await this.redisPub.publish(
        REDIS_CHANNEL,
        JSON.stringify({ entityType, entityId, payload, excludeConnectionId })
      );
      return;
    }
    await this.deliverLocally(entityType, entityId, payload, excludeConnectionId);
  }

  private async isRecipientPermitted(
    entityType: 'chat' | 'game',
    recipientUserId: string
  ): Promise<boolean> {
    const safety = await ensureSafetyProfile(recipientUserId);
    if (!['standard', 'active'].includes(safety.status)) return false;

    const parental = await getParentalSettingsForChild(recipientUserId);
    if (entityType === 'chat') {
      return parental?.allowChat === true;
    }
    return (
      safety.status === 'active' &&
      safety.supervisedAccess === true &&
      Boolean(parental?.guardianUserId)
    );
  }

  private async deliverLocally(
    entityType: 'chat' | 'game',
    entityId: string,
    payload: unknown,
    excludeConnectionId?: string
  ): Promise<void> {
    const roomKey = `${entityType}:${entityId}`;
    const memberIds = this.roomMembers.get(roomKey);
    if (!memberIds || memberIds.size === 0) return;

    const payloadRecord =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const playerRecord =
      payloadRecord.player && typeof payloadRecord.player === 'object'
        ? (payloadRecord.player as Record<string, unknown>)
        : {};
    const actorId = String(
      payloadRecord.ownerId || payloadRecord.userId || playerRecord.userId || ''
    );

    const frame = JSON.stringify({
      v: 1,
      type: 'entity.update',
      payload: {
        entity_type: entityType,
        entity_id: entityId,
        data: payload,
      },
    });

    await Promise.all(
      Array.from(memberIds).map(async connectionId => {
        if (connectionId === excludeConnectionId) return;
        const conn = this.connections.get(connectionId);
        if (!conn || conn.socket.readyState !== 1) return;

        const allowed =
          (await this.isRecipientPermitted(entityType, conn.userId)) &&
          (await canAccessGameRoom(entityId, conn.userId)) &&
          (!actorId || !(await isBlockedEitherWay(actorId, conn.userId)));

        if (allowed && conn.socket.readyState === 1) {
          conn.socket.send(frame);
        }
      })
    );
  }

  async close(): Promise<void> {
    for (const conn of this.connections.values()) {
      try {
        conn.socket.close();
      } catch {
        // Ignore close errors
      }
    }
    this.connections.clear();
    this.userConnections.clear();
    this.roomMembers.clear();
    if (this.redisPub) await this.redisPub.quit();
    if (this.redisSub) await this.redisSub.quit();
  }
}

export const realtimeHub = new RealtimeHub();
