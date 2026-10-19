var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/admission.mjs
var ADMISSION_LIMITS = Object.freeze({ daily: 100, concurrent: 3 });
var DAY = 864e5;
function currentQuota(stored, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const quota = { day, count: stored?.day === day ? stored.count : 0, active: Object.assign(/* @__PURE__ */ Object.create(null), stored?.active), closed: Object.assign(/* @__PURE__ */ Object.create(null), stored?.closed) };
  for (const map of [quota.active, quota.closed]) for (const [id, expires] of Object.entries(map)) if (expires <= now) delete map[id];
  return quota;
}
__name(currentQuota, "currentQuota");
async function admitRoom(store, matchId, ttl, now) {
  const q = currentQuota(await store.get("quota"), now);
  let result;
  if (Object.hasOwn(q.closed, matchId)) result = { status: 409, body: { code: "ROOM_FINISHED", error: "\u6B64\u5834\u4F5C\u6230\u5DF2\u7D50\u675F\uFF0C\u8ACB\u8FD4\u56DE\u5927\u5EF3\u5EFA\u7ACB\u65B0\u623F\u9593\u3002" } };
  else if (Object.hasOwn(q.active, matchId)) result = { status: 200, body: { allowed: true } };
  else if (q.count >= ADMISSION_LIMITS.daily) {
    const retryAt = Date.parse(q.day + "T00:00:00Z") + DAY;
    result = { status: 429, retryAfter: Math.ceil((retryAt - now) / 1e3), body: { code: "DAILY_LIMIT", error: "\u6BCF\u65E5\u6E2C\u8A66\u5834\u6B21\u5DF2\u9054 100 \u5834\uFF0C\u65BC UTC 00:00\uFF08\u53F0\u7063\u6642\u9593 08:00\uFF09\u91CD\u8A2D\u3002", retryAt, limit: ADMISSION_LIMITS.daily } };
  } else if (Object.keys(q.active).length >= ADMISSION_LIMITS.concurrent) result = { status: 429, body: { code: "ROOM_LIMIT", error: "\u540C\u6642\u4F5C\u6230\u623F\u9593\u5DF2\u6EFF\uFF08\u6700\u591A 3 \u9593\uFF09\uFF0C\u8ACB\u7B49\u5176\u4ED6\u4F5C\u6230\u7D50\u675F\u5F8C\u518D\u8A66\u3002", limit: ADMISSION_LIMITS.concurrent } };
  else {
    q.count++;
    q.active[matchId] = now + (ttl === 10 * 6e4 ? ttl : 6 * 6e4);
    result = { status: 200, body: { allowed: true } };
  }
  await store.put("quota", q);
  return result;
}
__name(admitRoom, "admitRoom");
async function releaseRoom(store, matchId, now) {
  const q = currentQuota(await store.get("quota"), now);
  delete q.active[matchId];
  q.closed[matchId] ??= now + DAY;
  await store.put("quota", q);
  return { released: true };
}
__name(releaseRoom, "releaseRoom");

