// Online relay on Cloudflare Workers (free tier). Same event logic as server.js (relay.js); agent state lives in one Durable Object.
// Hooks POST /events with TAMBANG_TOKEN; viewers open a WebSocket /ws?key=VIEW_KEY. Static files come from ./public.
import { DurableObject } from 'cloudflare:workers';
import { toNeutral, applyEvent } from './relay.js';

const LEAVE_MS = 12000, STALE_MS = 12 * 3600e3;

function same(a, b) { // constant-time compare; an unset secret never matches
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const site = () => env.SITE.get(env.SITE.idFromName('site'));
    if (url.pathname === '/events' && req.method === 'POST') {
      if (!same(req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''), env.TAMBANG_TOKEN)) return new Response(null, { status: 401 });
      if (Number(req.headers.get('content-length') || 0) > 1e5) return new Response(null, { status: 413 });
      return site().fetch(req);
    }
    if (url.pathname === '/ws') {
      if (req.headers.get('upgrade') !== 'websocket') return new Response(null, { status: 426 });
      if (!same(url.searchParams.get('key'), env.VIEW_KEY)) return new Response(null, { status: 401 });
      return site().fetch(req);
    }
    return new Response('Not found', { status: 404 });
  },
};

export class Site extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // keep-alive pings are answered without waking the object (WebSocket hibernation keeps idle viewers free)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.agents = new Map(Object.entries((await ctx.storage.get('agents')) ?? {}));
    });
  }

  snapshot() { return JSON.stringify([...this.agents.values()]); }

  async commit() {
    await this.ctx.storage.put('agents', Object.fromEntries(this.agents));
    const s = this.snapshot();
    for (const ws of this.ctx.getWebSockets()) try { ws.send(s); } catch {}
  }

  async fetch(req) {
    if (req.headers.get('upgrade') === 'websocket') {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      server.send(this.snapshot());
      return new Response(null, { status: 101, webSocket: client });
    }
    let e;
    try { e = toNeutral(await req.json()); } catch { return new Response(null, { status: 400 }); }
    const a = e && applyEvent(this.agents, e);
    if (a) {
      const old = Date.now() - STALE_MS; // sessions killed without SessionEnd
      for (const [id, x] of this.agents) if (x.since < old) this.agents.delete(id);
      if (a.state === 'leaving') await this.ctx.storage.setAlarm(Date.now() + LEAVE_MS);
      await this.commit();
    }
    return new Response(null, { status: 204 });
  }

  async alarm() { // the bus has left: drop agents (and their crew) that finished leaving
    const now = Date.now();
    let more = false;
    for (const [id, a] of this.agents) {
      if (a.state !== 'leaving') continue;
      if (now - a.since >= LEAVE_MS - 1000) this.agents.delete(id); else more = true;
    }
    if (more) await this.ctx.storage.setAlarm(now + LEAVE_MS);
    await this.commit();
  }

  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch {} }
}
