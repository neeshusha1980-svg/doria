import { db } from '@appdeploy/sdk';

type GameAccessRecord = {
  ownerId?: string;
  visibility?: string;
  isPrivate?: boolean;
  memberIds?: string[];
};

export async function canAccessGameRoom(gameId: string, userId: string): Promise<boolean> {
  const [game] = await db.get<GameAccessRecord & { status?: string }>('games', [gameId], { consistent: true });
  if (!game || (game.status && !['approved', 'published'].includes(String(game.status).toLowerCase()))) return false;

  const isPrivate = game.isPrivate === true || String(game.visibility || '').toLowerCase() === 'private';
  if (!isPrivate) return true;

  if (game.ownerId === userId) return true;
  return Array.isArray(game.memberIds) && game.memberIds.includes(userId);
}