// src/diagnostics.mjs
var BACKEND_VERSION = 21;
var hints = /* @__PURE__ */ new Set(["wnam", "enam", "sam", "weur", "eeur", "apac", "apac-ne", "apac-se", "oc", "afr", "me"]);
var roomLocationHint = /* @__PURE__ */ __name((env) => hints.has(env.ROOM_LOCATION_HINT) ? env.ROOM_LOCATION_HINT : "apac-ne", "roomLocationHint");
function edgeDiagnostic(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== env.SITE_ORIGIN) return new Response("Origin denied", { status: 403 });
  return Response.json({ version: BACKEND_VERSION, entryColo: request.cf?.colo || null, roomLocationHint: roomLocationHint(env) }, { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": env.SITE_ORIGIN, "Vary": "Origin" } });
}
__name(edgeDiagnostic, "edgeDiagnostic");
async function roomEgress(fetcher = fetch) {
  try {
    const r = await fetcher("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(2e3) });
    if (!r.ok) return null;
    return (await r.text()).match(/^colo=([A-Z]{3})\r?$/m)?.[1] || null;
  } catch {
    return null;
  }
}
__name(roomEgress, "roomEgress");
var InputTiming = class {
  static {
    __name(this, "InputTiming");
  }
  constructor() {
    this.pending = /* @__PURE__ */ new Map();
    this.last = null;
  }
  received(seq, now) {
    this.pending.set(seq, now);
    while (this.pending.size > 60) this.pending.delete(this.pending.keys().next().value);
  }
  applied(seq, now) {
    if (this.last?.seq === seq) return;
    const received = this.pending.get(seq);
    if (received === void 0) return;
    this.last = { seq, received, applied: now };
    for (const key of this.pending.keys()) if (key <= seq) this.pending.delete(key);
  }
  sample(now) {
    if (!this.last) return null;
    const p = this.last;
    return { seq: p.seq, simulationWaitMs: Math.max(0, p.applied - p.received), snapshotWaitMs: Math.max(0, now - p.applied) };
  }
};

// ../dist/missions.js
var MISSIONS = Object.freeze({ survival: { id: "survival", name: "\u751F\u5B58\u4E4B\u9053", phase: "SURVIVAL ROUTE", storm: "\u9023\u7E8C\u4F5C\u6230" }, sky: { id: "sky", name: "\u96F2\u6D77\u9632\u885B\u6230", phase: "BLUE HORIZON", storm: "\u7D2B\u8272\u98A8\u66B4" }, desert: { id: "desert", name: "\u8D64\u7802\u907A\u8DE1", phase: "SCARLET WASTELAND", storm: "\u8D64\u7802\u98A8\u66B4" } });
var validMission = /* @__PURE__ */ __name((id) => typeof id === "string" && Object.hasOwn(MISSIONS, id), "validMission");
var missionRules = /* @__PURE__ */ __name((id) => MISSIONS[validMission(id) ? id : "sky"], "missionRules");

// ../dist/aircraft.js
var AIRCRAFT = Object.freeze({
  balanced: Object.freeze({ id: "balanced", name: "\u84BC\u7FFC", pilot: "\u98AF", role: "\u5747\u8861\u578B", speed: 280, interval: 0.12, damage: 5, offsets: [-10, 10], angles: [0, 0], portrait: "pilot-hayate.jpg", description: "\u96D9\u767C\u76F4\u5C04\uFF0C\u653B\u5B88\u517C\u5099\u3002\u719F\u6089\u7684\u6230\u6A5F\uFF0C\u7A69\u5B9A\u638C\u63E1\u6BCF\u4E00\u6B21\u9583\u907F\u3002" }),
  swift: Object.freeze({ id: "swift", name: "\u75BE\u98A8", pilot: "\u9F4A\u65AF", role: "\u9AD8\u6A5F\u52D5\u578B", speed: 336, interval: 0.1, damage: 4, offsets: [-4, 4], angles: [0, 0], portrait: "pilot-keith.jpg", description: "\u79FB\u901F\u63D0\u5347 20%\uFF0C\u96C6\u4E2D\u96D9\u767C\u5C04\u64CA\u3002\u4EE5\u9748\u6D3B\u8D70\u4F4D\u7A7F\u8D8A\u5BC6\u96C6\u5F48\u5E55\u3002" }),
  heavy: Object.freeze({ id: "heavy", name: "\u91CD\u7832", pilot: "\u6885\u745F", role: "\u706B\u529B\u578B", speed: 238, interval: 0.18, damage: 6, offsets: [-12, 0, 12], angles: [-0.18, 0, 0.18], portrait: "pilot-messer.jpg", description: "\u79FB\u901F\u964D\u4F4E 15%\uFF0C\u4E09\u767C\u6247\u5F62\u5C04\u64CA\u3002\u64F4\u5927\u706B\u529B\u8986\u84CB\uFF0C\u6514\u622A\u6575\u7FA4\u3002" })
});
var validAircraft = /* @__PURE__ */ __name((id) => typeof id === "string" && Object.hasOwn(AIRCRAFT, id), "validAircraft");
var aircraftRules = /* @__PURE__ */ __name((id) => AIRCRAFT[validAircraft(id) ? id : "balanced"], "aircraftRules");
function aircraftShots(id, x, y) {
  const r = aircraftRules(id);
  return r.angles.map((a, i) => ({ x: x + r.offsets[i], y: y - 28, vx: Math.sin(a) * 650, vy: -Math.cos(a) * 650, r: 3, damage: r.damage }));
}
__name(aircraftShots, "aircraftShots");

// src/worker.mjs
import { DurableObject } from "cloudflare:workers";

// ../dist/weapons.js
var WEAPONS = { balanced: { name: "\u591A\u91CD\u9396\u5B9A", cooldown: 8, description: "8 \u679A\u8FFD\u8E64\u98DB\u5F48 \xB7 \u51B7\u537B 8 \u79D2" }, swift: { name: "\u75BE\u98A8\u7A81\u9032", cooldown: 6, description: "\u6CBF\u79FB\u52D5\u65B9\u5411\u7A81\u9032 \xB7 \u885D\u523A\u4E2D\u7121\u6575 0.35 \u79D2\uFF0C\u7D50\u675F\u5F8C\u53E6\u52A0 0.15 \u79D2 \xB7 \u51B7\u537B 6 \u79D2" }, heavy: { name: "\u8CAB\u7A7F\u91CD\u7832", cooldown: 10, description: "\u84C4\u529B 1.2 \u79D2\u5F8C\u767C\u5C04\u8CAB\u7A7F\u5149\u675F \xB7 \u51B7\u537B 10 \u79D2" } };
var weaponRules = /* @__PURE__ */ __name((id) => WEAPONS[Object.hasOwn(WEAPONS, id) ? id : "balanced"], "weaponRules");
function startWeapon(actor, pos, aircraft, input, launch) {
  if (actor.hp <= 0 || actor.missileCd > 0) return false;
  actor.missileCd = weaponRules(aircraft).cooldown;
  if (aircraft === "swift") {
    let dx = input?.x || 0, dy = input?.y || 0;
    if (!dx && !dy && input?.target) {
      dx = input.target.x - pos.x;
      dy = input.target.y - pos.y;
    }
    const length = Math.hypot(dx, dy);
    if (length > 0.01) {
      dx /= length;
      dy /= length;
    } else {
      dx = 0;
      dy = -1;
    }
    actor.skill = { kind: "dash", remaining: 0.35, dx, dy, x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y };
    actor.skillHits = /* @__PURE__ */ new WeakSet();
    actor.invuln = Math.max(actor.invuln, 0.35);
  } else if (aircraft === "heavy") actor.skill = { kind: "charge", remaining: 1.2 };
  else launch();
  return true;
}
__name(startWeapon, "startWeapon");
function stepWeapon(actor, pos, dt, targets, damage) {
  const skill = actor.skill;
  if (!skill) return false;
  if (actor.hp <= 0) {
    actor.skill = null;
    return false;
  }
  if (skill.kind === "dash") {
    const used = Math.min(dt, skill.remaining), x = pos.x, y = pos.y;
    pos.x = Math.max(28, Math.min(452, x + skill.dx * 600 * used));
    pos.y = Math.max(175, Math.min(655, y + skill.dy * 600 * used));
    skill.x1 = pos.x;
    skill.y1 = pos.y;
    const dx = pos.x - x, dy = pos.y - y, len = dx * dx + dy * dy;
    actor.skillHits ??= /* @__PURE__ */ new WeakSet();
    for (const e of targets) {
      const t = len ? Math.max(0, Math.min(1, ((e.x - x) * dx + (e.y - y) * dy) / len)) : 0;
      if (e.hp > 0 && !actor.skillHits.has(e) && Math.hypot(e.x - x - dx * t, e.y - y - dy * t) < e.r + 18) {
        actor.skillHits.add(e);
        damage(e, 90);
      }
    }
    skill.remaining = Math.max(0, skill.remaining - dt);
    if (skill.remaining === 0) {
      actor.invuln = Math.max(actor.invuln, 0.15);
      skill.kind = "trail";
      skill.remaining = 0.18;
    }
    return true;
  }
  skill.remaining = Math.max(0, skill.remaining - dt);
  if (skill.kind === "charge" && skill.remaining < 1e-8) {
    actor.skill = { kind: "beam", remaining: 0.32, x0: pos.x, y0: pos.y - 24, x1: pos.x, y1: Math.max(-100, pos.y - 674) };
    for (const e of targets) if (e.hp > 0 && e.y <= pos.y - 24 + e.r && e.y >= pos.y - 674 - e.r && Math.abs(e.x - pos.x) <= 22 + e.r) damage(e, 180);
  } else if (skill.remaining === 0) actor.skill = null;
  return false;
}
__name(stepWeapon, "stepWeapon");

// ../dist/support-damage.js
var SupportDamage = class {
  static {
    __name(this, "SupportDamage");
  }
  constructor() {
    this.nextId = 0;
    this.volleys = /* @__PURE__ */ new Map();
  }
  begin() {
    const id = ++this.nextId;
    this.volleys.set(id, /* @__PURE__ */ new WeakMap());
    return id;
  }
  hit(missile, target) {
    if (!missile.super || !Number.isSafeInteger(missile.burstId)) return missile.damage;
    const counts = this.volleys.get(missile.burstId);
    if (!counts) throw Error("Missing support volley");
    const n = (counts.get(target) || 0) + 1;
    counts.set(target, n);
    return Math.max(20, 40 - 4 * (n - 1));
  }
  prune(missiles) {
    const active = new Set(missiles.filter((m) => m.super).map((m) => m.burstId));
    for (const id of this.volleys.keys()) if (!active.has(id)) this.volleys.delete(id);
  }
};

// ../dist/singers.js
var SINGERS = Object.freeze({
  freyja: Object.freeze({ id: "freyja", name: "\u8299\u857E\u96C5\u30FB\u7DAD\u6069", short: "\u8299\u857E\u96C5", number: 1, role: "\u5F48\u5E55\u63A7\u5236\uFF0F\u7206\u767C\u6E05\u5834", color: "#ffb271", duration: 6, energy: 100, move: 1.5, bullet: 0.4, enemyMove: 1, fire: 1, vulnerability: 1, shields: 0, heal: 0, critChance: 0, critDamage: 1, burst: true, description: "\u5168\u968A\u79FB\u901F \xD71.5\uFF1B\u6575\u5F48\u901F\u5EA6 \xD70.4\uFF1B\u7D50\u675F\u6642\u50C5\u65BD\u653E\u8005\u767C\u5C04 16 \u679A\u905E\u6E1B\u50B7\u5BB3\u8FFD\u8E64\u98DB\u5F48\u3002" }),
  kaname: Object.freeze({ id: "kaname", name: "\u8299\u82BD\u30FB\u5DF4\u5361\u59AE\u96C5", short: "\u8299\u82BD", number: 2, role: "\u9632\u79A6\u7E8C\u6230\uFF0F\u5F31\u9EDE\u589E\u50B7", color: "#ffc767", duration: 6, energy: 100, move: 1, bullet: 1, enemyMove: 1, fire: 1, vulnerability: 1.25, shields: 2, heal: 20, critChance: 0, critDamage: 1, burst: false, description: "\u5168\u968A\u5404\u7372\u8B77\u76FE\uFF0C\u6700\u591A\u62B5\u64CB 2 \u6B21\u6709\u6548\u547D\u4E2D\uFF1B\u6575\u4EBA\u53D7\u50B7 \xD71.25\uFF1B\u65BD\u653E\u8005\u7ACB\u5373\u56DE\u5FA9 20 HP\uFF08\u4E0A\u9650 100\uFF09\u3002" }),
  mikumo: Object.freeze({ id: "mikumo", name: "\u7F8E\u96F2\u30FB\u57FA\u52AA\u7F8E\u723E", short: "\u7F8E\u96F2", number: 3, role: "\u6301\u7E8C\u706B\u529B\uFF0F\u6575\u6A5F\u58D3\u5236", color: "#cbb1ff", duration: 6, energy: 100, move: 1, bullet: 1, enemyMove: 0.4, fire: 1.3, vulnerability: 1, shields: 0, heal: 0, critChance: 0.15, critDamage: 2, burst: false, description: "\u5168\u968A\u4E3B\u6B66\u5668\u5C04\u901F \xD71.3\uFF1B\u6575\u6A5F\u79FB\u901F \xD70.4\uFF1B\u50C5\u65BD\u653E\u8005\u4E3B\u6B66\u5668\u8207\u5C08\u5C6C\u6B66\u88DD\u6BCF\u6B21\u6709\u6548\u547D\u4E2D\u7368\u7ACB\u5224\u5B9A 15% \u66B4\u64CA\u3001\u50B7\u5BB3 \xD72\u3002" })
});
var validSinger = /* @__PURE__ */ __name((id) => typeof id === "string" && Object.hasOwn(SINGERS, id), "validSinger");
var singerRules = /* @__PURE__ */ __name((id) => SINGERS[validSinger(id) ? id : "freyja"], "singerRules");
function supportRules(world) {
  return singerRules(world.supportSinger || world.singer);
}
__name(supportRules, "supportRules");
function criticalDamage(amount, enabled, random) {
  return enabled && random() < 0.15 ? amount * 2 : amount;
}
__name(criticalDamage, "criticalDamage");

// src/combat.mjs
var clamp = /* @__PURE__ */ __name((v, a, b) => Math.max(a, Math.min(b, v)), "clamp");
var CoopCombat = class {
  static {
    __name(this, "CoopCombat");
  }
  constructor(players, random = Math.random) {
    this.supportDamage = new SupportDamage();
    this.campaign = missionRules(players[0]?.mission).id;
    this.mission = this.campaign === "survival" ? "sky" : this.campaign;
    this.stageIndex = 0;
    this.stageStartedAt = 0;
    this.random = random;
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.state = "playing";
    this.score = 0;
    this.win = false;
    this.res = 0;
    this.intro = 0;
    this.burst = 0;
    this.spawn = 1;
    this.phase = 0;
    this.boss = null;
    this.enemies = [];
    this.shots = [];
    this.bullets = [];
    this.missiles = [];
    this.events = [];
    this.eventId = 0;
    this.players = players.map((p, i) => ({ id: p.id, name: p.name, aircraft: aircraftRules(p.aircraft).id, slot: i, singer: singerRules(p.singer).id, shield: 0, x: 180 + i * 120, y: 620, hp: 100, energy: 25, score: 0, kills: 0, fire: 0, invuln: 2, missileCd: 0, input: { x: 0, y: 0 }, lastInput: -Infinity, seq: -1, ackSeq: -1, connected: true }));
  }
  get stageTime() {
    return this.time - this.stageStartedAt;
  }
  advanceStage() {
    this.stageIndex = 1;
    this.stageStartedAt = this.time;
    this.mission = "desert";
    this.state = "playing";
    this.phase = 0;
    this.boss = null;
    this.enemies = [];
    this.shots = [];
    this.bullets = [];
    this.missiles = [];
    this.criticalHits = [];
    this.supportDamage = new SupportDamage();
    this.res = 0;
    this.intro = 0;
    this.burst = 0;
    this.spawn = 1;
    for (const p of this.players) {
      p.shield = 0;
      p.skill = null;
      p.fire = 0;
      p.invuln = 2;
      p.x = 180 + p.slot * 120;
      p.y = 620;
    }
    this.event("stage", { mission: this.mission, stage: 2 });
  }
  event(type, data = {}) {
    this.events.push({ id: ++this.eventId, type, ...data });
    if (this.events.length > 32) this.events.shift();
  }
  input(slot, data, now) {
    const p = this.players[slot];
    if (!p || p.hp <= 0 || !p.connected || !Number.isSafeInteger(data.seq) || data.seq <= p.seq) return false;
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || Math.abs(data.x) > 1 || Math.abs(data.y) > 1) return false;
    if (data.target && (!Number.isFinite(data.target.x) || !Number.isFinite(data.target.y))) return false;
    p.seq = data.seq;
    p.lastInput = now;
    p.input = { x: data.x, y: data.y, target: data.target ? { x: clamp(data.target.x, 28, 452), y: clamp(data.target.y, 175, 655) } : null };
    if (this.state === "playing" && this.intro <= 0) {
      if (data.missile === true && startWeapon(p, p, p.aircraft, p.input, () => this.launch(p, 8))) this.event("missile", { slot });
      if (data.support === true && p.energy >= 100 && this.res <= 0 && this.burst <= 0) {
        p.energy = 0;
        this.intro = 2.4;
        this.supportSlot = slot;
        this.supportSinger = p.singer;
        p.hp = Math.min(100, p.hp + supportRules(this).heal);
        this.event("support", { slot, singer: this.supportSinger });
      }
    }
    return true;
  }
  launch(p, n) {
    const burstId = n > 8 ? this.supportDamage.begin() : null;
    const targets = [...this.enemies.filter((e) => e.hp > 0), ...this.boss?.hp > 0 ? [this.boss] : []];
    for (let i = 0; i < n; i++) this.missiles.push({ id: this.nextId++, owner: p.slot, targetId: n === 8 && targets.length ? targets[i % targets.length].id : null, x: p.x + (i % 2 ? 18 : -18), y: p.y, vx: (i % 2 ? 1 : -1) * 150, vy: -50, life: n > 8 ? 4.5 : 3.5, age: 0, damage: n > 8 ? 40 : 20, burstId, super: n > 8 });
  }
  damage(e, amount, owner) {
    if (e.hp <= 0 || this.state !== "playing") return;
    e.hp = Math.max(0, e.hp - amount * (this.res > 0 ? supportRules(this).vulnerability : 1));
    if (e.hp === 0) {
      const p = this.players[owner], points = e.type === "boss" ? 5e3 : e.type === "elite" ? 300 : 100;
      this.score += points;
      p.score += points;
      p.kills++;
      p.energy = Math.min(100, p.energy + 10);
      this.event("explosion", { x: e.x, y: e.y, boss: e.type === "boss", enemyType: e.type });
      if (e.type === "boss") this.finish(true);
    }
  }
  strike(e, amount, enabled, owner) {
    if (e.hp <= 0 || this.state !== "playing") return;
    const damage = criticalDamage(amount, enabled, this.random);
    if (damage > amount) {
      e.criticalUntil = this.time + 0.38;
      this.criticalHits ??= [];
      this.criticalHits.push({ x: e.x, y: e.y, time: this.time });
      this.criticalHits = this.criticalHits.filter((h) => this.time - h.time < 0.38).slice(-12);
    }
    this.damage(e, damage, owner);
  }
  hit(p) {
    if (this.state !== "playing" || p.hp <= 0 || p.invuln > 0) return;
    if (this.res > 0 && p.shield > 0) {
      p.shield--;
      p.invuln = 1.5;
      p.shieldHitUntil = this.time + 0.3;
      this.event("shield", { slot: p.slot, remaining: p.shield });
      return;
    }
    p.hp = Math.max(0, p.hp - 20);
    if (p.hp === 0) p.skill = null;
    p.invuln = 1.5;
    this.event("hit", { slot: p.slot });
    if (this.players.every((p2) => p2.hp <= 0)) this.finish(false);
  }
  finish(win) {
    if (this.state === "result" || this.state === "transition") return;
    if (win && this.campaign === "survival" && this.stageIndex === 0) {
      this.state = "transition";
      return;
    }
    this.state = "result";
    this.win = win;
    this.res = 0;
    this.intro = 0;
    this.burst = 0;
    this.criticalHits = [];
    this.missiles = [];
    this.shots = [];
    for (const p of this.players) {
      p.shield = 0;
      p.shieldHitUntil = 0;
      p.skill = null;
    }
    this.event("finish", { win });
  }
  step(dt, now) {
    if (this.state === "transition") {
      this.advanceStage();
      return;
    }
    if (this.state !== "playing") return;
    this.tick++;
    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - dt);
      if (this.intro === 0) {
        this.res = 6;
        for (const p of this.players) p.shield = p.hp > 0 ? supportRules(this).shields : 0;
        this.event("resonance", { heal: 0, singer: this.supportSinger });
      }
      return;
    }
    this.time += dt;
    if (this.stageTime >= 190) {
      this.finish(false);
      return;
    }
    this.phase = this.stageTime < 65 ? 0 : this.stageTime < 130 ? 1 : 2;
    const rules = supportRules(this), active = this.res > 0, resStep = Math.min(dt, this.res), movementTime = dt + resStep * (rules.move - 1), bulletStep = dt - resStep * (1 - rules.bullet), enemyStep = dt + resStep * (rules.enemyMove - 1);
    this.burst = Math.max(0, this.burst - dt);
    if (this.res > 0) {
      this.res = Math.max(0, this.res - dt);
      if (this.res === 0) {
        const p = this.players[this.supportSlot];
        for (const ally of this.players) ally.shield = 0;
        if (rules.burst) {
          if (p?.hp > 0 && p.connected) this.launch(p, 16);
          this.burst = 2.2;
          this.event("burst", { slot: this.supportSlot });
        } else this.event("resonanceEnd");
      }
    }
    for (const p of this.players) {
      p.invuln = Math.max(0, p.invuln - dt);
      p.missileCd = Math.max(0, p.missileCd - dt);
      if (p.hp <= 0 || !p.connected) continue;
      const dashing = stepWeapon(p, p, dt, [...this.enemies, ...this.boss ? [this.boss] : []], (e, n) => this.strike(e, n, this.res > 0 && rules.critChance > 0 && p.slot === this.supportSlot, p.slot));
      if (this.state !== "playing") return;
      const movement = dashing ? 0 : aircraftRules(p.aircraft).speed * movementTime;
      const input = now - p.lastInput <= 250 ? p.input : { x: 0, y: 0 };
      let dx = input.x, dy = input.y;
      if (!dx && !dy && input.target) {
        dx = input.target.x - p.x;
        dy = input.target.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d) {
          const m = Math.min(d, movement);
          p.x += dx / d * m;
          p.y += dy / d * m;
        }
      } else {
        const d = Math.hypot(dx, dy);
        if (d) {
          p.x += dx / d * movement;
          p.y += dy / d * movement;
        }
      }
      p.x = clamp(p.x, 28, 452);
      p.y = clamp(p.y, 175, 655);
      p.ackSeq = p.seq;
      p.fire -= dt;
      if (p.fire <= 0) {
        p.fire += aircraftRules(p.aircraft).interval / (active ? rules.fire : 1);
        for (const shot of aircraftShots(p.aircraft, p.x, p.y)) this.shots.push({ id: this.nextId++, owner: p.slot, ...shot });
      }
    }
    this.spawn -= dt;
    if (this.spawn <= 0 && this.stageTime < 158) {
      const elite = this.stageTime > 65 && this.random() < 0.27;
      this.enemies.push({ id: this.nextId++, type: elite ? "elite" : "scout", x: 45 + this.random() * 390, y: -55, hp: elite ? 90 : 30, r: elite ? 25 : 17, speed: elite ? 48 : 80, age: 0, fire: 1.3, seed: this.random() * 6 });
      this.spawn = this.boss ? 3.5 : this.stageTime < 65 ? 1.1 : 0.8;
    }
    if (this.stageTime >= 130 && !this.boss) {
      this.boss = { id: this.nextId++, type: "boss", x: 240, y: -100, hp: 3e3, maxHp: 3e3, r: 60, age: 0, fire: 1.4 };
      this.event("boss");
    }
    const live = this.players.filter((p) => p.hp > 0 && p.connected);
    for (const e of this.enemies) {
      e.age += enemyStep;
      e.y += e.speed * enemyStep;
      e.x = clamp(e.x + Math.sin(e.age * 1.7 + e.seed) * 35 * enemyStep, 20, 460);
      e.fire -= dt;
      if (e.fire <= 0 && e.y > 20 && live.length) {
        const p = live[e.id % live.length], a = Math.atan2(p.y - e.y, p.x - e.x), n = e.type === "elite" ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const angle = a + (i - (n - 1) / 2) * 0.18;
          this.bullets.push({ id: this.nextId++, x: e.x, y: e.y + 15, vx: Math.cos(angle) * 145, vy: Math.sin(angle) * 145, r: 5 });
        }
        e.fire = e.type === "elite" ? 1.4 : 2.1;
      }
      for (const p of live) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
        this.hit(p);
        e.y = 880;
      }
    }
    const b = this.boss;
    if (b?.hp > 0) {
      b.age += enemyStep;
      b.y = Math.min(155, b.y + 65 * enemyStep);
      b.x = 240 + Math.sin(b.age * 0.7) * 110;
      b.fire -= dt;
      if (b.fire <= 0 && b.y > 70) {
        const n = b.hp < 1500 ? 13 : 9;
        for (let i = 0; i < n; i++) {
          const a = 0.2 + i * (Math.PI - 0.4) / (n - 1);
          this.bullets.push({ id: this.nextId++, x: b.x, y: b.y + 25, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 5 });
        }
        b.fire = b.hp < 1500 ? 0.85 : 1.25;
      }
      for (const p of live) if (Math.hypot(b.x - p.x, b.y - p.y) < 60) this.hit(p);
    }
    const targets = [...this.enemies, ...b ? [b] : []];
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (const e of targets) if (e.hp > 0 && Math.hypot(s.x - e.x, s.y - e.y) < e.r + s.r) {
        this.strike(e, s.damage, this.res > 0 && rules.critChance > 0 && s.owner === this.supportSlot, s.owner);
        s.y = -200;
        break;
      }
    }
    for (const m of this.missiles) {
      m.life -= dt;
      m.age += dt;
      const e = targets.find((e2) => e2.id === m.targetId && e2.hp > 0) || targets.find((e2) => e2.hp > 0);
      if (e) m.targetId = e.id;
      if (m.age > 0.18) {
        const a = e ? Math.atan2(e.y - m.y, e.x - m.x) : -Math.PI / 2, v = m.super ? 530 : 430;
        m.vx += (Math.cos(a) * v - m.vx) * Math.min(1, dt * 5);
        m.vy += (Math.sin(a) * v - m.vy) * Math.min(1, dt * 5);
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (e && Math.hypot(m.x - e.x, m.y - e.y) < e.r + 10) {
        this.strike(e, this.supportDamage.hit(m, e), !m.super && this.res > 0 && rules.critChance > 0 && m.owner === this.supportSlot, m.owner);
        m.life = 0;
      }
    }
    for (const s of this.bullets) {
      s.x += s.vx * bulletStep;
      s.y += s.vy * bulletStep;
      for (const p of live) if (Math.hypot(s.x - p.x, s.y - p.y) < s.r + 6) {
        this.hit(p);
        s.y = 900;
        break;
      }
    }
    this.shots = this.shots.filter((s) => s.y > -70 && s.x > -20 && s.x < 500);
    this.missiles = this.missiles.filter((m) => m.life > 0 && m.y > -80 && m.y < 950);
    this.supportDamage.prune(this.missiles);
    this.bullets = this.bullets.filter((s) => s.y < 830 && s.y > -60 && s.x > -30 && s.x < 510);
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < 870);
  }
  snapshot() {
    return { campaign: this.campaign, stageIndex: this.stageIndex, stageTime: this.stageTime, criticalHits: this.criticalHits || [], mission: this.mission, supportSinger: this.supportSinger || "freyja", supportSlot: this.supportSlot, tick: this.tick, time: this.time, state: this.state, win: this.win, score: this.score, phase: this.phase, res: this.res, intro: this.intro, burst: this.burst, players: this.players.map(({ input, lastInput, skillHits, ...p }) => ({ ...p, skill: p.skill ? { ...p.skill } : null })), enemies: this.enemies.map((e) => ({ ...e })), boss: this.boss ? { ...this.boss } : null, shots: this.shots.map((e) => ({ ...e })), bullets: this.bullets.map((e) => ({ ...e })), missiles: this.missiles.map((e) => ({ ...e })), events: this.events.map((e) => ({ ...e })) };
  }
};

