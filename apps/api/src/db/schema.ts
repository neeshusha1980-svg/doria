import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [index('session_user_id_idx').on(table.userId)]
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('account_user_id_idx').on(table.userId)]
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  table => [index('verification_identifier_idx').on(table.identifier)]
);

export type AvatarLookJson = {
  body: string;
  accent: string;
  style: 'classic' | 'halo' | 'crown';
};

export type SceneItemJson = {
  kind: string;
  x: number;
  z: number;
  color: string;
};

export type UgcPartJson = {
  shape: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  ry: number;
};

export type NewsAttachmentJson = {
  name: string;
  type: string;
  dataUrl: string;
};

export const profiles = pgTable(
  'profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username'),
    displayName: text('display_name').notNull(),
    starlits: integer('starlits').notNull().default(250),
    trophies: jsonb('trophies').$type<string[]>().notNull().default(['first-steps']),
    bio: text('bio').default(''),
    plusActive: boolean('plus_active').notNull().default(false),
    equippedUgcId: text('equipped_ugc_id'),
    avatarLook: jsonb('avatar_look').$type<AvatarLookJson>().default({
      body: '#9b7bff',
      accent: '#7cebe5',
      style: 'classic',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    planUpdatedAt: timestamp('plan_updated_at', { withTimezone: true }),
  },
  table => [uniqueIndex('profiles_username_unique_idx').on(table.username)]
);

export const usernames = pgTable(
  'usernames',
  {
    normalizedUsername: text('normalized_username').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('usernames_user_id_unique_idx').on(table.userId)]
);

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    genre: text('genre').notNull(),
    description: text('description').notNull().default(''),
    creationMode: text('creation_mode').notNull().default('baseplate'),
    htmlCode: text('html_code').notNull().default(''),
    neoPrompt: text('neo_prompt').notNull().default(''),
    sceneData: jsonb('scene_data').$type<SceneItemJson[]>().notNull().default([]),
    creatorName: text('creator_name').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('published'),
    visibility: text('visibility').notNull().default('public'),
    isPrivate: boolean('is_private').notNull().default(false),
    memberIds: jsonb('member_ids').$type<string[]>().notNull().default([]),
    plays: integer('plays').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('games_owner_id_idx').on(table.ownerId),
    index('games_status_created_idx').on(table.status, table.createdAt),
    index('games_genre_idx').on(table.genre),
  ]
);

export const gameLikes = pgTable(
  'game_likes',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('game_likes_game_user_unique_idx').on(table.gameId, table.userId),
    index('game_likes_game_id_idx').on(table.gameId),
  ]
);

export const gamePlayReceipts = pgTable(
  'game_play_receipts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('game_play_receipts_user_game_day_idx').on(table.userId, table.gameId, table.day)]
);

export const gamePlaySessions = pgTable(
  'game_play_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  table => [index('game_play_sessions_user_game_idx').on(table.userId, table.gameId, table.status)]
);

export const gameCompletionReceipts = pgTable(
  'game_completion_receipts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('game_completion_receipts_user_game_idx').on(table.userId, table.gameId)]
);

export const gamepasses = pgTable(
  'gamepasses',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    game: text('game').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    detail: text('detail').notNull(),
    price: integer('price').notNull(),
    effectType: text('effect_type').notNull(),
    effectValue: doublePrecision('effect_value').notNull().default(1),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('gamepasses_game_id_idx').on(table.gameId)]
);

export const ownedGamepasses = pgTable(
  'owned_gamepasses',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    passId: text('pass_id')
      .notNull()
      .references(() => gamepasses.id, { onDelete: 'cascade' }),
    game: text('game').notNull(),
    gameId: text('game_id').notNull(),
    effectType: text('effect_type').notNull(),
    effectValue: doublePrecision('effect_value').notNull().default(1),
    price: integer('price').notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('owned_gamepasses_owner_pass_idx').on(table.ownerId, table.passId),
    index('owned_gamepasses_owner_game_idx').on(table.ownerId, table.gameId),
  ]
);

export const ugcItems = pgTable(
  'ugc_items',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    assetType: text('asset_type').notNull(),
    color: text('color').notNull(),
    price: integer('price').notNull(),
    modelData: jsonb('model_data').$type<UgcPartJson[]>().notNull().default([]),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    creatorName: text('creator_name').notNull(),
    status: text('status').notNull().default('approved'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('ugc_items_status_created_idx').on(table.status, table.createdAt)]
);

export const ownedUgc = pgTable(
  'owned_ugc',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => ugcItems.id, { onDelete: 'cascade' }),
    price: integer('price').notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('owned_ugc_owner_item_idx').on(table.ownerId, table.itemId)]
);

