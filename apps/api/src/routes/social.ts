import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  friendRequests,
  friends,
  moments,
  newsPosts,
  parentalSettings,
  profiles,
  userBlocks,
  usernames,
  type NewsAttachmentJson,
} from '../db/schema.js';
import { getParentalSettingsForChild, isBlockedEitherWay, requireAuth, requireGuardianPermission, requireSafety, safeId } from '../auth/guards.js';
import { getOrCreateProfile } from '../services/profiles.js';
import type { StorageAdapter } from '../storage/s3.js';

function usernameFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
}

export async function registerSocialRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  rateLimitEnabled = false
) {
  // --- Blocks ---
  app.get('/api/blocks', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const rows = await db
      .select()
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, user.userId))
      .orderBy(desc(userBlocks.createdAt));

    return reply.send({
      blockedUsers: rows.map(row => ({
        userId: row.blockedId,
        username: row.blockedUsername,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.post('/api/blocks', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const targetId =
      typeof (request.body as { userId?: unknown } | null)?.userId === 'string'
        ? String((request.body as { userId: string }).userId).slice(0, 120)
        : '';

    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(targetId) || targetId === user.userId) {
      return reply.code(400).send({ error: 'Choose a valid player to block.' });
    }

    const [target] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, targetId))
      .limit(1);

    if (!target) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    const id = safeId(`block_${user.userId}_${targetId}`);
    const blockedUsername = target.username || target.displayName;

    await db.transaction(async tx => {
      await tx
        .insert(userBlocks)
        .values({
          id,
          blockerId: user.userId,
          blockedId: targetId,
          blockedUsername,
        })
        .onConflictDoNothing();

      await tx
        .delete(friends)
        .where(
          or(
            and(eq(friends.userId, user.userId), eq(friends.friendId, targetId)),
            and(eq(friends.userId, targetId), eq(friends.friendId, user.userId))
          )
        );

      await tx
        .delete(friendRequests)
        .where(
          and(
            eq(friendRequests.status, 'pending'),
            or(
              and(
                eq(friendRequests.fromUserId, user.userId),
                eq(friendRequests.toUserId, targetId)
              ),
              and(
                eq(friendRequests.fromUserId, targetId),
                eq(friendRequests.toUserId, user.userId)
              )
            )
          )
        );
    });

    return reply.send({ blocked: true, userId: targetId, username: blockedUsername });
  });

  app.delete(
    '/api/blocks/:userId',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { userId?: string };
      const targetId = String(params.userId || '').slice(0, 120);
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(targetId)) {
        return reply.code(400).send({ error: 'Invalid player id.' });
      }

      await db
        .delete(userBlocks)
        .where(and(eq(userBlocks.blockerId, user.userId), eq(userBlocks.blockedId, targetId)));

      return reply.send({ unblocked: true, userId: targetId });
    }
  );

  // --- Friends & Friend Requests ---
  app.get('/api/friends', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const [friendRows, incomingRows, outgoingRows] = await Promise.all([
      db.select().from(friends).where(eq(friends.userId, user.userId)),
      db
        .select()
        .from(friendRequests)
        .where(and(eq(friendRequests.toUserId, user.userId), eq(friendRequests.status, 'pending'))),
      db
        .select()
        .from(friendRequests)
        .where(
          and(eq(friendRequests.fromUserId, user.userId), eq(friendRequests.status, 'pending'))
        ),
    ]);

    const visibleFriends: Array<{ id: string; userId: string; username: string }> = [];
    const incomingRequests: Array<{
      id: string;
      userId: string;
      username: string;
      createdAt: string;
    }> = [];
    const outgoingRequests: Array<{
      id: string;
      userId: string;
      username: string;
      createdAt: string;
    }> = [];

    for (const row of friendRows) {
      if (!(await isBlockedEitherWay(user.userId, row.friendId))) {
        visibleFriends.push({ id: row.id, userId: row.friendId, username: row.username });
      }
    }
    for (const row of incomingRows) {
      if (!(await isBlockedEitherWay(user.userId, row.fromUserId))) {
        incomingRequests.push({
          id: row.id,
          userId: row.fromUserId,
          username: row.fromUsername,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }
    for (const row of outgoingRows) {
      if (!(await isBlockedEitherWay(user.userId, row.toUserId))) {
        outgoingRequests.push({
          id: row.id,
          userId: row.toUserId,
          username: row.toUsername,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }

    return reply.send({ friends: visibleFriends, incomingRequests, outgoingRequests });
  });

  app.post('/api/friends', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const [myParentSettings] = await db
      .select()
      .from(parentalSettings)
      .where(eq(parentalSettings.childUserId, user.userId))
      .limit(1);

    if (myParentSettings?.allowFriendRequests === false) {
      return reply.code(403).send({ error: 'Your guardian has disabled friend requests.' });
    }

    const username = usernameFrom((request.body as { username?: unknown } | null)?.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return reply.code(400).send({ error: 'Enter a valid username.' });
    }

    const [targetEntry] = await db
      .select()
      .from(usernames)
      .where(eq(usernames.normalizedUsername, username.toLowerCase()))
      .limit(1);

    if (!targetEntry) {
      return reply.code(404).send({ error: 'User not found' });
    }
    if (targetEntry.userId === user.userId) {
      return reply.code(400).send({ error: 'You cannot add yourself as a friend.' });
    }

    const [myProfile, targetProfile] = await Promise.all([
      getOrCreateProfile(user.userId, user.name),
      db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, targetEntry.userId))
        .limit(1)
        .then(r => r[0]),
    ]);

    if (!targetProfile) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (await isBlockedEitherWay(user.userId, targetEntry.userId)) {
      return reply.code(403).send({
        error: 'This friend request is unavailable because one of these accounts has blocked the other.',
      });
    }

    const mineId = safeId(`friend_${user.userId}_${targetEntry.userId}`);
    const [already] = await db.select().from(friends).where(eq(friends.id, mineId)).limit(1);
    if (already) {
      return reply.send({
        added: false,
        message: 'Already friends',
        friend: { username: targetProfile.username },
      });
    }

    const [targetSettings] = await db
      .select()
      .from(parentalSettings)
      .where(eq(parentalSettings.childUserId, targetEntry.userId))
      .limit(1);

    if (targetSettings?.allowFriendRequests === false) {
      return reply.code(403).send({ error: 'This player is not accepting friend requests.' });
    }

    const requestId = safeId(`friend_request_${user.userId}_${targetEntry.userId}`);
    const [existing] = await db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId))
      .limit(1);

    if (existing?.status === 'pending') {
      return reply.send({ requested: false, message: 'Friend request already pending.' });
    }
    if (existing?.status === 'accepted') {
      return reply.send({
        added: false,
        message: 'Already friends',
        friend: { username: targetProfile.username },
      });
    }

    const reverseId = safeId(`friend_request_${targetEntry.userId}_${user.userId}`);
    const [reverse] = await db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, reverseId))
      .limit(1);

    if (reverse?.status === 'pending') {
      return reply.code(409).send({
        error: 'This player has already sent you a request. Accept it in your incoming requests.',
      });
    }

    const fromUsername = myProfile.username || myProfile.displayName;
    const toUsername = targetProfile.username || targetProfile.displayName;

    if (existing && existing.status === 'declined') {
      await db
        .update(friendRequests)
        .set({
          fromUsername,
          toUsername,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: null,
        })
        .where(eq(friendRequests.id, requestId));
    } else {
      await db
        .insert(friendRequests)
        .values({
          id: requestId,
          fromUserId: user.userId,
          fromUsername,
          toUserId: targetEntry.userId,
          toUsername,
          status: 'pending',
        })
        .onConflictDoNothing();
    }

    return reply.code(201).send({
      requested: true,
      request: { id: requestId, username: toUsername },
    });
  });

  app.put(
    '/api/friend-requests/:id',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const action = (request.body as { action?: unknown } | null)?.action;
      if (action !== 'accept' && action !== 'decline') {
        return reply.code(400).send({ error: 'Choose accept or decline.' });
      }

      const id = String(params.id || '').slice(0, 120);
      const [reqRow] = await db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.id, id))
        .limit(1);

      if (!reqRow || reqRow.toUserId !== user.userId) {
        return reply.code(404).send({ error: 'Friend request not found.' });
      }
      if (reqRow.status !== 'pending') {
        return reply.code(409).send({ error: 'This friend request has already been handled.' });
      }
      if (await isBlockedEitherWay(user.userId, reqRow.fromUserId)) {
        return reply.code(403).send({
          error: 'This request cannot be accepted because one account has blocked the other.',
        });
      }

      if (action === 'decline') {
        const updated = await db
          .update(friendRequests)
          .set({ status: 'declined', updatedAt: new Date() })
          .where(
            and(
              eq(friendRequests.id, id),
              eq(friendRequests.toUserId, user.userId),
              eq(friendRequests.status, 'pending')
            )
          )
          .returning();

        if (updated.length === 0) {
          return reply
            .code(409)
            .send({ error: 'Request could not be declined. Refresh and try again.' });
        }
        return reply.send({ declined: true, requestId: id });
      }

      const [receiverParental, senderParental] = await Promise.all([
        getParentalSettingsForChild(user.userId),
        getParentalSettingsForChild(reqRow.fromUserId),
      ]);
      if (receiverParental?.allowFriendRequests === false) {
        return reply.code(403).send({ error: 'Your guardian has disabled friend requests.' });
      }
      if (senderParental?.allowFriendRequests === false) {
        return reply.code(403).send({ error: 'The other player is no longer permitted to add friends.' });
      }

      const [sender] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, reqRow.fromUserId))
        .limit(1);
      const [receiver] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, reqRow.toUserId))
        .limit(1);

      if (!sender || !receiver) {
        return reply.code(404).send({ error: 'A player profile is no longer available.' });
      }

      const senderFriendId = safeId(`friend_${reqRow.fromUserId}_${reqRow.toUserId}`);
      const receiverFriendId = safeId(`friend_${reqRow.toUserId}_${reqRow.fromUserId}`);

      await db.transaction(async tx => {
        const updated = await tx
          .update(friendRequests)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(
            and(
              eq(friendRequests.id, id),
              eq(friendRequests.toUserId, user.userId),
              eq(friendRequests.status, 'pending')
            )
          )
          .returning();

        if (updated.length === 0) {
          throw Object.assign(new Error('ALREADY_HANDLED'), { code: 'ALREADY_HANDLED' });
        }

        await tx
          .insert(friends)
          .values({
            id: senderFriendId,
            userId: reqRow.fromUserId,
            friendId: reqRow.toUserId,
            username: receiver.username || receiver.displayName,
          })
          .onConflictDoNothing();

        await tx
          .insert(friends)
          .values({
            id: receiverFriendId,
            userId: reqRow.toUserId,
            friendId: reqRow.fromUserId,
            username: sender.username || sender.displayName,
          })
          .onConflictDoNothing();
      });

      return reply.send({
        accepted: true,
        friend: {
          userId: reqRow.fromUserId,
          username: sender.username || sender.displayName,
        },
      });
    }
  );

  // --- Doria Moments ---
  app.get('/api/moments', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const rows = await db
      .select()
      .from(moments)
      .orderBy(desc(moments.createdAt))
      .limit(100);

    const allowed: typeof rows = [];
    for (const row of rows) {
      if (
        (row.videoPath || row.videoUrl) &&
        (row.ownerId === user.userId || !(await isBlockedEitherWay(user.userId, row.ownerId)))
      ) {
        allowed.push(row);
      }
    }

    const paths = allowed.map(row => row.videoPath).filter(Boolean);
    const urlByPath = await storage.getSignedReadUrls(paths);

    const hydrated = allowed
      .map(row => ({
        id: row.id,
        ownerId: row.ownerId,
        username: row.username,
        caption: row.caption,
        videoUrl: row.videoPath ? urlByPath.get(row.videoPath) || '' : row.videoUrl || '',
        createdAt: row.createdAt.toISOString(),
      }))
      .filter(row => Boolean(row.videoUrl));

    return reply.send({ moments: hydrated });
  });

  app.post(
    '/api/moments',
    {
      preHandler: [
        requireAuth,
        requireSafety,
        requireGuardianPermission('allowMoments', 'Your guardian has disabled Doria Moments posting.'),
      ],
      config: rateLimitEnabled ? { rateLimit: { max: 15, timeWindow: '1 minute' } } : undefined,
    },
    async (request, reply) => {
    const user = request.doriaUser!;
    const [parentRow] = await db
      .select()
      .from(parentalSettings)
      .where(eq(parentalSettings.childUserId, user.userId))
      .limit(1);

    if (parentRow?.allowMoments === false) {
      return reply.code(403).send({ error: 'Your guardian has disabled Doria Moments posting.' });
    }

    const input = (request.body || {}) as {
      videoBase64?: unknown;
      contentType?: unknown;
      caption?: unknown;
    };
    const videoBase64 = typeof input.videoBase64 === 'string' ? input.videoBase64 : '';
    const contentType = typeof input.contentType === 'string' ? input.contentType : '';
    const caption = typeof input.caption === 'string' ? input.caption.trim() : '';
    const allowedTypes: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
    };

    if (!allowedTypes[contentType]) {
      return reply.code(400).send({ error: 'Upload an MP4, WebM or OGG video file.' });
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(videoBase64)) {
      return reply
        .code(400)
        .send({ error: 'The selected video file could not be read. Please choose it again.' });
    }
    const estimatedBytes = Math.floor((videoBase64.length * 3) / 4);
    if (!videoBase64 || estimatedBytes > 7 * 1024 * 1024) {
      return reply.code(413).send({ error: 'Videos must be 7 MB or smaller.' });
    }
    if (caption.length > 180) {
      return reply.code(400).send({ error: 'Caption must be 180 characters or fewer.' });
    }

    const profile = await getOrCreateProfile(user.userId, user.name);
    const videoPath = `moments/${user.userId}/${randomBytes(16).toString('hex')}.${
      allowedTypes[contentType]
    }`;

    const uploaded = await storage.uploadBase64({
      key: videoPath,
      base64Content: videoBase64,
      contentType,
    });
    if (!uploaded) {
      return reply.code(503).send({ error: 'Video upload failed. Please try again.' });
    }

    const id = `moment_${randomUUID().replace(/-/g, '')}`;
    const username = profile.username || profile.displayName;
    try {
      const [created] = await db
        .insert(moments)
        .values({
          id,
          ownerId: user.userId,
          username,
          caption,
          videoPath,
        })
        .returning();

      if (!created) throw new Error('Moment insert failed');

      const signedUrl = await storage.getSignedReadUrl(videoPath);
      if (!signedUrl) throw new Error('Video signed URL failed');

      return reply.code(201).send({
        moment: {
          id: created.id,
          ownerId: created.ownerId,
          username: created.username,
          caption: created.caption,
          videoUrl: signedUrl,
          createdAt: created.createdAt.toISOString(),
        },
      });
    } catch {
      await storage.deleteKeys([videoPath]);
      return reply
        .code(503)
        .send({ error: 'Video Moment could not be published. Please try again.' });
    }
  });

  // --- News ---
  app.get('/api/news', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const rows = await db
      .select()
      .from(newsPosts)
      .orderBy(desc(newsPosts.createdAt))
      .limit(100);

    const visible = [];
    for (const row of rows) {
      if (row.ownerId === user.userId || !(await isBlockedEitherWay(user.userId, row.ownerId))) {
        visible.push({
          id: row.id,
          ownerId: row.ownerId,
          username: row.username,
          text: row.text,
          attachments: row.attachments,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }

    return reply.send({ posts: visible });
  });

  app.post('/api/news', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const input = (request.body || {}) as { text?: unknown; attachments?: unknown };
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const allowedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
    ]);

    const attachments: NewsAttachmentJson[] = Array.isArray(input.attachments)
      ? input.attachments
          .filter((item: unknown): item is NewsAttachmentJson => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
            const file = item as Record<string, unknown>;
            return (
              typeof file.name === 'string' &&
              file.name.length <= 100 &&
              typeof file.type === 'string' &&
              allowedTypes.has(file.type) &&
              typeof file.dataUrl === 'string' &&
              file.dataUrl.length <= 70000 &&
              file.dataUrl.startsWith(`data:${file.type};base64,`)
            );
          })
          .slice(0, 2)
      : [];

    const attachmentBytes = attachments.reduce((sum, item) => sum + item.dataUrl.length, 0);
    if (text.length > 500 || (!text && attachments.length === 0) || attachmentBytes > 140000) {
      return reply.code(400).send({
        error: 'Add text or up to two small supported attachments (140 KB total).',
      });
    }

    const profile = await getOrCreateProfile(user.userId, user.name);
    const id = `news_${randomUUID().replace(/-/g, '')}`;
    const username = profile.username || profile.displayName;
    const [created] = await db
      .insert(newsPosts)
      .values({
        id,
        ownerId: user.userId,
        username,
        text,
        attachments,
      })
      .returning();

    if (!created) {
      return reply.code(503).send({ error: 'Could not publish the news post.' });
    }

    return reply.code(201).send({
      post: {
        id: created.id,
        ownerId: created.ownerId,
        username: created.username,
        text: created.text,
        attachments: created.attachments,
        createdAt: created.createdAt.toISOString(),
      },
    });
  });
}