// src/room.mjs
var BattleRoom = class {
  static {
    __name(this, "BattleRoom");
  }
  constructor(id, players, { random = Math.random } = {}) {
    if (players.length !== 2 || players[0].id === players[1].id) throw Error("Two distinct players required");
    this.id = id;
    this.game = new CoopCombat(players, random);
    this.phase = "loading";
    this.loaded = [false, false];
    this.online = [false, false];
    this.deadline = 0;
    this.last = 0;
    this.acc = 0;
    this.result = null;
    this.started = false;
    this.hostStart = false;
    this.finishedAt = 0;
    this.soloContinued = false;
  }
  connect(slot, now) {
    this.online[slot] = true;
    this.game.players[slot].connected = true;
    this.game.players[slot].lastInput = -Infinity;
    if (this.phase === "reconnecting" && now < this.deadline && this.online.every(Boolean)) {
      this.phase = this.resumePhase;
      this.last = now;
      this.acc = 0;
      if (this.phase === "countdown") this.deadline = now + 3e3;
    }
    return this.snapshot(now);
  }
  disconnect(slot, now) {
    this.online[slot] = false;
    this.game.players[slot].connected = false;
    if (["playing", "countdown"].includes(this.phase)) {
      this.resumePhase = this.phase;
      this.phase = "reconnecting";
      this.deadline = now + 2e4;
    }
  }
  message(slot, data, now) {
    if (!this.online[slot]) return false;
    if (data.type === "loaded" && this.phase === "loading") {
      if (!this.loaded[slot] && data.singer !== void 0) {
        if (!validSinger(data.singer)) return false;
        this.game.players[slot].singer = data.singer;
      }
      this.loaded[slot] = true;
    } else if (data.type === "start" && slot === 0 && this.phase === "loading" && this.loaded.every(Boolean) && this.online.every(Boolean)) this.hostStart = true;
    else if (data.type === "input" && this.phase === "playing") return this.game.input(slot, data, now);
    else if (data.type === "continue" && this.phase === "disconnected" && this.online[slot]) {
      this.soloContinued = true;
      this.phase = "playing";
      this.last = now;
      this.acc = 0;
      for (const p of this.game.players) if (!this.online[p.slot]) p.hp = 0;
    } else if (data.type === "end" && ["disconnected", "reconnecting"].includes(this.phase)) {
      this.game.finish(false);
      this.complete(now, "aborted");
    }
    if (this.phase === "loading" && this.loaded.every(Boolean) && this.online.every(Boolean) && this.hostStart) {
      this.phase = "countdown";
      this.deadline = now + 3e3;
      this.last = now;
    }
    return true;
  }
  complete(now, reason = "completed") {
    if (this.result) return;
    this.phase = "result";
    this.finishedAt = now;
    this.result = { matchId: this.id, campaign: this.game.campaign, win: this.game.win, total: this.game.score, players: this.game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, kills: p.kills })), duration: this.game.time, completedAt: now, eligible: reason === "completed" && this.started && !this.soloContinued && this.online.every(Boolean), reason: this.soloContinued ? "solo-continued" : reason };
  }
  advance(now) {
    if (this.phase === "reconnecting" && now >= this.deadline) {
      this.phase = "disconnected";
      if (!this.online.some(Boolean)) {
        this.game.finish(false);
        this.complete(now, "aborted");
      }
      return;
    }
    if (this.phase === "countdown" && now >= this.deadline) {
      this.phase = "playing";
      this.started = true;
      this.last = now;
      this.acc = 0;
    }
    if (this.phase !== "playing") return;
    const delta = Math.min(200, Math.max(0, now - this.last));
    this.last = now;
    this.acc += delta;
    while (this.acc >= 1e3 / 30 && this.game.state !== "result") {
      this.game.step(1 / 30, now);
      this.acc -= 1e3 / 30;
    }
    if (this.game.state === "result") this.complete(now);
  }
  snapshot(now) {
    return { type: "snapshot", matchId: this.id, phase: this.phase, countdown: Math.max(0, this.deadline - now), online: [...this.online], loaded: [...this.loaded], result: this.result, world: this.game.snapshot() };
  }
};