export const badgeDefinitions = pgTable(
  'badge_definitions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    gameId: text('game_id').default(''),
    artStyle: text('art_style').notNull().default('creator'),
    imagePath: text('image_path').notNull().default(''),
    creatorId: text('creator_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    creatorName: text('creator_name').notNull(),
    status: text('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('badge_definitions_game_status_idx').on(table.gameId, table.status)]
);

export const earnedBadges = pgTable(
  'earned_badges',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    badgeId: text('badge_id')
      .notNull()
      .references(() => badgeDefinitions.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull().default(''),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('earned_badges_owner_badge_idx').on(table.ownerId, table.badgeId)]
);

export const rewardClaims = pgTable(
  'reward_claims',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reward: integer('reward').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('reward_claims_user_id_idx').on(table.userId)]
);

export const taskRewardClaims = pgTable(
  'task_reward_claims',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    reward: integer('reward').notNull(),
    day: text('day').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('task_reward_claims_user_task_day_idx').on(table.userId, table.taskId, table.day)]
);

export const friends = pgTable(
  'friends',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    friendId: text('friend_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('friends_user_friend_idx').on(table.userId, table.friendId),
    index('friends_user_id_idx').on(table.userId),
  ]
);

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: text('id').primaryKey(),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fromUsername: text('from_username').notNull(),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toUsername: text('to_username').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  table => [
    index('friend_requests_to_status_idx').on(table.toUserId, table.status),
    index('friend_requests_from_status_idx').on(table.fromUserId, table.status),
  ]
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    id: text('id').primaryKey(),
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedUsername: text('blocked_username').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('user_blocks_blocker_blocked_idx').on(table.blockerId, table.blockedId),
    index('user_blocks_blocked_id_idx').on(table.blockedId),
  ]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('chat_messages_game_created_idx').on(table.gameId, table.createdAt)]
);

export const gamePlayers = pgTable(
  'game_players',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    lane: doublePrecision('lane').notNull().default(0),
    distance: doublePrecision('distance').notNull().default(0),
    jump: doublePrecision('jump').notNull().default(0),
    score: integer('score').notNull().default(0),
    status: text('status').notNull().default('lobby'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('game_players_game_status_updated_idx').on(table.gameId, table.status, table.updatedAt)]
);

export const moments = pgTable(
  'moments',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    caption: text('caption').notNull().default(''),
    videoPath: text('video_path').notNull().default(''),
    videoUrl: text('video_url').default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('moments_created_at_idx').on(table.createdAt)]
);

export const newsPosts = pgTable(
  'news_posts',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    text: text('text').notNull().default(''),
    attachments: jsonb('attachments').$type<NewsAttachmentJson[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('news_posts_created_at_idx').on(table.createdAt)]
);

export const contentReports = pgTable(
  'content_reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
  },
  table => [
    index('content_reports_status_created_idx').on(table.status, table.createdAt),
    index('content_reports_reporter_created_idx').on(table.reporterId, table.createdAt),
  ]
);

export const privacyRequests = pgTable(
  'privacy_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestType: text('request_type').notNull().default('account_deletion'),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
  },
  table => [index('privacy_requests_status_created_idx').on(table.status, table.createdAt)]
);

export const parentalInvites = pgTable(
  'parental_invites',
  {
    id: text('id').primaryKey(),
    childUserId: text('child_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    guardianEmail: text('guardian_email').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    guardianUserId: text('guardian_user_id'),
  },
  table => [index('parental_invites_child_status_idx').on(table.childUserId, table.status)]
);

export const parentalSettings = pgTable(
  'parental_settings',
  {
    childUserId: text('child_user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    guardianUserId: text('guardian_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    allowFriendRequests: boolean('allow_friend_requests').notNull().default(true),
    allowMoments: boolean('allow_moments').notNull().default(true),
    allowChat: boolean('allow_chat').notNull().default(false),
    allowAi: boolean('allow_ai').notNull().default(true),
    dailyLimit: integer('daily_limit').notNull().default(90),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('parental_settings_guardian_idx').on(table.guardianUserId)]
);

export const safetyProfiles = pgTable('safety_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('disabled'),
  supervisedAccess: boolean('supervised_access').notNull().default(false),
  approvedByGuardian: text('approved_by_guardian'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    plusCreditsUsed: integer('plus_credits_used').notNull().default(0),
    freePromptsUsed: integer('free_prompts_used').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('ai_usage_user_period_idx').on(table.userId, table.period)]
);

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: text('id').primaryKey(),
    adminUserId: text('admin_user_id').notNull(),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('admin_audit_logs_created_idx').on(table.createdAt),
    index('admin_audit_logs_admin_idx').on(table.adminUserId),
  ]
);
