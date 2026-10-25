// All tunable settings in one place. Override any of them in .env
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 3000),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  adminToken: process.env.ADMIN_TOKEN || '',

  idleSeconds: num(process.env.IDLE_SECONDS, 300),          // 5 min idle -> auto logout + hard delete
  disconnectGraceSeconds: num(process.env.DISCONNECT_GRACE_SECONDS, 120), // tab closed / network lost
  sweepIntervalMs: num(process.env.SWEEP_INTERVAL_MS, 10000),
  diffFlushMs: num(process.env.DIFF_FLUSH_MS, 1000),        // batch user-list updates

  maxMessageLength: 500,
  maxHistory: 200,                                          // messages kept per conversation
  orphanTtlSeconds: 86400,                                  // safety net for leftover keys
  reportTtlSeconds: num(process.env.REPORT_TTL_SECONDS, 7 * 86400),

  // rate limits (sliding window, per user)
  msgLimit: { count: 5, windowMs: 3000 },
  searchLimit: { count: 10, windowMs: 10000 },
  newChatLimit: { count: 15, windowMs: 60000 },             // new people messaged per minute
  strikesBeforeMute: 5,
  muteSeconds: 60,

  // owner stats (admin panel → Stats). A "day" starts at midnight in this time zone.
  statsTimeZone: process.env.STATS_TIMEZONE || 'Asia/Colombo',
  statsKeepDays: 90,

  // Moderation history (login records, reports, bans), kept for historyKeepDays.
  // DATABASE_URL=postgres://… -> PostgreSQL (e.g. installed with aaPanel)
  // empty -> built-in PGlite (real PostgreSQL inside Node) saved in server/data/history
  // memory -> PGlite in memory (tests; lost on restart)
  databaseUrl: process.env.DATABASE_URL || '',
  historyKeepDays: num(process.env.HISTORY_KEEP_DAYS, 365),

  // group chats
  groupMaxMembers: 10,
  groupMaxCreated: 2,                                       // groups one person can be admin of
  groupMaxJoined: 5,                                        // groups one person can be in at once

  blockLinks: process.env.BLOCK_LINKS !== 'false',
};