// src/network.mjs
var pick = /* @__PURE__ */ __name((value, keys) => Object.fromEntries(keys.filter((key) => value[key] !== void 0).map((key) => [key, value[key]])), "pick");
function networkSnapshot(snapshot) {
  const w = snapshot.world;
  return { ...snapshot, world: {
    ...w,
    players: w.players.map((p) => pick(p, ["id", "name", "slot", "aircraft", "singer", "x", "y", "hp", "energy", "score", "kills", "invuln", "missileCd", "seq", "ackSeq", "connected", "shield", "shieldHitUntil", "skill"])),
    enemies: w.enemies.map((e) => pick(e, ["id", "type", "x", "y", "hp", "r", "age", "seed"])),
    boss: w.boss ? pick(w.boss, ["id", "type", "x", "y", "hp", "maxHp", "r", "age", "fire"]) : null,
    shots: w.shots.map((s) => pick(s, ["id", "owner", "x", "y", "vx", "vy", "critical", "super"])),
    bullets: w.bullets.map((s) => pick(s, ["id", "x", "y", "vx", "vy", "r"])),
    missiles: w.missiles.map((m) => pick(m, ["id", "owner", "x", "y", "vx", "vy", "life", "age", "super"]))
  } };
}
__name(networkSnapshot, "networkSnapshot");
function encodeSnapshot(snapshot) {
  return JSON.stringify(networkSnapshot(snapshot), (_, value) => typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 1e3) / 1e3 : value);
}
__name(encodeSnapshot, "encodeSnapshot");
var SnapshotSchedule = class {
  static {
    __name(this, "SnapshotSchedule");
  }
  constructor() {
    this.last = -Infinity;
    this.next = -Infinity;
    this.lastPhase = null;
    this.lastEvent = -1;
    this.lastMission = null;
  }
  due(now, snapshot) {
    const event = snapshot.world.events.at(-1)?.id ?? 0, changed = snapshot.phase !== this.lastPhase || snapshot.world.mission !== this.lastMission || event !== this.lastEvent;
    if (!changed && now < this.next) return false;
    if (!Number.isFinite(this.next) || now - this.next > 250) this.next = now + 50;
    else while (this.next <= now) this.next += 50;
    this.last = now;
    this.lastPhase = snapshot.phase;
    this.lastEvent = event;
    this.lastMission = snapshot.world.mission;
    return true;
  }
};

