// Tiny in-memory stand-in for Redis, for LOCAL TESTING ONLY (REDIS_URL=memory).
// Implements just the commands this app uses, with the same behaviour as ioredis.
// Production must use real Redis (data here is lost on every restart).

export class MemoryRedis {
  constructor() {
    this.data = new Map();     // key -> { type, value }
    this.expiry = new Map();   // key -> epoch ms
    this.status = 'ready';
  }

  _alive(key) {
    const exp = this.expiry.get(key);
    if (exp !== undefined && exp <= Date.now()) { this.data.delete(key); this.expiry.delete(key); }
    return this.data.get(key);
  }
  _get(key, type, create) {
    let e = this._alive(key);
    if (!e && create) { e = { type, value: type === 'string' ? '' : type === 'list' ? [] : new Map() }; if (type === 'set') e.value = new Set(); this.data.set(key, e); }
    if (e && e.type !== type) throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    return e;
  }
  _cleanup(key) {
    const e = this.data.get(key);
    if (e && e.type !== 'string' && (e.value.size === 0 || e.value.length === 0)) { this.data.delete(key); this.expiry.delete(key); }
  }
  _match(pattern) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return [...this.data.keys()].filter(k => this._alive(k) && re.test(k));
  }

  async ping() { return 'PONG'; }
  async del(...keys) { let n = 0; for (const k of keys.flat()) { if (this._alive(k)) n++; this.data.delete(k); this.expiry.delete(k); } return n; }
  async expire(key, seconds) { if (!this._alive(key)) return 0; this.expiry.set(key, Date.now() + Number(seconds) * 1000); return 1; }
  async ttl(key) { if (!this._alive(key)) return -2; const e = this.expiry.get(key); return e === undefined ? -1 : Math.ceil((e - Date.now()) / 1000); }
  async keys(pattern) { return this._match(pattern); }
  async flushall() { this.data.clear(); this.expiry.clear(); return 'OK'; }
  async dbsize() { return this._match('*').length; }

  async set(key, value, ...opts) {
    const up = opts.map(o => String(o).toUpperCase());
    if (up.includes('NX') && this._alive(key)) return null;
    this.data.set(key, { type: 'string', value: String(value) });
    this.expiry.delete(key);
    const ex = up.indexOf('EX');
    if (ex !== -1) this.expiry.set(key, Date.now() + Number(opts[ex + 1]) * 1000);
    return 'OK';
  }
  async get(key) { const e = this._get(key, 'string'); return e ? e.value : null; }
  async mget(...keys) { return keys.flat().map(k => { const e = this._alive(k); return e && e.type === 'string' ? e.value : null; }); }

  async hset(key, ...args) {
    const obj = typeof args[0] === 'object' ? args[0] : Object.fromEntries(args.reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []));
    const h = this._get(key, 'hash', true).value;
    let added = 0;
    for (const [f, v] of Object.entries(obj)) { if (!h.has(f)) added++; h.set(f, String(v)); }
    return added;
  }
  async hgetall(key) { const e = this._get(key, 'hash'); return e ? Object.fromEntries(e.value) : {}; }
  async hget(key, f) { const e = this._get(key, 'hash'); return e && e.value.has(f) ? e.value.get(f) : null; }
  async hincrby(key, f, n) { const h = this._get(key, 'hash', true).value; const v = Number(h.get(f) || 0) + Number(n); h.set(f, String(v)); return v; }

  async sadd(key, ...m) { const s = this._get(key, 'set', true).value; let n = 0; for (const x of m.flat()) if (!s.has(String(x))) { s.add(String(x)); n++; } return n; }
  async srem(key, ...m) { const e = this._get(key, 'set'); if (!e) return 0; let n = 0; for (const x of m.flat()) if (e.value.delete(String(x))) n++; this._cleanup(key); return n; }
  async smembers(key) { const e = this._get(key, 'set'); return e ? [...e.value] : []; }
  async sismember(key, m) { const e = this._get(key, 'set'); return e && e.value.has(String(m)) ? 1 : 0; }
  async scard(key) { const e = this._get(key, 'set'); return e ? e.value.size : 0; }

  async rpush(key, ...v) { const l = this._get(key, 'list', true).value; l.push(...v.flat().map(String)); return l.length; }
  _range(len, start, stop) { start = Number(start); stop = Number(stop); if (start < 0) start = Math.max(0, len + start); if (stop < 0) stop = len + stop; return [start, Math.min(stop, len - 1)]; }
  async lrange(key, start, stop) { const e = this._get(key, 'list'); if (!e) return []; const [a, b] = this._range(e.value.length, start, stop); return a > b ? [] : e.value.slice(a, b + 1); }
  async ltrim(key, start, stop) { const e = this._get(key, 'list'); if (!e) return 'OK'; const [a, b] = this._range(e.value.length, start, stop); e.value = a > b ? [] : e.value.slice(a, b + 1); this._cleanup(key); return 'OK'; }

  async zadd(key, score, member) { const z = this._get(key, 'zset', true).value; const isNew = !z.has(String(member)); z.set(String(member), Number(score)); return isNew ? 1 : 0; }
  async zrem(key, ...m) { const e = this._get(key, 'zset'); if (!e) return 0; let n = 0; for (const x of m.flat()) if (e.value.delete(String(x))) n++; this._cleanup(key); return n; }
  async zcard(key) { const e = this._get(key, 'zset'); return e ? e.value.size : 0; }
  async zrevrange(key, start, stop) {
    const e = this._get(key, 'zset'); if (!e) return [];
    const sorted = [...e.value].sort((a, b) => b[1] - a[1]).map(([m]) => m);
    const [a, b] = this._range(sorted.length, start, stop);
    return a > b ? [] : sorted.slice(a, b + 1);
  }

  // same result shape as ioredis multi().exec(): [[err, result], ...]
  multi() {
    const queue = [];
    const self = this;
    const proxy = new Proxy({}, {
      get(_t, name) {
        if (name === 'exec') return async () => { const out = []; for (const [cmd, args] of queue) { try { out.push([null, await self[cmd](...args)]); } catch (e) { out.push([e, null]); } } return out; };
        if (typeof self[name] !== 'function') return undefined;
        return (...args) => { queue.push([name, args]); return proxy; };
      },
    });
    return proxy;
  }

  async quit() { return 'OK'; }
  disconnect() {}
  on() { return this; }
}