// src/auth.mjs
var enc = new TextEncoder();
var hex = /* @__PURE__ */ __name((bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join(""), "hex");
async function sign(secret, payload) {
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { body, signature: hex(await crypto.subtle.sign("HMAC", key, enc.encode(body))) };
}
__name(sign, "sign");
async function verify(secret, body, signature) {
  if (typeof body !== "string" || body.length > 4096 || typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return null;
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const bytes = Uint8Array.from(signature.match(/../g), (s) => parseInt(s, 16));
    if (!await crypto.subtle.verify("HMAC", key, bytes, enc.encode(body))) return null;
    const data = JSON.parse(body);
    return Number.isFinite(data.exp) && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
__name(verify, "verify");
async function ticket(secret, matchId, player, slot) {
  return sign(secret, { aud: "sky-battle", matchId, playerId: player.id, slot, exp: Date.now() + 10 * 6e4, nonce: crypto.randomUUID() });
}
__name(ticket, "ticket");
async function verifyRoom(publicKey, body, signature) {
  if (typeof body !== "string" || body.length > 4096 || typeof signature !== "string" || !/^[0-9a-f]{128}$/.test(signature)) return null;
  try {
    const jwk = JSON.parse(publicKey);
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.d) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const bytes = Uint8Array.from(signature.match(/../g), (s) => parseInt(s, 16));
    if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytes, enc.encode(body))) return null;
    const data = JSON.parse(body);
    return Number.isFinite(data.exp) && data.exp > Date.now() && data.exp <= Date.now() + 6e4 ? data : null;
  } catch {
    return null;
  }
}
__name(verifyRoom, "verifyRoom");

// src/worker.mjs
var response = /* @__PURE__ */ __name((body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } }), "response");
var rosterValid = /* @__PURE__ */ __name((players) => Array.isArray(players) && players.length === 2 && players.every((p) => (p.mission === void 0 || validMission(p.mission)) && (p.aircraft === void 0 || validAircraft(p.aircraft)) && typeof p.id === "string" && p.id.length < 100 && typeof p.name === "string" && p.name.length <= 160) && players[0].id !== players[1].id, "rosterValid");
var worker_default = { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/network-check" && request.method === "GET") return edgeDiagnostic(request, env);
  if (url.pathname === "/health") return response({ service: "sky-resonance-battle", version: BACKEND_VERSION, transportDiagnostics: true, roomQuotaRelease: true, admissionLimits: ADMISSION_LIMITS, normalMissileLifetime: 3.5, supportMissileLifetime: 4.5, releasePhase: 7, phase7Baseline: true, specialWeapons: true, desertMission: true, aircraftSelection: true, phase6: true, singers: true, supportHealBySinger: { freyja: 0, kaname: 20, mikumo: 0 }, critChance: 0.15, critMultiplier: 2, critRoll: "per-hit", enemyMoveMultiplier: 0.4, supportEffects: true, survivalRoute: true, networkOptimized: true, reviewFixes: true, snapshotHz: 20, roomLocationHint: roomLocationHint(env), supportDamageRule: "per-target-per-volley", supportDamageFirst: 40, supportDamageStep: 4, supportDamageMin: 20, supportBurstOwner: "caster", supportMissilesPerCast: 16, resultsReady: true, roomAuth: env.SITE_PUBLIC_KEY ? "ECDSA-P256" : "HMAC" });
  if (!env.BATTLE_SECRET || !env.SITE_ORIGIN) return response({ error: "Service is not configured" }, 503);
  if (url.pathname === "/results" && request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 4096) return response({ error: "Too large" }, 413);
    const data = env.SITE_PUBLIC_KEY ? await verifyRoom(env.SITE_PUBLIC_KEY, raw, request.headers.get("X-Battle-Signature")) : await verify(env.BATTLE_SECRET, raw, request.headers.get("X-Battle-Signature"));
    if (!data || data.aud !== "sky-result-read" || typeof data.matchId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.matchId)) return response({ error: "Unauthorized" }, 401);
    return env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(data.matchId)).fetch(new Request("https://internal/result"));
  }
  if (url.pathname === "/rooms" && request.method === "POST") {
    if (Number(request.headers.get("Content-Length") || 0) > 4096) return response({ error: "Too large" }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return response({ error: "Too large" }, 413);
    const data = env.SITE_PUBLIC_KEY ? await verifyRoom(env.SITE_PUBLIC_KEY, raw, request.headers.get("X-Battle-Signature")) : await verify(env.BATTLE_SECRET, raw, request.headers.get("X-Battle-Signature"));
    if (!data || data.aud !== "sky-room-create" || !rosterValid(data.players) || typeof data.matchId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.matchId)) return response({ error: "Unauthorized" }, 401);
    const gate = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName("__admission"));
    const admitted = await gate.fetch(new Request("https://internal/admit", { method: "POST", body: JSON.stringify({ matchId: data.matchId, ttl: data.players[0].mission === "survival" ? 10 * 6e4 : 6 * 6e4 }) }));
    if (!admitted.ok) return admitted;
    const stub = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(data.matchId), { locationHint: roomLocationHint(env) });
    const created = await stub.fetch(new Request("https://internal/create", { method: "POST", body: JSON.stringify(data) }));
    if (!created.ok) return created;
    return response({ survivalRoute: true, specialWeapons: true, desertMission: true, aircraftSelection: true, matchId: data.matchId, ws: url.origin.replace("https:", "wss:") + "/room/" + data.matchId, tickets: await Promise.all(data.players.map((p, i) => ticket(env.BATTLE_SECRET, data.matchId, p, i))) });
  }
  if (url.pathname.startsWith("/room/") && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
    if (request.headers.get("Origin") !== env.SITE_ORIGIN) return response({ error: "Origin denied" }, 403);
    const id = url.pathname.slice(6);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return response({ error: "Invalid room" }, 400);
    return env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(id)).fetch(request);
  }
  return response({ error: "Not found" }, 404);
} };
var BattleService = class extends DurableObject {
  static {
    __name(this, "BattleService");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.sockets = /* @__PURE__ */ new Map();
    this.lastSeen = /* @__PURE__ */ new Map();
    this.timer = null;
    this.cycle = 0;
    this.snapshotSchedule = new SnapshotSchedule();
    this.created = 0;
    this.writing = false;
    this.saved = false;
    this.inputTiming = [new InputTiming(), new InputTiming()];
    this.egressProbe = null;
    this.admissionReleased = false;
    this.releasePending = null;
    this.nextRelease = 0;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get("match");
      if (stored) {
        this.created = stored.created;
        this.room = new BattleRoom(stored.id, stored.players);
        if (stored.result) {
          this.room.result = stored.result;
          this.room.phase = "result";
          this.room.game.state = "result";
          this.room.game.score = stored.result.total;
          this.room.game.win = stored.result.win;
        } else {
          this.room.game.finish(false);
          this.room.complete(Date.now(), "service-restarted");
          await ctx.storage.put("match", { ...stored, result: this.room.result });
        }
        this.saved = true;
        void this.releaseAdmission();
      }
    });
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/result") {
      if (!this.room) return response({ error: "Result expired" }, 404);
      if (!this.room.result) return response({ pending: true }, 202);
      return response({ result: this.room.result });
    }
    if (path === "/admit") {
      const { matchId, ttl } = await request.json();
      const decision = await this.ctx.storage.transaction((store) => admitRoom(store, matchId, ttl, Date.now()));
      return Response.json(decision.body, { status: decision.status, headers: { "Cache-Control": "no-store", ...decision.retryAfter ? { "Retry-After": String(decision.retryAfter) } : {} } });
    }
    if (path === "/release" && request.method === "POST") {
      const { matchId } = await request.json();
      return response(await this.ctx.storage.transaction((store) => releaseRoom(store, matchId, Date.now())));
    }
    if (path === "/create") {
      const data = await request.json();
      if (this.room) {
        if (JSON.stringify(this.room.game.players.map((p) => p.id)) !== JSON.stringify(data.players.map((p) => p.id))) return response({ error: "Roster mismatch" }, 409);
        return response({ created: true });
      }
      this.room = new BattleRoom(data.matchId, data.players);
      this.created = Date.now();
      await this.ctx.storage.put("match", { id: data.matchId, players: data.players, created: this.created });
      await this.ctx.storage.setAlarm(this.created + 864e5);
      this.run();
      return response({ created: true });
    }
    if (!this.room) return response({ error: "Room does not exist" }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return response({ error: "WebSocket required" }, 426);
    const pair = new WebSocketPair(), client = pair[0], socket = pair[1];
    socket.accept();
    let slot = null, authenticated = false, authenticating = false, count = 0, start = Date.now(), lastDiagnostic = -Infinity;
    const timeout = setTimeout(() => socket.close(1008, "Authenticate first"), 5e3);
    socket.addEventListener("message", async (event) => {
      try {
        if (typeof event.data !== "string" || event.data.length > 2048) throw Error("size");
        if (Date.now() - start > 1e3) {
          start = Date.now();
          count = 0;
        }
        if (++count > 60) throw Error("rate");
        const msg = JSON.parse(event.data);
        if (!authenticated) {
          if (authenticating || msg.type !== "auth") throw Error("auth");
          authenticating = true;
          const claim = await verify(this.env.BATTLE_SECRET, msg.ticket?.body, msg.ticket?.signature);
          if (!claim || claim.aud !== "sky-battle" || claim.matchId !== this.room.id || this.room.game.players[claim.slot]?.id !== claim.playerId) throw Error("auth");
          slot = claim.slot;
          authenticated = true;
          clearTimeout(timeout);
          this.sockets.get(slot)?.close(1e3, "Replaced");
          this.sockets.set(slot, socket);
          this.lastSeen.set(slot, Date.now());
          this.room.connect(slot, Date.now());
          socket.send(JSON.stringify({ type: "welcome", slot, matchId: this.room.id, version: BACKEND_VERSION, entryColo: request.cf?.colo || null, roomLocationHint: roomLocationHint(this.env) }));
          socket.send(encodeSnapshot(this.room.snapshot(Date.now())));
          this.run();
          return;
        }
        this.lastSeen.set(slot, Date.now());
        if (msg.type === "ping") {
          if (Number.isSafeInteger(msg.nonce)) socket.send(JSON.stringify({ type: "pong", nonce: msg.nonce }));
          return;
        }
        if (msg.type === "diagnostics") {
          if (Date.now() - lastDiagnostic < 3e4) return;
          lastDiagnostic = Date.now();
          this.egressProbe ??= roomEgress();
          const roomEgressColo = await this.egressProbe;
          socket.send(JSON.stringify({ type: "diagnostics", version: BACKEND_VERSION, entryColo: request.cf?.colo || null, roomEgressColo, roomLocationHint: roomLocationHint(this.env) }));
          return;
        }
        const received = Date.now();
        if (this.room.message(slot, msg, received) && msg.type === "input") this.inputTiming[slot].received(msg.seq, received);
      } catch {
        socket.close(1008, "Invalid message");
      }
    });
    const close = /* @__PURE__ */ __name(() => {
      clearTimeout(timeout);
      if (this.sockets.get(slot) === socket) {
        this.sockets.delete(slot);
        this.room.disconnect(slot, Date.now());
      }
    }, "close");
    socket.addEventListener("close", close);
    socket.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }
  releaseAdmission(force = false) {
    if (this.admissionReleased) return Promise.resolve(true);
    if (this.releasePending) return this.releasePending;
    if (!this.room?.result || !force && Date.now() < this.nextRelease) return Promise.resolve(false);
    this.nextRelease = Date.now() + 5e3;
    const pending = (async () => {
      try {
        const gate = this.env.BATTLE_ROOMS.get(this.env.BATTLE_ROOMS.idFromName("__admission"));
        const r = await gate.fetch(new Request("https://internal/release", { method: "POST", body: JSON.stringify({ matchId: this.room.id }) }));
        if (!r.ok) throw Error("Admission release failed");
        this.admissionReleased = true;
        return true;
      } catch {
        try {
          await this.ctx.storage.setAlarm(Math.min(this.created + 864e5, Date.now() + 3e4));
        } catch {
        }
        return false;
      } finally {
        this.releasePending = null;
      }
    })();
    this.releasePending = pending;
    this.ctx.waitUntil(pending);
    return pending;
  }
  run() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      if (!this.room) return;
      if (this.room.phase === "loading" && now - this.created > 6e4 || now - this.created > (this.room.game.campaign === "survival" ? 9 : 5) * 6e4) {
        this.room.game.finish(false);
        this.room.complete(now, "timeout");
      }
      for (const [slot, socket] of this.sockets) if (now - this.lastSeen.get(slot) > 1e4) {
        socket.close(1001, "Heartbeat expired");
        this.room.disconnect(slot, now);
        this.sockets.delete(slot);
      }
      this.room.advance(now);
      this.room.game.players.forEach((p, i) => this.inputTiming[i].applied(p.ackSeq, now));
      if (this.snapshotSchedule.due(now, { phase: this.room.phase, world: this.room.game })) {
        const data = encodeSnapshot({ ...this.room.snapshot(now), inputTiming: this.inputTiming.map((t) => t.sample(now)) });
        for (const socket of this.sockets.values()) try {
          if (socket.bufferedAmount > 262144) {
            socket.close(1013, "Slow connection");
            continue;
          }
          if (socket.bufferedAmount > 32768) continue;
          socket.send(data);
        } catch {
        }
      }
      if (this.room.result) void this.releaseAdmission();
      if (this.room.result && !this.saved && !this.writing) {
        this.writing = true;
        this.ctx.waitUntil(this.ctx.storage.put("match", { id: this.room.id, players: this.room.game.players.map((p) => ({ id: p.id, name: p.name, aircraft: p.aircraft, mission: this.room.game.campaign })), created: this.created, result: this.room.result }).then(() => {
          this.saved = true;
        }).finally(() => {
          this.writing = false;
        }));
      }
      if (this.room.phase === "result" && this.saved && now - this.room.finishedAt > 1e4) {
        clearInterval(this.timer);
        this.timer = null;
        for (const socket of this.sockets.values()) try {
          socket.close(1e3, "Match complete");
        } catch {
        }
        this.sockets.clear();
      }
    }, 1e3 / 30);
  }
  async alarm() {
    if (this.room?.result && Date.now() < this.created + 864e5) {
      await this.releaseAdmission(true);
      await this.ctx.storage.setAlarm(this.admissionReleased ? this.created + 864e5 : Math.min(this.created + 864e5, Date.now() + 3e4));
      return;
    }
    if (this.room?.result) await this.releaseAdmission(true);
    if (this.timer) clearInterval(this.timer);
    for (const socket of this.sockets.values()) socket.close(1e3, "Expired");
    this.sockets.clear();
    this.room = null;
    await this.ctx.storage.deleteAll();
  }
};
export {
  BattleService,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
