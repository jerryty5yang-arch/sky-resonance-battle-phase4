var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../dist/flight-space.js
var FLIGHT_BOUNDS = Object.freeze({ left: 28, right: 452, top: 40, bottom: 760 });

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
    q.active[matchId] = now + ([10 * 6e4, 24 * 60 * 6e4].includes(ttl) ? ttl : 6 * 6e4);
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
var BACKEND_VERSION = 50;
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

// ../dist/skill-build.js
var EMPTY_BUILD = Object.freeze([0, 0, 0]);
function validSkillBuild(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 3) && value.reduce((a, b) => a + b, 0) <= 3;
}
__name(validSkillBuild, "validSkillBuild");
function skillBuild(value, mission) {
  return ["survival", "skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(mission) && validSkillBuild(value) ? [...value] : [0, 0, 0];
}
__name(skillBuild, "skillBuild");
function skillBuildReady(value, mission) {
  return !["survival", "skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(mission) || validSkillBuild(value) && value.reduce((a, b) => a + b, 0) === 3;
}
__name(skillBuildReady, "skillBuildReady");

// ../dist/singers.js
var SINGERS = Object.freeze({
  freyja: Object.freeze({ id: "freyja", name: "\u8299\u857E\u96C5\u30FB\u7DAD\u6069", short: "\u8299\u857E\u96C5", number: 1, role: "\u5F48\u5E55\u63A7\u5236\uFF0F\u7206\u767C\u6E05\u5834", color: "#ffb271", duration: 6, energy: 100, move: 1.5, bullet: 0.4, enemyMove: 1, fire: 1, vulnerability: 1, shields: 0, heal: 0, critChance: 0, critDamage: 1, burst: true, description: "\u5168\u968A\u79FB\u901F \xD71.5\uFF1B\u6575\u5F48\u901F\u5EA6 \xD70.4\uFF1B\u7D50\u675F\u6642\u50C5\u65BD\u653E\u8005\u767C\u5C04 16 \u679A\u905E\u6E1B\u50B7\u5BB3\u8FFD\u8E64\u98DB\u5F48\u3002" }),
  kaname: Object.freeze({ id: "kaname", name: "\u8299\u82BD\u30FB\u5DF4\u5361\u59AE\u96C5", short: "\u8299\u82BD", number: 2, role: "\u9632\u79A6\u7E8C\u6230\uFF0F\u5F31\u9EDE\u589E\u50B7", color: "#ffc767", duration: 6, energy: 100, move: 1, bullet: 1, enemyMove: 1, fire: 1, vulnerability: 1.25, shields: 1, heal: 20, critChance: 0, critDamage: 1, burst: false, description: "\u5168\u968A\u5404\u7372\u8B77\u76FE\uFF0C\u6700\u591A\u62B5\u64CB 1 \u6B21\u6709\u6548\u547D\u4E2D\uFF1B\u6575\u4EBA\u53D7\u50B7 \xD71.25\uFF1B\u65BD\u653E\u8005\u7ACB\u5373\u56DE\u5FA9 20 HP\uFF08\u4E0A\u9650 100\uFF09\u3002" }),
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

// ../dist/missions.js
var MISSIONS = Object.freeze({ convergenceex: { id: "convergenceex", name: "\u4E94\u5883\u4EA4\u754C-EX", phase: "MISSION 06 / EX", storm: "\u4E94\u5883\u5171\u9CF4\u8B66\u5831" }, magmaex: { id: "magmaex", name: "\u7194\u6838\u6DF1\u6DF5-EX", phase: "MISSION 05 / EX", storm: "\u7194\u7210\u5674\u767C\u8B66\u5831" }, frozenex: { id: "frozenex", name: "\u51B0\u5C01\u8981\u585E-EX", phase: "MISSION 04 / EX", storm: "\u6975\u5BD2\u8981\u585E\u8B66\u5831" }, riftex: { id: "riftex", name: "\u661F\u74B0\u88C2\u9699-EX", phase: "MISSION 03 / EX", storm: "\u661F\u74B0\u88C2\u9699\u8B66\u5831" }, survivalex: { id: "survivalex", name: "\u751F\u5B58\u4E4B\u9053-EX", phase: "SURVIVAL EX / STAGE 01", storm: "EX\u9023\u7E8C\u4F5C\u6230" }, deserttest: { id: "deserttest", name: "\u8D64\u7802\u907A\u8DE1-EX", phase: "MISSION 02 / EX", storm: "\u907A\u8DE1\u555F\u52D5\u8B66\u5831" }, skytest: { id: "skytest", name: "\u96F2\u6D77\u9632\u885B\u6230-EX", phase: "MISSION 01 / EX", storm: "\u6575\u8ECD\u8B66\u5831" }, survival: { id: "survival", name: "\u751F\u5B58\u4E4B\u9053", phase: "SURVIVAL ROUTE", storm: "\u9023\u7E8C\u4F5C\u6230" }, sky: { id: "sky", name: "\u96F2\u6D77\u9632\u885B\u6230", phase: "BLUE HORIZON", storm: "\u7D2B\u8272\u98A8\u66B4" }, desert: { id: "desert", name: "\u8D64\u7802\u907A\u8DE1", phase: "SCARLET WASTELAND", storm: "\u8D64\u7802\u98A8\u66B4" } });
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

// ../dist/missile-targeting.js
function nearestEnemy(targets, origin) {
  let best = null, distance = Infinity;
  for (const e of targets) {
    if (e.hp <= 0) continue;
    const d = (e.x - origin.x) ** 2 + (e.y - origin.y) ** 2;
    if (d < distance) {
      distance = d;
      best = e;
    }
  }
  return best;
}
__name(nearestEnemy, "nearestEnemy");

// ../dist/weapon-skills.js
var volleys = /* @__PURE__ */ new WeakMap();
function configureSkills(a, mission, build) {
  a.skillCampaign = ["survival", "skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(mission);
  a.skillBuild = skillBuild(build, mission);
  a.weaponFx = [];
  a.weaponCharges = a.skillCampaign && (a.aircraft === "swift" && a.skillBuild[1] === 3 || a.aircraft === "heavy" && a.skillBuild[2] === 3) ? 2 : 1;
  a.weaponGap = 0;
  a.weaponVolley = 0;
  a.dashShield = 0;
  a.bulletImmune = 0;
  a.speedBoost = 0;
}
__name(configureSkills, "configureSkills");
var levels = /* @__PURE__ */ __name((a) => a.skillBuild || [0, 0, 0], "levels");
function skillCooldown(a) {
  return a.aircraft === "balanced" ? levels(a)[1] ? 7 : 8 : a.aircraft === "swift" ? levels(a)[1] ? 5.5 : 6 : levels(a)[1] ? 9 : 10;
}
__name(skillCooldown, "skillCooldown");
function skillWeaponReady(a) {
  if (a.hp <= 0) return false;
  if (a.skill?.kind === "charge") return a.skillCampaign && a.skill.elapsed >= 0.22 && (levels(a)[2] >= 2 || levels(a)[0] === 3 && a.skill.elapsed < 1.5);
  return !(a.missileCd > 1e-8 || a.weaponGap > 1e-8 || a.skill?.kind === "dash");
}
__name(skillWeaponReady, "skillWeaponReady");
var maxCharges = /* @__PURE__ */ __name((a) => a.aircraft === "swift" && levels(a)[1] === 3 || a.aircraft === "heavy" && levels(a)[2] === 3 ? 2 : 1, "maxCharges");
var addFx = /* @__PURE__ */ __name((a, fx) => {
  a.weaponFx ??= [];
  a.weaponFx.push(fx);
  if (a.weaponFx.length > 40) a.weaponFx.splice(0, a.weaponFx.length - 40);
}, "addFx");
function spend(a) {
  if (maxCharges(a) === 2) {
    a.weaponCharges--;
    if (a.weaponCharges <= 0) a.missileCd = skillCooldown(a);
    else if (a.aircraft === "heavy") a.weaponGap = 2;
  } else a.missileCd = skillCooldown(a);
}
__name(spend, "spend");
function lineDistance(e, s) {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((e.x - s.x0) * dx + (e.y - s.y0) * dy) / len)) : 0;
  return Math.hypot(e.x - s.x0 - dx * t, e.y - s.y0 - dy * t);
}
__name(lineDistance, "lineDistance");
var circleHit = /* @__PURE__ */ __name((e, x, y, r) => e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= r + (e.r || 0), "circleHit");
function radial(a, targets, hit, x, y, r, damage, kind) {
  for (const e of targets) if (circleHit(e, x, y, r)) hit(e, damage);
  const duration = ["impact", "shock"].includes(kind) ? 0.55 : 0.28;
  addFx(a, { kind, x, y, r, remaining: duration, total: duration });
}
__name(radial, "radial");
function clearCircle(bullets, x, y, r) {
  for (const b of bullets) if (Math.hypot(b.x - x, b.y - y) <= r + (b.r || 0)) b.dead = true;
}
__name(clearCircle, "clearCircle");
function clearLine(bullets, s, width) {
  for (const b of bullets) if (lineDistance(b, s) <= width + (b.r || 0)) b.dead = true;
}
__name(clearLine, "clearLine");
function startSkillWeapon(a, p, input, launch, ctx = {}) {
  const [f, m, t] = levels(a);
  if (!skillWeaponReady(a)) return false;
  if (a.skill?.kind === "charge") {
    if (t >= 2) {
      addFx(a, { kind: "mine", x: p.x, y: p.y, remaining: 1.2, total: 1.2 });
      a.skill = null;
      spend(a);
      return true;
    }
    a.skill.queued = true;
    return true;
  }
  if (a.aircraft === "balanced") {
    a.missileCd = skillCooldown(a);
    launch();
    return true;
  }
  if (a.aircraft === "swift") {
    let dx = input?.x || 0, dy = input?.y || 0;
    if (!dx && !dy && input?.target) {
      dx = input.target.x - p.x;
      dy = input.target.y - p.y;
    }
    const l = Math.hypot(dx, dy);
    if (l > 0.01) {
      dx /= l;
      dy /= l;
    } else {
      dx = 0;
      dy = -1;
    }
    a.skill = { kind: "dash", remaining: 0.35, dx, dy, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    a.skillHits = /* @__PURE__ */ new WeakSet();
    a.invuln = Math.max(a.invuln || 0, 0.35);
    if (t >= 1) a.bulletImmune = 0.65;
    spend(a);
    return true;
  }
  const duration = f === 3 ? 2.5 : f >= 2 ? 1.5 : m >= 2 ? 0.9 : 1.2;
  a.skill = { kind: "charge", remaining: duration, total: duration, elapsed: 0, queued: false };
  return true;
}
__name(startSkillWeapon, "startSkillWeapon");
function releaseBeam(a, p, targets, hit, bullets) {
  const [f, m, t] = levels(a), charged = f === 3 && !a.skill.queued, scale = charged ? 1.3 : 1, damage = (f >= 2 ? 250 : f ? 200 : 180) * (charged ? 1.5 : 1);
  const beam = { kind: "beam", remaining: 0.32, total: 0.32, x0: p.x, y0: p.y - 24, x1: p.x, y1: Math.max(-100, p.y - 674), width: 22 * scale, widthScale: scale, flame: charged };
  a.skill = beam;
  let n = 0;
  for (const e of [...targets].sort((a2, b) => b.y - a2.y)) {
    if (e.hp > 0 && e.y <= beam.y0 + (e.r || 0) && e.y >= beam.y1 - (e.r || 0) && Math.abs(e.x - p.x) <= beam.width + (e.r || 0)) {
      const boost = f >= 2 ? Math.min(n * 10, 30) : 0;
      hit(e, damage * (1 + boost / 100));
      if (f >= 2) addFx(a, { kind: "beamBoost", x: e.x, y: e.y, r: e.r || 20, boost, remaining: 0.9, total: 0.9 });
      n++;
    }
  }
  if (m >= 2) a.speedBoost = 1.5;
  if (m === 3) {
    addFx(a, { ...beam, kind: "residual", remaining: 1.5, total: 1.5 });
    clearLine(bullets, beam, beam.width);
  }
  spend(a);
}
__name(releaseBeam, "releaseBeam");
function stepSkillWeapon(a, p, dt, targets, hit, bullets = []) {
  const [f, m, t] = levels(a);
  for (const k of ["weaponGap", "dashShield", "bulletImmune", "speedBoost"]) a[k] = Math.max(0, (a[k] || 0) - dt);
  if (a.weaponCharges === 0 && a.missileCd <= 1e-8) a.weaponCharges = maxCharges(a);
  if (a.hp <= 0) {
    a.skill = null;
    a.weaponFx = [];
    a.dashShield = 0;
    return false;
  }
  for (const fx of [...a.weaponFx || []]) {
    if (fx.kind === "rift") {
      fx.hit ??= /* @__PURE__ */ new WeakSet();
      for (const e of targets) if (e.hp > 0 && !fx.hit.has(e) && lineDistance(e, fx) <= 18 + (e.r || 0)) {
        fx.hit.add(e);
        hit(e, fx.damage);
      }
    }
    if (fx.kind === "residual") clearLine(bullets, fx, fx.width);
    fx.remaining = Math.max(0, fx.remaining - dt);
    if (fx.kind === "mine" && fx.remaining === 0) {
      for (let i = 0; i < 12; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 6, s2 = { x0: fx.x, y0: fx.y, x1: fx.x + Math.cos(angle) * 2e3, y1: fx.y + Math.sin(angle) * 2e3 };
        for (const e of targets) if (e.hp > 0 && lineDistance(e, s2) <= 12 + (e.r || 0)) hit(e, 30);
        addFx(a, { ...s2, kind: "mineBeam", remaining: 0.32, total: 0.32, width: 12 });
      }
    }
  }
  a.weaponFx = (a.weaponFx || []).filter((fx) => fx.remaining > 0);
  const s = a.skill;
  if (!s) return false;
  if (s.kind === "charge") {
    s.elapsed += dt;
    const end = f === 3 ? s.queued ? 1.5 : 2.5 : s.total;
    s.remaining = Math.max(0, end - s.elapsed);
    if (s.remaining < 1e-8) releaseBeam(a, p, targets, hit, bullets);
    return false;
  }
  if (s.kind === "dash") {
    const used = Math.min(dt, s.remaining), x = p.x, y = p.y;
    p.x = Math.max(FLIGHT_BOUNDS.left, Math.min(FLIGHT_BOUNDS.right, p.x + s.dx * 600 * used));
    p.y = Math.max(FLIGHT_BOUNDS.top, Math.min(FLIGHT_BOUNDS.bottom, p.y + s.dy * 600 * used));
    s.x1 = p.x;
    s.y1 = p.y;
    const segment = { x0: x, y0: y, x1: p.x, y1: p.y };
    for (const e of targets) if (e.hp > 0 && !a.skillHits.has(e) && lineDistance(e, segment) < (e.r || 0) + 18) {
      a.skillHits.add(e);
      hit(e, f ? 105 : 90);
    }
    s.remaining = Math.max(0, s.remaining - dt);
    if (s.remaining < 1e-8) {
      a.invuln = Math.max(a.invuln || 0, 0.15);
      if (m >= 2) a.dashShield = 1;
      if (f >= 2) addFx(a, { ...s, kind: "rift", remaining: 0.35, total: 0.35, damage: 52.5, hit: /* @__PURE__ */ new WeakSet() });
      if (f === 3) for (const offset of [0, -Math.PI / 9, Math.PI / 9]) {
        const angle = Math.atan2(s.dy, s.dx) + offset, slash = { x0: p.x, y0: p.y, x1: p.x + Math.cos(angle) * 210, y1: p.y + Math.sin(angle) * 210 };
        for (const e of targets) if (e.hp > 0 && lineDistance(e, slash) < (e.r || 0) + 18) hit(e, 52.5);
        addFx(a, { ...slash, kind: "slash", remaining: 0.3, total: 0.3, width: 18 });
      }
      if (t >= 2) radial(a, targets, hit, p.x, p.y, 100, 45, "impact");
      if (t === 3) {
        radial(a, targets, hit, p.x, p.y, 150, 45, "shock");
        clearCircle(bullets, p.x, p.y, 150);
      }
      s.kind = "trail";
      s.remaining = 0.18;
    }
    return true;
  }
  s.remaining = Math.max(0, s.remaining - dt);
  if (s.remaining === 0) a.skill = null;
  return false;
}
__name(stepSkillWeapon, "stepSkillWeapon");
function skillMovementSpeed(a, base) {
  return a.speedBoost > 0 ? 280 : base;
}
__name(skillMovementSpeed, "skillMovementSpeed");
function skillIncomingDamage(a, amount, source2) {
  if (source2 === "bullet" && a.bulletImmune > 0) return 0;
  return a.skillCampaign && a.aircraft === "heavy" && levels(a)[2] >= 1 && a.skill?.kind === "charge" ? amount * 0.5 : amount;
}
__name(skillIncomingDamage, "skillIncomingDamage");
function skillShieldAvailable(a) {
  return a.dashShield > 0;
}
__name(skillShieldAvailable, "skillShieldAvailable");
function skillFxSnapshot(a) {
  return (a.weaponFx || []).map(({ hit, ...fx }) => fx);
}
__name(skillFxSnapshot, "skillFxSnapshot");
function resetSkillTransient(a) {
  a.weaponFx = [];
  a.dashShield = 0;
  a.bulletImmune = 0;
  a.speedBoost = 0;
  a.skill = null;
}
__name(resetSkillTransient, "resetSkillTransient");
function makeSkillMissiles(a, p, targets, makeId) {
  const [f, m, t] = levels(a), n = f >= 2 ? 10 : 8, id = ++a.weaponVolley, live = targets.filter((e) => e.hp > 0);
  let order = live;
  if (f === 3) order = [...live].sort((a2, b) => rank(a2) - rank(b) || b.hp - a2.hp || (a2.id || 0) - (b.id || 0));
  if (t === 3) {
    order = [...live].sort((a2, b) => rank(b) - rank(a2) || (a2.id || 0) - (b.id || 0));
    if (order.length) order = order.filter((e) => rank(e) === rank(order[0]));
  }
  const registry = volleys.get(a) || /* @__PURE__ */ new Map();
  volleys.set(a, registry);
  registry.set(id, { counts: /* @__PURE__ */ new Map(), boosts: /* @__PURE__ */ new Map(), returned: 0 });
  return Array.from({ length: n }, (_, i) => {
    const target = t === 3 ? order[i % order.length] || null : f === 3 ? order[0] || null : nearestEnemy(live, p);
    return { id: makeId?.(), owner: a.slot || 0, x: p.x + (i % 2 ? 18 : -18), y: p.y, vx: (i % 2 ? 1 : -1) * 150, vy: -50, life: t ? 4.5 : 3.5, age: 0, damage: f ? 22 : 20, super: false, weaponVolley: id, lockIndex: i, target, targetId: target?.id ?? null, rehunts: 0, impacts: 0 };
  });
}
__name(makeSkillMissiles, "makeSkillMissiles");
var rank = /* @__PURE__ */ __name((e) => e.type === "boss" ? 0 : e.type === "elite" ? 1 : 2, "rank");
function stepSkillMissile(a, missile, dt, targets, hit) {
  if (missile.super || missile.weaponVolley === void 0) return false;
  const [f, m, t] = levels(a), live = targets.filter((e2) => e2.hp > 0), old = missile.target;
  let e = old?.hp > 0 && live.includes(old) ? old : missile.targetId != null ? live.find((e2) => e2.id === missile.targetId) : null;
  if (!e) {
    if (f === 3) e = [...live].sort((a2, b) => rank(a2) - rank(b) || b.hp - a2.hp || (a2.id || 0) - (b.id || 0))[0];
    else if (t === 3) {
      const ordered = [...live].sort((a2, b) => rank(b) - rank(a2) || (a2.id || 0) - (b.id || 0)), same = ordered.filter((e2) => rank(e2) === rank(ordered[0]));
      e = same.length ? same[((missile.lockIndex || 0) + missile.rehunts) % same.length] : void 0;
    } else e = nearestEnemy(live, missile);
  }
  missile.target = e || null;
  missile.targetId = e?.id ?? null;
  missile.age += dt;
  missile.life -= dt;
  if (missile.life <= 0) return true;
  if (missile.age > 0.18) {
    const angle = e ? Math.atan2(e.y - missile.y, e.x - missile.x) : -Math.PI / 2;
    missile.vx += (Math.cos(angle) * 430 - missile.vx) * Math.min(1, dt * 5);
    missile.vy += (Math.sin(angle) * 430 - missile.vy) * Math.min(1, dt * 5);
  }
  missile.x += missile.vx * dt;
  missile.y += missile.vy * dt;
  if (e && Math.hypot(missile.x - e.x, missile.y - e.y) < (e.r || 0) + 10) {
    const volley = volleys.get(a)?.get(missile.weaponVolley), count = (volley?.counts.get(e) || 0) + 1;
    volley?.counts.set(e, count);
    const amount = missile.damage * (f === 3 ? 1 + Math.min((count - 1) * 0.1, 0.6) : 1) * (missile.rehunts > 0 ? 0.5 : 1);
    hit(e, amount);
    if (f === 3 && count > 1) {
      let fx = volley?.boosts.get(e);
      if (!fx || !a.weaponFx.includes(fx)) {
        fx = { kind: "lockBoost" };
        volley?.boosts.set(e, fx);
        addFx(a, fx);
      }
      Object.assign(fx, { x: e.x, y: e.y, r: e.r || 20, boost: Math.min(count - 1, 6) * 10, remaining: 0.65, total: 0.65 });
    }
    const killedDirect = e.hp <= 0;
    missile.impacts++;
    if (m >= 2) e.stun = (e.stun || 0) + 0.5 / 2 ** (count - 1);
    if (m === 3 && volley) {
      const rebate = Math.min(0.5 / 2 ** (count - 1), Math.max(0, skillCooldown(a) * 0.5 - volley.returned));
      volley.returned += rebate;
      a.missileCd = Math.max(0, a.missileCd - rebate);
    }
    if (t === 3 && missile.impacts === 1) {
      for (const other of targets) if (circleHit(other, missile.x, missile.y, 45)) hit(other, amount * 0.3);
      addFx(a, { kind: "aoe", x: missile.x, y: missile.y, r: 45, remaining: 0.25, total: 0.25 });
    }
    if (t >= 2 && killedDirect && missile.rehunts === 0 && missile.life > 0) {
      missile.rehunts++;
      missile.target = null;
      missile.targetId = null;
    } else missile.life = 0;
  }
  return true;
}
__name(stepSkillMissile, "stepSkillMissile");
function pruneSkillVolleys(a, missiles) {
  const ids = new Set(missiles.filter((m) => !m.super && m.owner === (a.slot || 0)).map((m) => m.weaponVolley));
  const registry = volleys.get(a);
  if (registry) {
    for (const id of registry.keys()) if (!ids.has(id)) registry.delete(id);
  }
}
__name(pruneSkillVolleys, "pruneSkillVolleys");

// ../dist/boss-phase.js
var clamp = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
function updateBossPhase(g, b, emit) {
  const stage = b.hp < b.maxHp * 0.5 ? 3 : b.hp < b.maxHp * 0.8 ? 2 : 1;
  if (stage <= b.stage) return false;
  clearLaser(g, b);
  g.bullets = [];
  b.stage = stage;
  b.partsUnlocked = true;
  b.attack = "weak";
  b.attackTime = 3;
  b.weakTime = 3;
  b.warning = 0;
  b.openSoon = 0;
  b.laserPart = null;
  b.coreSpecial = null;
  b.coreCooldown = 3;
  emit("boss-phase");
  return true;
}
__name(updateBossPhase, "updateBossPhase");
function shot(g, b, a, speed = 105, split = false, ice = false, x = b.x, y = b.y) {
  if (g.bullets.filter((s) => !s.dead).length >= 320) return;
  g.bullets.push({ id: testId(g), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: ice ? 6 : 5, testBullet: ice ? "frozen" : b.testKind === "M_BOSS" ? "magma" : "sand", ...split ? { splitIn: 1.2, splitAngle: a } : {}, ...ice ? { convergenceIce: true } : {} });
}
__name(shot, "shot");
function plan(g, b, s, target) {
  const a = clamp(Math.atan2(target.y - b.y, target.x - b.x), 0.55, Math.PI - 0.55), second = s.index === 1, rift = b.testKind === "R_BOSS";
  const x = rift ? second ? 425 : 55 : b.x, y = rift ? 90 : b.y + 20;
  const aim = clamp(Math.atan2(target.y - y, target.x - x), 0.55, Math.PI - 0.55);
  b.laser = { x0: x, y0: y, start: rift ? aim : a + (second ? 0.45 : -0.45), end: rift ? aim : a + (second ? -0.45 : 0.45), length: 850, tone: rift ? "rift" : "sky", sourceId: b.id };
  s.mode = "warn";
  s.remaining = 1.2;
}
__name(plan, "plan");
function stepCoreSpecial(g, b, clock, live, onHit) {
  if (b.stage !== 3) return false;
  b.coreCooldown ??= 0;
  if (!b.coreSpecial) {
    b.coreCooldown = Math.max(0, b.coreCooldown - clock);
    if (b.coreCooldown > 0 || !["weak", "recovery"].includes(b.attack)) return false;
    const beam = ["BOSS", "R_BOSS"].includes(b.testKind);
    b.coreSpecial = { elapsed: 0, index: 0, mode: beam ? "init" : "shots", remaining: 0, fired: 0, gaps: live.map((p) => clamp(p.x, 90, 390)), rowY: Math.min(230, ...live.map((p) => p.y - 150)) };
    b.attack = "core-special";
    b.realms = [];
  }
  const s = b.coreSpecial, target = live[Math.floor(b.age / 7) % live.length];
  s.elapsed += clock;
  b.weakTime = 0;
  b.openSoon = 0;
  const done = /* @__PURE__ */ __name(() => {
    clearLaser(g, b);
    b.coreSpecial = null;
    b.coreCooldown = 12;
    b.attack = "weak";
    b.attackTime = 2.5;
    b.weakTime = 2.5;
    b.warning = 0;
  }, "done");
  if (["BOSS", "R_BOSS"].includes(b.testKind)) {
    if (s.mode === "init") plan(g, b, s, target);
    if (s.mode === "warn") {
      const l = b.laser;
      for (let i = 0; i < 5; i++) {
        const a = l.start + (l.end - l.start) * i / 4;
        g.testWarnings.push({ kind: "core-laser", x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(a) * 850, y1: l.y0 + Math.sin(a) * 850 });
      }
    }
    if (s.mode === "beam") updateLaser(g, b, clock);
    s.remaining -= clock;
    if (s.remaining <= 0) {
      if (s.mode === "warn") {
        startLaser(g, b);
        b.attack = "core-special";
        s.mode = "beam";
        s.remaining = 1.2;
        b.beam.total = 1.2;
      } else if (s.mode === "beam") {
        clearLaser(g, b);
        if (s.index === 0) {
          s.mode = "gap";
          s.remaining = 0.8;
          s.index = 1;
        } else done();
      } else if (s.mode === "gap") plan(g, b, s, target);
    }
  } else {
    const ice = b.testKind === "F_BOSS", magma = b.testKind === "M_BOSS";
    if (s.elapsed < 1.2) {
      if (ice) {
        for (let x = 28; x <= 452; x += 20) if (s.gaps.every((a) => Math.abs(x - a) > 60)) g.testWarnings.push({ kind: "core-ice", x0: x, y0: s.rowY, x1: x, y1: s.rowY + 70 });
      } else g.testWarnings.push({ kind: "core-ring", x0: b.x, y0: b.y, x1: target.x, y1: target.y });
    }
    const count = magma ? 3 : 2, interval = magma ? 0.8 : ice ? 0.35 : 0.8;
    while (s.fired < count && s.elapsed >= 1.2 + s.fired * interval) {
      if (ice) {
        for (let x = 28 + s.fired * 10; x <= 452; x += 20) if (s.gaps.every((a) => Math.abs(x - a) > 60) && live.every((p) => Math.hypot(p.x - x, p.y - s.rowY) >= 100)) shot(g, b, Math.PI / 2, 85, false, true, x, s.rowY - s.fired * 18);
      } else if (magma) {
        shot(g, b, Math.atan2(target.y - b.y, target.x - b.x) + (s.fired - 1) * 0.25, 85, true);
      } else {
        s.safeAngle ??= Math.atan2(target.y - b.y, target.x - b.x);
        for (let i = 0; i < 14; i++) {
          const a = i * Math.PI * 2 / 14 + s.fired * Math.PI / 14;
          const diff = Math.atan2(Math.sin(a - s.safeAngle), Math.cos(a - s.safeAngle));
          if (Math.abs(diff) > 0.4) shot(g, b, a, 100);
        }
      }
      s.fired++;
    }
    if (s.elapsed >= (magma ? 4.6 : 2.8)) done();
  }
  for (const p of live) {
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6) onHit(p, "collision");
    for (const part6 of b.parts) if (part6.hp > 0 && Math.hypot(p.x - part6.x, p.y - part6.y) < part6.r + 6) onHit(p, "collision");
  }
  return true;
}
__name(stepCoreSpecial, "stepCoreSpecial");

// ../dist/test-boss.js
var clamp2 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
var combatTargets = /* @__PURE__ */ __name((g) => [...g.enemies.flatMap((e) => e.hp > 0 && !e.phased ? [e, ...(e.parts || []).filter((p) => p.hp > 0)] : []), ...g.boss?.hp > 0 ? [g.boss, ...(g.boss.parts || []).filter((p) => p.hp > 0 && bossPartsUnlocked(g.boss))] : []], "combatTargets");
var testId = /* @__PURE__ */ __name((g) => g.nextId ? g.nextId++ : g.testNextId = (g.testNextId || 1e4) + 1, "testId");
function makeTestBoss(g) {
  const hp = g.players ? 5100 : 3e3, partHp = Math.round(hp * 0.15);
  return {
    id: testId(g),
    type: "boss",
    testKind: "BOSS",
    x: 240,
    y: -100,
    r: 46,
    hp,
    maxHp: hp,
    age: 0,
    fire: 0.5,
    summon: 10,
    stage: 1,
    attack: "volley",
    attackTime: 3,
    volleySide: 0,
    laserSide: 0,
    weakTime: 0,
    parts: [-1, 1].map((side) => ({ id: testId(g), type: "elite", testKind: "TURRET", side, x: 240 + side * 105, y: -90, r: 28, hp: partHp, maxHp: partHp, age: 0, aim: Math.PI / 2, stun: 0 }))
  };
}
__name(makeTestBoss, "makeTestBoss");
function enemyBulletHits(s, p) {
  if (s.testBullet !== "laser") return Math.hypot(s.x - p.x, s.y - p.y) < s.r + 6;
  const a = s.angle ?? Math.PI / 2, dx = p.x - s.x, dy = p.y - s.y;
  return Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) < 15 && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) < (s.width || 16) / 2 + 6;
}
__name(enemyBulletHits, "enemyBulletHits");
function clearLaser(g, b) {
  if (b.beam) g.bullets = g.bullets.filter((s) => s.beamId !== b.beam.id);
  b.beam = null;
}
__name(clearLaser, "clearLaser");
function planLaser(g, b, target) {
  const x0 = b.x, y0 = b.y + 28, aim = Math.atan2(target.y - y0, target.x - x0), sweep = b.stage >= 2, side = b.laserSide++ % 2 ? 1 : -1;
  const center = clamp2(aim, 0.55, Math.PI - 0.55), start = sweep ? center - side * 0.48 : aim, end = sweep ? center + side * 0.48 : aim;
  b.laser = { x0, y0, start, end, length: 850 };
  b.warning = 0.8;
  b.attack = "warning";
  b.attackTime = 0.8;
}
__name(planLaser, "planLaser");
function warning(g, b) {
  const l = b.laser;
  for (let i = 0; i < (b.stage >= 2 ? 5 : 1); i++) {
    const a = l.start + (l.end - l.start) * i / 4;
    g.testWarnings.push({ x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(a) * l.length, y1: l.y0 + Math.sin(a) * l.length, kind: "laser", edge: i === 0 || i === 4 });
  }
}
__name(warning, "warning");
function startLaser(g, b) {
  b.attack = "laser";
  b.attackTime = b.stage >= 2 ? 1.6 : 1.2;
  b.warning = 0;
  b.beam = { ...b.laser, id: testId(g), elapsed: 0, total: b.attackTime };
  for (let d = 0; d <= 850; d += 18) {
    const a = b.beam.start;
    g.bullets.push({ id: testId(g), beamId: b.beam.id, beamDistance: d, testBullet: "laser", tone: b.laser.tone, sourceId: b.laser.sourceId, x: b.beam.x0 + Math.cos(a) * d, y: b.beam.y0 + Math.sin(a) * d, vx: 0, vy: 0, r: 8, width: 16, angle: a });
  }
}
__name(startLaser, "startLaser");
function updateLaser(g, b, clock) {
  const l = b.beam;
  if (!l) return;
  l.elapsed = Math.min(l.total, l.elapsed + clock);
  const a = l.start + (l.end - l.start) * l.elapsed / l.total;
  for (const s of g.bullets) if (s.beamId === l.id) {
    s.angle = a;
    s.x = l.x0 + Math.cos(a) * s.beamDistance;
    s.y = l.y0 + Math.sin(a) * s.beamDistance;
  }
}
__name(updateLaser, "updateLaser");
function stepTestBoss(g, dt, enemyDt, live, onHit, emit, spawn, cap, bullet7) {
  const b = g.boss;
  if (!b || b.hp <= 0) return;
  const stopped = Math.min(dt, b.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
  b.stun = Math.max(0, (b.stun || 0) - dt);
  b.age += edt;
  b.y = Math.min(155, b.y + 65 * edt);
  if (!["warning", "laser"].includes(b.attack)) b.x += (240 + Math.sin(b.age * 0.5) * 65 - b.x) * Math.min(1, edt * 2);
  for (const p of b.parts) {
    p.age = b.age;
    p.x = b.x + p.side * 105;
    p.y = b.y + 10;
    p.stun = Math.max(0, (p.stun || 0) - dt);
    if (p.hp <= 0 && p.destroyedAt === void 0) p.destroyedAt = g.time;
    const target2 = live[(p.side < 0 ? 0 : 1) % Math.max(live.length, 1)];
    if (target2 && p.hp > 0) p.aim = Math.atan2(target2.y - p.y, target2.x - p.x);
  }
  if (b.y < 155 || !live.length) return;
  updateBossPhase(g, b, emit);
  const target = live[Math.floor(b.age / 6) % live.length];
  if (stepCoreSpecial(g, b, clock, live, onHit)) return;
  b.weakTime = b.attack === "weak" ? b.attackTime : 0;
  b.r = b.weakTime > 0 ? 58 : 46;
  if (dt > 0 && clock <= 0) {
    if (b.attack === "warning") warning(g, b);
    return;
  }
  if (b.attack === "volley") {
    b.fire -= clock;
    if (b.fire <= 0) {
      const p = b.parts[b.volleySide++ % 2];
      if (p.hp > 0 && p.stun <= 0) {
        const n = b.stage >= 2 ? p.side < 0 ? 11 : 9 : p.side < 0 ? 5 : 3, spread = b.stage >= 2 ? 0.19 : 0.16;
        for (let i = 0; i < n; i++) {
          const offset = (i - (n - 1) / 2) * spread;
          if (b.stage >= 2 && Math.abs(offset) < 0.15) continue;
          bullet7(g, p.x, p.y + 8, p.aim + offset, b.stage >= 2 ? 140 : 125);
        }
        p.muzzleUntil = g.time + 0.18;
      }
      b.fire = b.stage >= 2 ? 1.05 : 1.2;
    }
  }
  if (b.attack === "warning") warning(g, b);
  if (b.attack === "laser") updateLaser(g, b, clock);
  b.attackTime = Math.max(0, b.attackTime - clock);
  b.warning = b.attack === "warning" ? b.attackTime : 0;
  if (b.attackTime <= 0) {
    if (b.attack === "volley") planLaser(g, b, target);
    else if (b.attack === "warning") startLaser(g, b);
    else if (b.attack === "laser") {
      clearLaser(g, b);
      b.attack = b.stage >= 2 ? "weak" : "recovery";
      b.attackTime = b.stage >= 2 ? 2 : 1.2;
      b.weakTime = b.stage >= 2 ? 2 : 0;
      b.r = b.stage >= 2 ? 58 : 46;
    } else {
      b.attack = "volley";
      b.attackTime = 3;
      b.fire = 0.4;
      b.weakTime = 0;
      b.r = 46;
    }
  }
  if (b.attack !== "weak") {
    b.summon -= clock;
    if (b.summon <= 0 && g.enemies.length <= cap - 3) {
      for (let i = 0; i < 3; i++) spawn(g, b.stage >= 2 && i === 2 ? "E02" : "E01", i, b.stage >= 2 && i === 2 ? null : { shape: "v", slot: i, size: 3 });
      b.summon = 12;
    }
  }
  for (const p of live) {
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 6) onHit(p, "collision");
    for (const t of b.parts) if (t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 6) onHit(p, "collision");
  }
}
__name(stepTestBoss, "stepTestBoss");
var bossPartsUnlocked = /* @__PURE__ */ __name((b) => !!b && (b.partsUnlocked === true || b.hp < b.maxHp * 0.8), "bossPartsUnlocked");
function bossPartDamageMultiplier(g, e) {
  const b = g.boss;
  if (b === e) return b.hp < b.maxHp * 0.5 ? 0.3 : b.hp < b.maxHp * 0.8 ? 0.5 : 1;
  if (!b?.parts?.includes(e)) return 1;
  return bossPartsUnlocked(b) ? 1 : 0;
}
__name(bossPartDamageMultiplier, "bossPartDamageMultiplier");
function unlockBossParts(b) {
  if (b?.hp < b?.maxHp * 0.8) b.partsUnlocked = true;
}
__name(unlockBossParts, "unlockBossParts");

// ../dist/convergence-combo.js
var alive = /* @__PURE__ */ __name((b, k) => b.parts.find((p) => p.testKind === k && p.hp > 0 && p.stun <= 0), "alive");
var clamp3 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
function stepConvergenceCombo(g, b, dt, live, onHit, emit) {
  if (b.stage !== 3) return false;
  b.comboCooldown ??= 3;
  if (!b.combo) {
    b.comboCooldown = Math.max(0, b.comboCooldown - dt);
    if (b.comboCooldown > 0 || b.attack !== "weak" || b.attackTime > 1.8 || !alive(b, "C_ICE") && !alive(b, "C_FIRE")) return false;
    const gaps = live.map((p) => clamp3(p.x, 90, 390));
    b.combo = { elapsed: 0, gaps, rowY: Math.min(240, ...live.map((p) => p.y - 150)), rows: 0, locked: false, exploded: false };
    b.realms = ["frozen", "magma"];
    emit("convergence-combo");
  }
  const c = b.combo, ice = alive(b, "C_ICE"), fire = alive(b, "C_FIRE");
  c.elapsed += dt;
  if (!fire) g.environmentHazards = (g.environmentHazards || []).filter((h) => h.kind !== "convergence-blast" || h.impacted);
  if (ice && c.elapsed < 1.2) {
    for (let x = 28; x <= 452; x += 20) if (c.gaps.every((gap) => Math.abs(x - gap) > 60)) g.testWarnings.push({ kind: "convergence-ice", x0: x, y0: c.rowY, x1: x, y1: c.rowY + 65 });
  }
  while (c.rows < 2 && c.elapsed >= 1.2 + c.rows * 0.35) {
    if (ice) {
      for (let x = 28 + c.rows * 10; x <= 452; x += 20) {
        if (c.gaps.some((gap) => Math.abs(x - gap) <= 60) || live.some((p) => Math.hypot(p.x - x, p.y - c.rowY) < 100)) continue;
        if (g.bullets.filter((p) => !p.dead).length >= 320) break;
        g.bullets.push({ id: testId(g), x, y: c.rowY - c.rows * 18, vx: 0, vy: 85, r: 6, testBullet: "convergence", tone: "frozen", convergenceIce: true, convergenceRealm: -1 });
      }
    }
    c.rows++;
  }
  if (!c.locked && c.elapsed >= 2.7) {
    c.locked = true;
    if (fire) {
      const zones = [];
      for (const p of live) {
        const point = { x: clamp3(p.x, 28, 452), y: clamp3(p.y, 40, 760) };
        if (zones.every((q) => Math.hypot(q.x - point.x, q.y - point.y) > 90)) zones.push(point);
      }
      g.environmentHazards = zones.map((p) => ({ ...p, id: testId(g), kind: "convergence-blast", r: 45, startedAt: g.time, impactAt: g.time + 1.5, impacted: false }));
    }
  }
  for (const h of g.environmentHazards || []) if (h.kind === "convergence-blast" && !h.impacted) {
    h.startedAt = g.time - Math.max(0, c.elapsed - 2.7);
    h.impactAt = g.time + Math.max(0, 4.2 - c.elapsed);
  }
  if (!c.exploded && c.elapsed >= 4.2) {
    c.exploded = true;
    const zones = (g.environmentHazards || []).filter((h) => h.kind === "convergence-blast" && !h.impacted);
    zones.forEach((h) => {
      h.impacted = true;
      h.impactAt = g.time;
    });
    for (const p of live) if (p.hp > 0 && zones.some((h) => Math.hypot(p.x - h.x, p.y - h.y) <= h.r)) onHit(p, "environment");
  }
  g.environmentHazards = (g.environmentHazards || []).filter((h) => !h.impacted || g.time < h.impactAt + 0.55);
  if (c.elapsed >= 4.8) {
    b.combo = null;
    b.comboCooldown = Math.max(0, 12 - c.elapsed);
    b.attack = "weak";
    b.attackTime = 1.2;
    b.realms = [];
    g.environmentHazards = [];
  }
  return true;
}
__name(stepConvergenceCombo, "stepConvergenceCombo");

// ../dist/test-mission.js
var TEST_ENEMIES = Object.freeze({
  E01: { name: "\u96E8\u71D5\u5075\u5BDF\u6A5F", hp: 35, speed: 110, r: 17, type: "scout", interval: 2.8 },
  E02: { name: "\u7375\u96BC\u6514\u622A\u6A5F", hp: 48, speed: 175, r: 18, type: "scout", interval: 2.5 },
  E03: { name: "\u9435\u9DF9\u91CD\u88DD\u6A5F", hp: 260, speed: 70, r: 28, type: "elite", interval: 2.8 },
  E04: { name: "\u96F7\u96F2\u7832\u8247", hp: 180, speed: 60, r: 26, type: "elite", interval: 3.2 },
  E05: { name: "\u8108\u885D\u652F\u63F4\u6A5F", hp: 90, speed: 85, r: 21, type: "scout", interval: 3.8 },
  E06: { name: "\u5E7B\u5F71\u7A81\u64CA\u6A5F", hp: 75, speed: 125, r: 20, type: "scout", interval: 3 },
  EX01: { name: "\u96F7\u7FFC\u6307\u63EE\u5B98", hp: 800, speed: 80, r: 36, type: "elite", interval: 2.5 }
});
var windows = [[5, 14, "E01", 6], [16, 33, "E01", 12], [35, 43, "E02", 4], [45, 57, "E03", 2], [46, 58, "E01", 6], [65, 72, "E04", 2], [75, 80, "E05", 2], [76, 88, "E01", 8], [90, 98, "E06", 4], [100, 100, "EX01", 1], [120, 129, "E03", 2], [121, 133, "E02", 4]];
var TEST_WAVES = windows.flatMap(([start, end, kind, n], wave) => Array.from({ length: n }, (_, i) => {
  const grouped = kind === "E01", batch = Math.floor(i / 3), batches = Math.ceil(n / 3);
  return { time: grouped ? start + (end - start) * batch / Math.max(1, batches - 1) : start + (end - start) * i / Math.max(1, n - 1), kind, index: i, formation: grouped ? { shape: wave % 2 ? "column" : "v", slot: i % 3, size: Math.min(3, n - batch * 3), lane: batch % 3 } : null };
})).sort((a, b) => a.time - b.time);
var clamp4 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
function spawnTestEnemy(g, kind, index = 0, formation = null) {
  const spec = TEST_ENEMIES[kind], coop = !!g.players, side = index % 2 ? 1 : -1;
  let x = kind === "E02" ? side < 0 ? 35 : 445 : 80 + index % 5 * 80, y = -45;
  if (formation) {
    const center = 160 + (formation.lane || 0) * 80, i = formation.slot;
    if (formation.shape === "v") {
      x = center + (i === 0 ? 0 : i % 2 ? -54 : 54);
      y -= i === 0 ? 0 : 42;
    } else {
      x = center;
      y -= i * 52;
    }
  }
  const e = { ...spec, id: testId(g), testKind: kind, x, y, startX: x, formation: formation?.shape || null, maxHp: Math.round(spec.hp * (coop ? 1.5 : 1)), age: 0, fire: 1.4, seed: formation ? 0 : index * 0.8, dashPhase: 0, dashClock: 3, summon: 6, vx: 0, vy: spec.speed };
  e.hp = e.maxHp;
  g.enemies.push(e);
  return e;
}
__name(spawnTestEnemy, "spawnTestEnemy");
function testDamageMultiplier(g, e) {
  return g.mission === "skytest" && e.testKind !== "E05" && e.type !== "boss" && g.enemies.some((s) => s.testKind === "E05" && s.hp > 0 && Math.hypot(s.x - e.x, s.y - e.y) <= 150) ? 0.85 : 1;
}
__name(testDamageMultiplier, "testDamageMultiplier");
function bullet(g, x, y, angle, speed = 135, kind = "normal") {
  g.bullets.push({ id: g.nextId ? g.nextId++ : void 0, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: kind === "laser" ? 7 : 5, testBullet: kind });
}
__name(bullet, "bullet");
function fan(g, e, target, n, spread = 0.22) {
  const a = Math.atan2(target.y - e.y, target.x - e.x);
  for (let i = 0; i < n; i++) bullet(g, e.x, e.y + 15, a + (i - (n - 1) / 2) * spread);
}
__name(fan, "fan");
function stepTestMission(g, dt, enemyDt, players, onHit, emit) {
  g.testWaveIndex ??= 0;
  g.testWarnings = [];
  const cap = g.players ? 16 : 12;
  while (g.testWaveIndex < TEST_WAVES.length && TEST_WAVES[g.testWaveIndex].time <= g.stageTime && g.stageTime < 140) {
    const w = TEST_WAVES[g.testWaveIndex], count = w.formation ? w.formation.size : 1;
    if (g.enemies.filter((e) => e.hp > 0).length + count > cap) break;
    for (let i = 0; i < count; i++) {
      const entry = TEST_WAVES[g.testWaveIndex++];
      spawnTestEnemy(g, entry.kind, entry.index, entry.formation);
    }
  }
  if (g.stageTime >= 140 && g.phase < 1) {
    g.phase = 1;
    emit("test-warning");
  }
  if (g.stageTime >= 150 && !g.boss) {
    g.enemies = [];
    g.bullets = [];
    g.boss = makeTestBoss(g);
    g.bossSpawned = true;
    g.phase = 2;
    emit("boss");
  }
  const live = players.filter((p) => p.hp > 0 && p.connected !== false);
  for (const e of g.enemies) {
    if (e.hp <= 0) continue;
    const stopped = Math.min(dt, e.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
    e.stun = Math.max(0, (e.stun || 0) - dt);
    e.age += edt;
    if (g.stageTime >= 140 && g.stageTime < 150) {
      e.y -= 160 * dt;
      continue;
    }
    const oldX = e.x, oldY = e.y;
    const target = live[e.id % Math.max(1, live.length)];
    if (e.testKind === "E04" || e.testKind === "EX01") {
      e.y = Math.min(e.testKind === "E04" ? 170 : 185, e.y + e.speed * edt);
      e.x = clamp4(e.startX + Math.sin(e.age * 0.7) * 30, 45, 435);
    } else if (e.testKind === "E02") {
      e.y += e.speed * edt;
      e.x = clamp4(e.startX + (e.startX < 240 ? 1 : -1) * Math.sin(Math.min(e.age, 3) / 3 * Math.PI / 2) * 220, 25, 455);
    } else if (e.testKind === "E06") {
      e.dashClock -= clock;
      if (e.dashPhase === 0 && e.dashClock <= 0 && target) {
        e.dashPhase = 1;
        e.dashClock = 0.8;
        e.dashX = target.x;
        e.dashY = target.y;
        const l = Math.hypot(target.x - e.x, target.y - e.y) || 1;
        e.dashVX = (target.x - e.x) / l * 210;
        e.dashVY = (target.y - e.y) / l * 210;
      }
      if (e.dashPhase === 1) {
        g.testWarnings.push({ x0: e.x, y0: e.y, x1: e.dashX, y1: e.dashY, kind: "dash" });
        if (e.dashClock <= 0) {
          e.dashPhase = 2;
          e.dashClock = 0.8;
        }
      } else if (e.dashPhase === 2) {
        e.x += e.dashVX * edt;
        e.y += e.dashVY * edt;
        if (e.dashClock <= 0) {
          e.dashPhase = 0;
          e.dashClock = 3;
        }
      } else {
        e.y += e.speed * edt;
        e.x = clamp4(e.startX + Math.sin(e.age * 2.4) * 55, 25, 455);
      }
    } else {
      e.y += e.speed * edt;
      e.x = clamp4(e.startX + Math.sin(e.age * 1.5 + e.seed) * 15, 25, 455);
    }
    if (dt > 0) {
      e.vx = (e.x - oldX) / dt;
      e.vy = (e.y - oldY) / dt;
    }
    e.charge = e.testKind === "E04" ? clamp4(1 - e.fire / 0.65, 0, 1) : 0;
    e.fire -= clock;
    if (e.fire <= 0 && e.y > 20 && e.y < 600 && target) {
      if (e.testKind === "E01") bullet(g, e.x, e.y, Math.PI / 2);
      else fan(g, e, target, e.testKind === "E03" ? 3 : e.testKind === "E04" ? 5 : e.testKind === "EX01" ? 7 : e.testKind === "E05" ? 1 : 2);
      e.fire = e.interval;
      e.muzzleUntil = g.time + 0.16;
    }
    if (e.testKind === "EX01" && e.y >= 180) {
      e.summon -= clock;
      if (e.summon <= 0 && g.enemies.filter((n) => n.hp > 0).length < cap - 2) {
        spawnTestEnemy(g, "E01", 0, { shape: "v", slot: 1 });
        spawnTestEnemy(g, "E01", 1, { shape: "v", slot: 2 });
        e.summon = 8;
      }
    }
    for (const p of live) if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
      onHit(p, "collision");
      if (e.testKind !== "EX01") e.y = 900;
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.y < 870 && e.y > -320);
  for (const e of g.enemies) e.testProtected = testDamageMultiplier(g, e) < 1;
  stepTestBoss(g, dt, enemyDt, live, onHit, emit, spawnTestEnemy, cap, bullet);
}
__name(stepTestMission, "stepTestMission");

// ../dist/desert-test.js
var clamp5 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
var DESERT_ENEMIES = Object.freeze({
  E07: { name: "\u7802\u71D5\u5075\u5BDF\u6A5F", hp: 45, speed: 125, r: 18, type: "scout", interval: 2.8 },
  E08: { name: "\u8D64\u880D\u6514\u622A\u6A5F", hp: 48, speed: 175, r: 20, type: "scout", interval: 2.6 },
  E09: { name: "\u7802\u5CA9\u91CD\u7532\u6A5F", hp: 360, speed: 75, r: 29, type: "elite", interval: 2.8 },
  E10: { name: "\u907A\u8DE1\u5B88\u885B\u7832\u53F0", hp: 220, speed: 0, r: 27, type: "elite", interval: 3.8 },
  E11: { name: "\u53E4\u4EE3\u80FD\u6E90\u652F\u63F4\u6A5F", hp: 120, speed: 90, r: 22, type: "scout", interval: 4 },
  E12: { name: "\u6C99\u66B4\u7A81\u8972\u6A5F", hp: 100, speed: 140, r: 21, type: "scout", interval: 3 },
  EX02: { name: "\u8D64\u7802\u57F7\u884C\u8005", hp: 1200, speed: 85, r: 37, type: "elite", interval: 3 }
});
var windows2 = [[5, 14, "E07", 8], [16, 29, "E07", 12], [30, 43, "E08", 4], [31, 44, "E07", 4], [45, 58, "E09", 2], [46, 59, "E07", 6], [60, 73, "E10", 2], [75, 80, "E11", 2], [76, 89, "E07", 8], [90, 98, "E12", 4], [100, 100, "EX02", 1], [101, 113, "E07", 4], [120, 130, "E09", 2], [121, 134, "E08", 4]];
var DESERT_WAVES = windows2.flatMap(([start, end, kind, n], wave) => Array.from({ length: n }, (_, i) => {
  const group = kind === "E07", batch = Math.floor(i / 3), batches = Math.ceil(n / 3);
  return { kind, index: i, time: group ? start + (end - start) * batch / Math.max(1, batches - 1) : start + (end - start) * i / Math.max(1, n - 1), formation: group ? { shape: wave % 2 ? "column" : "v", slot: i % 3, size: Math.min(3, n - batch * 3), lane: batch % 3, side: wave === 3 ? batch % 2 ? 1 : -1 : 0 } : null };
})).sort((a, b) => a.time - b.time);
function part(g, kind, side, hp) {
  return { id: testId(g), type: "elite", testKind: kind, side, x: 240 + side * 105, y: -90, r: kind === "D_RING" ? 25 : 27, hp: Math.round(hp * (g.players ? 1.5 : 1)), maxHp: Math.round(hp * (g.players ? 1.5 : 1)), age: 0, aim: Math.PI / 2, fire: 1 };
}
__name(part, "part");
function spawnDesertEnemy(g, kind, index = 0, formation = null) {
  const spec = DESERT_ENEMIES[kind], side = index % 2 ? 1 : -1;
  let x = 80 + index % 5 * 80, y = -55;
  if (kind === "E08") {
    x = side < 0 ? -35 : 515;
    y = 100 + index % 3 * 35;
  }
  if (formation) {
    const i = formation.slot;
    x = 160 + (formation.lane || 0) * 80 + (formation.shape === "v" ? i ? i % 2 ? -50 : 50 : 0 : i % 2 * 22);
    y = -55 - (formation.shape === "v" ? i ? 40 : 0 : i * 48);
    if (formation.side) {
      x = formation.side < 0 ? -55 - i * 45 : 535 + i * 45;
      y = 90 + i % 2 * 40;
    }
  }
  const hp = Math.round(spec.hp * (g.players ? 1.5 : 1));
  const e = { ...spec, id: testId(g), testKind: kind, hp, maxHp: hp, x, y, startX: x, age: 0, seed: index * 0.7, fire: 1.5, buffFactor: 1, side, formation: formation?.shape, sideEntry: formation?.side || 0, entrySafe: kind === "E08" || formation?.side ? 0.8 : 0, holdY: 150 + index % 3 * 45, dashPhase: 0, dashClock: 2.6, summon: 8 };
  if (kind === "EX02") e.parts = [part(g, "EX_ARM", -1, 250), part(g, "EX_ARM", 1, 250)];
  g.enemies.push(e);
  return e;
}
__name(spawnDesertEnemy, "spawnDesertEnemy");
function desertFireMultiplier(g, e) {
  return e.testKind !== "E11" && g.enemies.some((s) => s.testKind === "E11" && s.hp > 0 && Math.hypot(s.x - e.x, s.y - e.y) <= 150) ? 0.85 : 1;
}
__name(desertFireMultiplier, "desertFireMultiplier");
function bullet2(g, x, y, a, speed = 135) {
  g.bullets.push({ id: testId(g), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, testBullet: "sand" });
}
__name(bullet2, "bullet");
function fan2(g, e, target, n, spread = 0.2, speed = 135) {
  const a = Math.atan2(target.y - e.y, target.x - e.x);
  for (let i = 0; i < n; i++) bullet2(g, e.x, e.y + 10, a + (i - (n - 1) / 2) * spread, speed);
  e.muzzleUntil = g.time + 0.18;
}
__name(fan2, "fan");
function armFan(g, arm, target, n, center) {
  const aim = { x: arm.side < 0 ? Math.min(target.x, center - 65) : Math.max(target.x, center + 65), y: Math.max(arm.y + 100, target.y) }, a = Math.atan2(aim.y - arm.y, aim.x - arm.x);
  for (let i = 0; i < n; i++) {
    const angle = a + (i - (n - 1) / 2) * 0.2, landing = arm.x + Math.cos(angle) / Math.sin(angle) * (aim.y - arm.y);
    if (Math.abs(landing - center) < 30) continue;
    bullet2(g, arm.x, arm.y + 10, angle, 130);
  }
  arm.muzzleUntil = g.time + 0.18;
}
__name(armFan, "armFan");
function warnings(g, l, sweep = false) {
  for (let i = 0; i < (sweep ? 5 : 1); i++) {
    const a = l.start + (l.end - l.start) * i / 4;
    g.testWarnings.push({ x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(a) * 850, y1: l.y0 + Math.sin(a) * 850, kind: "sandlaser" });
  }
}
__name(warnings, "warnings");
function laserPlan(e, target, sweep = false, side = 1) {
  const a = clamp5(Math.atan2(target.y - e.y, target.x - e.x), 0.5, Math.PI - 0.5);
  return { x0: e.x, y0: e.y + 15, start: a - (sweep ? side * 0.4 : 0), end: a + (sweep ? side * 0.4 : 0), length: 850, tone: "sand", sourceId: e.id };
}
__name(laserPlan, "laserPlan");
function tickLaser(g, e, clock) {
  if (!e.beam) return;
  updateLaser(g, e, clock);
  e.beamLeft = Math.max(0, e.beamLeft - clock);
  if (e.beamLeft <= 0) clearLaser(g, e);
}
__name(tickLaser, "tickLaser");
function fireLaser(g, e, seconds) {
  const attack = e.attack;
  e.stage = 1;
  startLaser(g, e);
  e.attack = attack;
  e.beam.total = seconds;
  e.beamLeft = seconds;
}
__name(fireLaser, "fireLaser");
function makeDesertBoss(g) {
  const hp = g.players ? 6800 : 4e3;
  return { id: testId(g), type: "boss", testKind: "D_BOSS", x: 240, y: -100, r: 48, hp, maxHp: hp, age: 0, stage: 1, attack: "volley", attackTime: 3.2, fire: 0.5, sideIndex: 0, sweepSide: 0, summon: 10, weakTime: 0, parts: [part(g, "D_ARM", -1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part(g, "D_ARM", 1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part(g, "D_RING", 0, Math.round(hp * 0.15) / (g.players ? 1.5 : 1))] };
}
__name(makeDesertBoss, "makeDesertBoss");
function stepDesertBoss(g, dt, enemyDt, live, onHit, emit) {
  const b = g.boss;
  if (!b || b.hp <= 0) return;
  const stopped = Math.min(dt, b.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
  b.stun = Math.max(0, (b.stun || 0) - dt);
  b.age += edt;
  b.y = Math.min(155, b.y + 65 * edt);
  if (!["warning", "laser"].includes(b.attack)) b.x += (240 + Math.sin(b.age * 0.4) * 40 - b.x) * Math.min(1, edt * 2);
  for (const p of b.parts) {
    p.age = b.age;
    p.x = b.x + p.side * 65;
    p.y = b.y + (p.testKind === "D_RING" ? -68 : -78);
    p.stun = Math.max(0, (p.stun || 0) - dt);
    const target2 = live[(p.side < 0 ? 0 : 1) % Math.max(1, live.length)];
    if (target2) p.aim = Math.atan2(target2.y - p.y, target2.x - p.x);
  }
  if (b.y < 155 || !live.length) return;
  const target = live[Math.floor(b.age / 7) % live.length], ring3 = b.parts[2];
  updateBossPhase(g, b, emit);
  if (stepCoreSpecial(g, b, clock, live, onHit)) return;
  b.weakTime = b.attack === "weak" ? b.attackTime : 0;
  b.r = b.weakTime > 0 ? 60 : 48;
  b.openSoon = b.stage >= 2 && (b.attack === "laser" || b.attack === "warning") ? b.attackTime : 0;
  if (dt > 0 && clock <= 0) {
    if (b.attack === "warning" && b.laser) warnings(g, b.laser, b.stage >= 2);
    return;
  }
  tickLaser(g, b, clock);
  if (b.laserPart && b.parts.find((p) => p.id === b.laserPart)?.hp <= 0) {
    clearLaser(g, b);
    if (["warning", "laser"].includes(b.attack)) {
      b.attack = b.stage >= 2 ? "weak" : "recovery";
      b.attackTime = b.stage >= 2 ? 2.5 : 2;
      b.weakTime = b.stage >= 2 ? 2.5 : 0;
      b.laser = null;
    }
  }
  if (b.attack === "volley") {
    b.fire -= clock;
    if (b.fire <= 0) {
      const arm = b.parts[b.sideIndex++ % 2];
      if (arm.hp > 0 && arm.stun <= 0) armFan(g, arm, target, b.stage >= 2 ? 9 : 5, b.x);
      b.fire = b.stage >= 2 ? 1.1 : 1.25;
    }
    if (b.stage >= 2 && ring3.hp > 0 && ring3.stun <= 0) {
      ring3.fire -= clock;
      if (ring3.fire <= 0) {
        const count = 14, turn = b.age * 0.18;
        for (let i = 0; i < count; i++) bullet2(g, ring3.x, ring3.y, turn + i * Math.PI * 2 / count, 105);
        ring3.fire = 1.3;
        ring3.muzzleUntil = g.time + 0.2;
      }
    }
  }
  if (b.attack === "warning" && b.laser) warnings(g, b.laser, b.stage >= 2);
  b.attackTime = Math.max(0, b.attackTime - clock);
  if (b.attackTime <= 0) {
    if (b.attack === "volley") {
      let source2 = b, side = 1;
      if (b.stage >= 2) {
        side = b.sweepSide++ % 2 ? 1 : -1;
        source2 = b.parts[side < 0 ? 0 : 1];
        if (source2.hp <= 0 || source2.stun > 0) {
          b.attack = "weak";
          b.attackTime = 2.5;
          b.weakTime = 2.5;
          b.r = 60;
          return;
        }
        b.laserPart = source2.id;
      } else {
        b.laserPart = ring3.id;
        if (ring3.hp <= 0 || ring3.stun > 0) {
          b.attack = "recovery";
          b.attackTime = 2;
          return;
        }
      }
      b.laser = laserPlan(source2, target, b.stage >= 2, side);
      b.attack = "warning";
      b.attackTime = 1;
    } else if (b.attack === "warning") {
      const phase = b.stage;
      fireLaser(g, b, phase >= 2 ? 1.5 : 1.2);
      b.stage = phase;
      b.attack = "laser";
      b.attackTime = phase >= 2 ? 1.5 : 1.2;
    } else if (b.attack === "laser") {
      clearLaser(g, b);
      b.attack = b.stage >= 2 ? "weak" : "recovery";
      b.attackTime = b.stage >= 2 ? 2.5 : 2;
      b.weakTime = b.stage >= 2 ? 2.5 : 0;
      b.r = b.stage >= 2 ? 60 : 48;
    } else {
      b.attack = "volley";
      b.attackTime = 3.2;
      b.fire = 0.5;
      b.weakTime = 0;
      b.r = 48;
    }
  }
  if (b.attack !== "weak" && ring3.hp > 0 && ring3.stun <= 0) {
    b.summon -= clock;
    const n = b.stage >= 2 ? 3 : 2, cap = g.players ? 16 : 12;
    if (b.summon <= 0 && g.enemies.filter((e) => e.hp > 0).length + n <= cap) {
      spawnDesertEnemy(g, "E07", 0, { shape: "v", slot: 0, size: 1 });
      if (b.stage === 1) {
        const e = spawnDesertEnemy(g, "E10", 1);
        e.holdY = 180;
      } else {
        spawnDesertEnemy(g, "E07", 1, { shape: "v", slot: 1, size: 1 });
        spawnDesertEnemy(g, "E08", 1);
      }
      b.summon = 13;
    }
  }
  for (const p of live) {
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 6) onHit(p, "collision");
    for (const t of b.parts) if (t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 6) onHit(p, "collision");
  }
}
__name(stepDesertBoss, "stepDesertBoss");
function stepDesertTest(g, dt, enemyDt, players, onHit, emit) {
  g.testWarnings = [];
  g.testWaveIndex ??= 0;
  const cap = g.players ? 16 : 12, live = players.filter((p) => p.hp > 0 && p.connected !== false);
  while (g.testWaveIndex < DESERT_WAVES.length && g.stageTime < 140 && DESERT_WAVES[g.testWaveIndex].time <= g.stageTime) {
    const w = DESERT_WAVES[g.testWaveIndex], count = w.formation ? w.formation.size : 1;
    if (g.enemies.filter((e) => e.hp > 0).length + count > cap) break;
    for (let i = 0; i < count; i++) {
      const n = DESERT_WAVES[g.testWaveIndex++];
      spawnDesertEnemy(g, n.kind, n.index, n.formation);
    }
  }
  if (g.stageTime >= 140 && g.phase < 1) {
    g.phase = 1;
    emit("test-warning");
  }
  if (g.stageTime >= 150 && !g.boss) {
    g.enemies = [];
    g.bullets = [];
    g.boss = makeDesertBoss(g);
    g.bossSpawned = true;
    g.phase = 2;
    emit("boss");
  }
  for (const e of [...g.enemies]) {
    if (e.hp <= 0) continue;
    const stopped = Math.min(dt, e.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
    e.stun = Math.max(0, (e.stun || 0) - dt);
    e.age += edt;
    e.entrySafe = Math.max(0, (e.entrySafe || 0) - clock);
    if (e.entrySafe > 0) {
      const sx = e.sideEntry || e.side, ex = sx < 0 ? 85 : 395;
      g.testWarnings.push({ x0: sx < 0 ? 0 : 480, y0: e.y, x1: ex, y1: e.y, kind: "entry" });
      g.testWarnings.push({ x0: ex - sx * 13, y0: e.y - 10, x1: ex, y1: e.y, kind: "entry" }, { x0: ex - sx * 13, y0: e.y + 10, x1: ex, y1: e.y, kind: "entry" });
    }
    const oldX = e.x, oldY = e.y, target = live[e.id % Math.max(1, live.length)];
    if (g.stageTime >= 140 && g.stageTime < 150) {
      e.y -= 160 * dt;
      clearLaser(g, e);
      continue;
    }
    if (e.testKind === "E10") {
      e.y = Math.min(e.holdY, e.y + 100 * edt);
    } else if (e.testKind === "E11" || e.testKind === "EX02") {
      e.y = Math.min(e.testKind === "EX02" ? 185 : 220, e.y + e.speed * edt);
      e.x = clamp5(e.startX + Math.sin(e.age * 0.7) * 22, 50, 430);
    } else if (e.testKind === "E08") {
      if (e.age < 1.2) e.x -= e.side * e.speed * edt;
      else if (e.age < 1.55) {
      } else {
        if (!e.turn && target) {
          const a = Math.atan2(target.y - e.y, target.x - e.x);
          e.turn = { x: Math.cos(a) * e.speed, y: Math.max(80, Math.sin(a) * e.speed) };
        }
        e.x += (e.turn?.x || 0) * edt;
        e.y += (e.turn?.y || e.speed) * edt;
      }
    } else if (e.testKind === "E12") {
      e.dashClock -= clock;
      if (e.dashPhase === 0 && e.dashClock <= 0 && target) {
        e.dashPhase = 1;
        e.dashClock = 0.8;
        const a = Math.atan2(target.y - e.y, target.x - e.x);
        e.dashAngle = a;
        e.dashX = target.x;
        e.dashY = target.y;
      }
      if (e.dashPhase === 1) {
        g.testWarnings.push({ x0: e.x, y0: e.y, x1: e.dashX, y1: e.dashY, kind: "dash" });
        if (e.dashClock <= 0) {
          e.dashPhase = 2;
          e.dashClock = 1;
        }
      } else if (e.dashPhase === 2) {
        e.x += Math.cos(e.dashAngle) * 230 * edt;
        e.y += Math.sin(e.dashAngle) * 230 * edt;
        if (e.dashClock <= 0) {
          e.dashPhase = 0;
          e.dashClock = 3;
        }
      } else {
        e.x = clamp5(e.startX + Math.sin(e.age * 1.8) * 60, 25, 455);
        e.y += e.speed * edt;
      }
    } else if (e.sideEntry) {
      e.x -= e.sideEntry * e.speed * 0.8 * edt;
      e.y += e.speed * 0.45 * edt;
    } else {
      e.y += e.speed * edt;
      e.x = e.startX + Math.sin(e.age) * 12;
    }
    if (dt > 0) {
      e.vx = (e.x - oldX) / dt;
      e.vy = (e.y - oldY) / dt;
    }
    const factor = desertFireMultiplier(g, e);
    if (factor !== e.buffFactor) {
      e.fire *= factor / (e.buffFactor || 1);
      e.buffFactor = factor;
    }
    e.testHaste = factor < 1;
    e.fire -= clock;
    e.charge = e.testKind === "E10" ? clamp5(1 - e.fire / 0.7, 0, 1) : 0;
    tickLaser(g, e, clock);
    if (e.laserWarning > 0) {
      e.laserWarning = Math.max(0, e.laserWarning - clock);
      warnings(g, e.laser);
      if (e.laserWarning === 0) fireLaser(g, e, 0.7);
    }
    if (e.parts) {
      for (const p of e.parts) {
        p.age = e.age;
        p.x = e.x + p.side * 44;
        p.y = e.y + 12;
        p.stun = Math.max(0, (p.stun || 0) - dt);
        if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);
      }
      e.summon -= clock;
      if (e.summon <= 0 && g.enemies.length + 2 <= cap) {
        spawnDesertEnemy(g, "E07", 0, { shape: "v", slot: 1, size: 1 });
        spawnDesertEnemy(g, "E07", 1, { shape: "v", slot: 2, size: 1 });
        e.summon = 10;
      }
    }
    if ((dt === 0 || clock > 0) && e.fire <= 0 && e.y > 20 && e.y < 600 && e.x > 5 && e.x < 475 && target) {
      if (e.testKind === "EX02") {
        for (const p of e.parts) if (p.hp > 0 && p.stun <= 0) fan2(g, p, target, 3, 0.22);
      } else if (e.testKind === "E10" && (e.volley = (e.volley || 0) + 1) % 2 === 0) {
        e.laser = laserPlan(e, target);
        e.laserWarning = 1;
      } else fan2(g, e, target, e.testKind === "E07" || e.testKind === "E11" ? 1 : e.testKind === "E09" ? 3 : e.testKind === "E10" ? 5 : 2, e.testKind === "E08" ? 0.3 : 0.2);
      e.fire = e.interval * factor;
    }
    for (const p of live) {
      if (!(e.entrySafe > 0) && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
        onHit(p, "collision");
        if (!["E10", "EX02"].includes(e.testKind)) e.y = 900;
      }
      for (const t of e.parts || []) if (t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 6) onHit(p, "collision");
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.y > -320 && e.y < 870 && e.x > -250 && e.x < 730);
  stepDesertBoss(g, dt, enemyDt, live, onHit, emit);
}
__name(stepDesertTest, "stepDesertTest");

// ../dist/rift-ex.js
var clamp6 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
var RIFT_ENEMIES = Object.freeze({
  E13: { name: "\u661F\u5C51\u5075\u5BDF\u6A5F", hp: 55, speed: 175, r: 18, type: "scout", interval: 1.8 },
  E14: { name: "\u76F8\u4F4D\u6514\u622A\u6A5F", hp: 48, speed: 175, r: 20, type: "scout", interval: 2.4 },
  E15: { name: "\u661F\u74B0\u91CD\u7532\u6A5F", hp: 420, speed: 70, r: 29, type: "elite", interval: 3 },
  E16: { name: "\u65CB\u74B0\u7832\u53F0", hp: 250, speed: 0, r: 26, type: "elite", interval: 3.2 },
  E17: { name: "\u5171\u632F\u652F\u63F4\u6A5F", hp: 135, speed: 95, r: 22, type: "scout", interval: 2.5 },
  E18: { name: "\u88C2\u9699\u7A81\u8972\u6A5F", hp: 110, speed: 225, r: 21, type: "scout", interval: 3 },
  EX03: { name: "\u661F\u74B0\u88C1\u6C7A\u8005", hp: 1450, speed: 90, r: 38, type: "elite", interval: 3 }
});
var windows3 = [[5, 14, "E13", 8], [16, 29, "E13", 12], [30, 43, "E14", 4], [31, 44, "E13", 4], [45, 58, "E15", 2], [46, 59, "E13", 6], [60, 73, "E16", 2], [75, 80, "E17", 2], [76, 89, "E13", 8], [90, 98, "E18", 4], [100, 100, "EX03", 1], [101, 113, "E13", 4], [120, 130, "E15", 2], [121, 134, "E14", 4]];
var RIFT_WAVES = windows3.flatMap(([start, end, kind, n], wave) => Array.from({ length: n }, (_, i) => {
  const group = kind === "E13", batch = Math.floor(i / 3), batches = Math.ceil(n / 3);
  return { kind, index: i, time: group ? start + (end - start) * batch / Math.max(1, batches - 1) : start + (end - start) * i / Math.max(1, n - 1), formation: group ? { shape: wave % 2 ? "column" : "arc", slot: i % 3, size: Math.min(3, n - batch * 3), lane: batch % 3 } : null };
})).sort((a, b) => a.time - b.time);
function spawnRiftEnemy(g, kind, index = 0, formation = null) {
  const spec = RIFT_ENEMIES[kind], hp = Math.round(spec.hp * (g.players ? 1.5 : 1)), side = index % 2 ? 1 : -1;
  let x = 80 + index % 5 * 80, y = -60;
  if (formation) {
    x = 130 + formation.lane * 105 + (formation.slot - 1) * 35;
    y -= formation.slot * 36;
  }
  if (kind === "E14" || kind === "E18") {
    x = side < 0 ? 40 : 440;
    y = -65 - index % 3 * 25;
  }
  const e = { ...spec, id: testId(g), testKind: kind, hp, maxHp: hp, x, y, startX: x, seed: index * 0.7, side, formation: formation?.shape, age: 0, fire: 1.5, holdY: 140 + index % 3 * 55, buffFactor: 1, phaseClock: kind === "E18" ? 0.1 : 1.2, summon: 9, cycle: 0 };
  g.enemies.push(e);
  return e;
}
__name(spawnRiftEnemy, "spawnRiftEnemy");
function bullet3(g, x, y, a, speed = 130) {
  if (g.bullets.filter((b) => !b.dead).length >= 360) return;
  g.bullets.push({ id: testId(g), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, testBullet: "rift" });
}
__name(bullet3, "bullet");
function fan3(g, e, target, n = 2, spread = 0.2) {
  const a = Math.atan2(target.y - e.y, target.x - e.x);
  for (let i = 0; i < n; i++) bullet3(g, e.x, e.y + 10, a + (i - (n - 1) / 2) * spread);
  e.muzzleUntil = g.time + 0.18;
}
__name(fan3, "fan");
function radial2(g, e, n, turn = 0, speed = 110) {
  for (let i = 0; i < n; i++) bullet3(g, e.x, e.y, turn + i * Math.PI * 2 / n, speed);
  e.muzzleUntil = g.time + 0.18;
}
__name(radial2, "radial");
var nearest = /* @__PURE__ */ __name((points, p) => points.reduce((d, a) => Math.min(d, Math.hypot(a.x - p.x, a.y - p.y)), Infinity), "nearest");
function safeRiftExit(live, index, y = 200) {
  const xs = [55, 145, 240, 335, 425], options = xs.map((x, i) => ({ x, y: y + i % 2 * 45 }));
  options.sort((a, b) => nearest(live, b) - nearest(live, a));
  let safe = options.filter((p) => nearest(live, p) >= 120);
  if (!safe.length) {
    safe = xs.map((x) => ({ x, y: 45 })).sort((a, b) => nearest(live, b) - nearest(live, a));
  }
  return safe[index % Math.min(2, safe.length)];
}
__name(safeRiftExit, "safeRiftExit");
function riftSupportLinks(g) {
  const result = /* @__PURE__ */ new Map();
  for (const s of g.enemies.filter((e) => e.hp > 0 && e.testKind === "E17")) {
    s.links = g.enemies.filter((e) => e.hp > 0 && !e.phased && ["E13", "E14", "E15", "E16", "E18"].includes(e.testKind) && Math.hypot(e.x - s.x, e.y - s.y) <= 150).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y) || a.id - b.id).slice(0, 3).map((e) => e.id);
    for (const id of s.links) result.set(id, 0.9);
  }
  return result;
}
__name(riftSupportLinks, "riftSupportLinks");
function phaseWarning(g, e) {
  const p = e.exit;
  if (!p) return;
  g.testWarnings.push({ x0: e.x, y0: e.y, x1: p.x, y1: p.y, kind: "phase", radius: e.r });
  if (e.testKind === "E18") g.testWarnings.push({ x0: p.x, y0: p.y, x1: p.x + Math.cos(e.dashAngle) * 800, y1: p.y + Math.sin(e.dashAngle) * 800, kind: "dash" });
}
__name(phaseWarning, "phaseWarning");
function phaseEnemy(g, e, clock, edt, live, target) {
  e.phaseClock -= clock;
  if (e.phaseWarning > 0) {
    e.phaseWarning = Math.max(0, e.phaseWarning - clock);
    phaseWarning(g, e);
    if (e.phaseWarning === 0) {
      e.x = e.exit.x;
      e.y = e.exit.y;
      e.phased = false;
      e.phaseClock = 3.8;
      e.fire = e.interval * e.buffFactor;
      e.arrivalSafe = 0.45;
      e.arrivalShot = 0.3;
      if (e.testKind === "E18") {
        e.dashing = 2;
        e.dashWindup = 0.3;
      }
    }
    return;
  }
  if (e.phaseClock <= 0 && target) {
    e.exit = safeRiftExit(live, e.id, e.testKind === "E18" ? 110 : 180);
    e.phaseWarning = e.testKind === "E18" ? 0.9 : 0.7;
    e.dashTarget = { x: target.x, y: target.y };
    e.dashAngle = Math.atan2(target.y - e.exit.y, target.x - e.exit.x);
    e.phased = e.testKind === "E18";
    phaseWarning(g, e);
    return;
  }
  if (e.dashWindup > 0) {
    e.dashWindup = Math.max(0, e.dashWindup - clock);
  } else if (e.dashing > 0) {
    e.x += Math.cos(e.dashAngle) * e.speed * edt;
    e.y += Math.sin(e.dashAngle) * e.speed * edt;
    e.dashing -= clock;
  } else {
    e.y += e.speed * 0.3 * edt;
    e.x = clamp6(e.x + Math.sin(e.age * 1.4) * 25 * edt, 30, 450);
  }
}
__name(phaseEnemy, "phaseEnemy");
function part2(g, kind, side, hp) {
  hp = Math.round(hp * (g.players ? 1.5 : 1));
  return { id: testId(g), type: "elite", testKind: kind, side, x: 240 + side * 135, y: -100, r: kind === "R_NODE" ? 23 : 27, hp, maxHp: hp, age: 0, aim: Math.PI / 2, stun: 0 };
}
__name(part2, "part");
function makeRiftBoss(g) {
  const hp = g.players ? 8500 : 5e3;
  return { id: testId(g), type: "boss", testKind: "R_BOSS", name: "\u661F\u74B0\u652F\u914D\u8005", x: 240, y: -100, r: 48, hp, maxHp: hp, age: 0, stage: 1, attack: "volley", attackTime: 3.4, fire: 1, sideIndex: 0, ringFire: 1.6, summon: 12, weakTime: 0, parts: [part2(g, "R_GUN", -1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part2(g, "R_GUN", 1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part2(g, "R_NODE", 0, Math.round(hp * 0.15) / (g.players ? 1.5 : 1))] };
}
__name(makeRiftBoss, "makeRiftBoss");
function warnBeam(g, b) {
  const l = b.laser;
  (g.testWarnings ??= []).push({ x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(l.start) * 850, y1: l.y0 + Math.sin(l.start) * 850, kind: "riftlaser" });
}
__name(warnBeam, "warnBeam");
function summons(g, b, cap) {
  const n = b.stage >= 2 ? 6 : 6;
  if (g.enemies.filter((e) => e.hp > 0).length + n > cap) return false;
  for (let i = 0; i < n; i++) {
    const e = spawnRiftEnemy(g, b.stage >= 2 && i < 2 ? "E14" : "E13", i, { shape: "column", slot: i % 3, lane: i % 2 + 1 });
    e.x = i % 2 ? 420 : 60;
    e.startX = e.x;
    e.y = -60 - Math.floor(i / 2) * 55;
  }
  return true;
}
__name(summons, "summons");
function stepRiftBoss(g, dt, enemyDt, live, onHit, emit) {
  const b = g.boss;
  if (!b || b.hp <= 0) return;
  const stopped = Math.min(dt, b.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
  b.stun = Math.max(0, (b.stun || 0) - dt);
  b.age += edt;
  b.y = Math.min(150, b.y + 65 * edt);
  if (!["warning", "laser"].includes(b.attack)) b.x += (240 + Math.sin(b.age * 0.35) * 32 - b.x) * Math.min(1, edt * 2);
  for (const p of b.parts) {
    p.x = b.x + p.side * 135;
    p.y = b.y + (p.testKind === "R_NODE" ? -115 : 15);
    p.age = b.age;
    p.stun = Math.max(0, (p.stun || 0) - dt);
  }
  if (b.y < 150 || !live.length) return;
  const target = live[Math.floor(b.age / 7) % live.length], cap = g.players ? 16 : 12;
  updateBossPhase(g, b, emit);
  if (stepCoreSpecial(g, b, clock, live, onHit)) return;
  b.weakTime = b.attack === "weak" ? b.attackTime : 0;
  b.r = b.weakTime ? 60 : 48;
  b.openSoon = ["warning", "laser"].includes(b.attack) ? b.attackTime : 0;
  if (clock === 0 && dt > 0) {
    if (b.attack === "warning") warnBeam(g, b);
    return;
  }
  if (b.beam) updateLaser(g, b, clock);
  if (b.attack === "volley") {
    b.fire -= clock;
    b.ringFire -= clock;
    const gun = b.parts[b.sideIndex % 2];
    if (gun.hp > 0) {
      gun.charge = clamp6(1 - b.fire / 0.7, 0, 1);
      gun.aim = Math.atan2(target.y - gun.y, target.x - gun.x);
    }
    if (b.fire <= 0) {
      if (gun.hp > 0 && gun.stun <= 0) {
        if (b.stage === 1) fan3(g, gun, target, 5, 0.24);
        else radial2(g, gun, 10, (b.sideIndex % 2 ? -1 : 1) * b.age * 0.3, 105);
      }
      b.sideIndex++;
      b.fire = b.stage >= 2 ? 1.2 : 1.35;
    }
    if (b.ringFire <= 0 && b.stage === 1) {
      radial2(g, b, 12, b.age * 0.12, 105);
      b.ringFire = 9;
    }
  }
  if (b.attack === "warning") warnBeam(g, b);
  b.attackTime = Math.max(0, b.attackTime - clock);
  if (b.attackTime === 0) {
    if (b.attack === "volley") {
      const x = b.stage >= 2 ? b.sideIndex % 2 ? 55 : 425 : b.x, y = b.stage >= 2 ? 90 : b.y + 20, a = clamp6(Math.atan2(target.y - y, target.x - x), 0.5, Math.PI - 0.5);
      b.laser = { x0: x, y0: y, start: a, end: a, length: 850, tone: "rift" };
      b.attack = "warning";
      b.attackTime = b.stage >= 2 ? 1.2 : 1;
    } else if (b.attack === "warning") {
      startLaser(g, b);
      b.attackTime = 1.2;
      b.beam.total = 1.2;
    } else if (b.attack === "laser") {
      clearLaser(g, b);
      b.attack = "weak";
      b.attackTime = b.stage >= 2 ? 3 : 2.5;
      b.weakTime = b.attackTime;
      b.r = 60;
    } else {
      b.attack = "volley";
      b.attackTime = 3.4;
      b.fire = 1;
      b.ringFire = 1.6;
      b.weakTime = 0;
      b.r = 48;
    }
  }
  b.summon -= clock;
  if (b.summon <= 0 && b.attack === "weak" && summons(g, b, cap)) b.summon = b.parts[2].hp > 0 ? 14 : 28;
  for (const p of live) {
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 6) onHit(p, "collision");
    for (const t of b.parts) if (t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 6) onHit(p, "collision");
  }
}
__name(stepRiftBoss, "stepRiftBoss");
function stepRiftEX(g, dt, enemyDt, players, onHit, emit) {
  g.testWarnings = [];
  g.testWaveIndex ??= 0;
  const live = players.filter((p) => p.hp > 0 && p.connected !== false), cap = g.players ? 16 : 12;
  while (g.testWaveIndex < RIFT_WAVES.length && g.stageTime < 140 && RIFT_WAVES[g.testWaveIndex].time <= g.stageTime) {
    const w = RIFT_WAVES[g.testWaveIndex], count = w.formation?.size || 1;
    if (g.enemies.filter((e) => e.hp > 0).length + count > cap) break;
    for (let i = 0; i < count; i++) {
      const n = RIFT_WAVES[g.testWaveIndex++];
      spawnRiftEnemy(g, n.kind, n.index, n.formation);
    }
  }
  if (g.stageTime >= 140 && g.phase < 1) {
    g.phase = 1;
    g.bullets = [];
    emit("test-warning");
  }
  if (g.stageTime >= 150 && !g.boss) {
    g.enemies = [];
    g.bullets = [];
    g.boss = makeRiftBoss(g);
    g.bossSpawned = true;
    g.phase = 2;
    emit("boss");
  }
  const links = riftSupportLinks(g);
  for (const e of [...g.enemies]) {
    if (e.hp <= 0) continue;
    const stopped = Math.min(dt, e.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
    e.stun = Math.max(0, (e.stun || 0) - dt);
    e.age += edt;
    const ox = e.x, oy = e.y, target = live[e.id % Math.max(1, live.length)];
    e.arrivalSafe = Math.max(0, (e.arrivalSafe || 0) - clock);
    if (e.arrivalShot > 0) {
      e.arrivalShot = Math.max(0, e.arrivalShot - clock);
      if (e.arrivalShot === 0 && target) {
        if (nearest(live, e) >= 100) fan3(g, e, e.testKind === "E18" ? e.dashTarget : target, 2);
        else e.arrivalShot = 0.1;
      }
    }
    if (g.stageTime >= 140 && g.stageTime < 150) {
      e.y -= 160 * dt;
      e.phased = false;
      e.phaseWarning = 0;
      continue;
    }
    if (["E14", "E18"].includes(e.testKind)) phaseEnemy(g, e, clock, edt, live, target);
    else if (["E15", "E16", "E17", "EX03"].includes(e.testKind)) {
      e.y = Math.min(e.holdY, e.y + (e.speed || 100) * edt);
      e.x = clamp6(e.startX + Math.sin(e.age * 0.6) * (e.testKind === "E16" ? 0 : 20), 45, 435);
    } else {
      e.y += e.speed * edt;
      e.x = clamp6(e.startX + Math.sin(e.age * 1.2) * (e.formation === "arc" ? 32 : 8), 25, 455);
    }
    if (dt) {
      e.vx = (e.x - ox) / dt;
      e.vy = (e.y - oy) / dt;
    }
    const factor = links.get(e.id) || 1;
    if (factor !== e.buffFactor) {
      e.fire *= factor / e.buffFactor;
      e.buffFactor = factor;
    }
    e.testHaste = factor < 1;
    e.fire -= clock;
    if (e.testKind === "E16") {
      e.charge = clamp6(1 - e.fire / 0.7, 0, 1);
      if (e.fire <= 0.7) for (let i = 0; i < 8; i++) {
        const a = (e.cycle || 0) * Math.PI / 8 + i * Math.PI / 4;
        g.testWarnings.push({ x0: e.x, y0: e.y, x1: e.x + Math.cos(a) * 65, y1: e.y + Math.sin(a) * 65, kind: "gyro" });
      }
    }
    if (clock > 0 && e.fire <= 0 && e.y > 20 && e.y < 600 && !e.phaseWarning && !e.phased && !(e.arrivalSafe > 0) && !(e.arrivalShot > 0) && target) {
      if (e.testKind === "E16") {
        radial2(g, e, 8, e.cycle++ * Math.PI / 8, 110);
        e.fire = e.interval * factor;
      } else if (e.testKind === "EX03") {
        radial2(g, e, 6, e.cycle++ * 0.3, 110);
        if (e.cycle % 2 === 0) {
          e.fire = 2;
          e.weakUntil = g.time + 2;
        } else e.fire = 0.6;
        if (e.summon <= 0 && g.enemies.length + 4 <= cap) {
          for (let i = 0; i < 4; i++) spawnRiftEnemy(g, "E13", i);
          e.summon = 12;
        }
      } else {
        fan3(g, e, target, e.testKind === "E15" ? 5 : ["E14", "E18"].includes(e.testKind) ? 2 : 1, 0.22);
        e.fire = e.interval * factor;
      }
    }
    e.summon -= clock;
    for (const p of live) if (!e.phased && !(e.arrivalSafe > 0) && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
      onHit(p, "collision");
      if (e.type !== "elite") e.y = 900;
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.y > -320 && e.y < 870 && e.x > -250 && e.x < 730);
  stepRiftBoss(g, dt, enemyDt, live, onHit, emit);
}
__name(stepRiftEX, "stepRiftEX");

// ../dist/frozen-ex.js
var clamp7 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
var FROZEN_ENEMIES = Object.freeze({
  E19: { name: "\u51B0\u7FBD\u5075\u5BDF\u6A5F", hp: 60, speed: 150, r: 18, type: "scout", interval: 2.2 },
  E20: { name: "\u971C\u5203\u6514\u622A\u6A5F", hp: 48, speed: 175, r: 20, type: "scout", interval: 2.7 },
  E21: { name: "\u51B0\u5CA9\u91CD\u88DD\u6A5F", hp: 520, speed: 65, r: 29, type: "elite", interval: 3.5 },
  E22: { name: "\u6975\u5BD2\u5B88\u885B\u7832\u53F0", hp: 280, speed: 0, r: 26, type: "elite", interval: 3.8 },
  E23: { name: "\u51B0\u6838\u652F\u63F4\u6A5F", hp: 150, speed: 85, r: 22, type: "scout", interval: 3 },
  E24: { name: "\u66B4\u96EA\u7A81\u8972\u6A5F", hp: 120, speed: 205, r: 21, type: "scout", interval: 3.5 },
  EX04: { name: "\u971C\u93A7\u57F7\u884C\u8005", hp: 1700, speed: 75, r: 38, type: "elite", interval: 3.8 }
});
var windows4 = [[5, 14, "E19", 8], [18, 28, "E19", 9], [30, 41, "E20", 4], [33, 43, "E19", 4], [45, 57, "E21", 2], [49, 59, "E19", 4], [60, 72, "E22", 2], [75, 80, "E23", 2], [77, 88, "E19", 6], [90, 98, "E24", 3], [100, 100, "EX04", 1], [104, 114, "E19", 4], [120, 127, "E21", 2], [125, 133, "E20", 3]];
var FROZEN_WAVES = windows4.flatMap(([start, end, kind, n]) => Array.from({ length: n }, (_, i) => ({ kind, index: i, time: start + (end - start) * i / Math.max(1, n - 1) }))).sort((a, b) => a.time - b.time);
function spawnFrozenEnemy(g, kind, index = 0) {
  const s = FROZEN_ENEMIES[kind], hp = Math.round(s.hp * (g.players ? 1.5 : 1)), side = index % 2 ? 1 : -1, x = kind === "E22" || kind === "E20" || kind === "E24" ? side < 0 ? 65 : 415 : 95 + index % 4 * 95;
  const e = { ...s, id: testId(g), testKind: kind, hp, maxHp: hp, x, y: -65, startX: x, side, age: 0, seed: index * 0.7, holdY: 130 + index % 3 * 55, fire: 2, cycle: 0, charge: 0, dashPhase: "approach" };
  g.enemies.push(e);
  return e;
}
__name(spawnFrozenEnemy, "spawnFrozenEnemy");
function bullet4(g, x, y, a, speed = 125, split = false) {
  if (g.bullets.filter((b2) => !b2.dead).length >= 320) return;
  const b = { id: testId(g), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: split ? 7 : 5, testBullet: "frozen", ...split ? { splitIn: 1.6, splitAngle: a } : {} };
  g.bullets.push(b);
  return b;
}
__name(bullet4, "bullet");
function fan4(g, e, p, n = 3, spread = 0.25, split = false) {
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < n; i++) bullet4(g, e.x, e.y + 10, a + (i - (n - 1) / 2) * spread, split ? 90 : 125, split);
  e.muzzleUntil = g.time + 0.18;
}
__name(fan4, "fan");
function ring(g, e, p, n = 12, turn = 0, split = false) {
  const safe = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < n; i++) {
    const a = turn + i * Math.PI * 2 / n;
    if (Math.abs(Math.atan2(Math.sin(a - safe), Math.cos(a - safe))) < 0.32) continue;
    bullet4(g, e.x, e.y, a, split ? 85 : 105, split);
  }
  e.muzzleUntil = g.time + 0.18;
}
__name(ring, "ring");
function stepFrozenCrystals(g, dt, live) {
  const parents = [...g.bullets];
  for (const b of parents) {
    if (b.dead || !Number.isFinite(b.splitIn)) continue;
    b.splitIn -= dt;
    if (b.splitIn <= 0.65) {
      b.splitWarning = true;
      for (const d of [-0.42, 0.42]) {
        const a = b.splitAngle + d;
        g.testWarnings.push({ kind: "ice-split", x0: b.x, y0: b.y, x1: b.x + Math.cos(a) * 65, y1: b.y + Math.sin(a) * 65 });
      }
    }
    if (b.splitIn > 0) continue;
    if (live.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 100)) {
      b.splitIn = 0.1;
      continue;
    }
    b.dead = true;
    for (const d of [-0.42, 0.42]) bullet4(g, b.x, b.y, b.splitAngle + d, 115, false);
  }
}
__name(stepFrozenCrystals, "stepFrozenCrystals");
function part3(g, kind, side, hp) {
  hp = Math.round(hp * (g.players ? 1.5 : 1));
  return { id: testId(g), type: "elite", testKind: kind, side, x: 240 + side * 125, y: -100, r: kind === "F_NODE" ? 23 : 27, hp, maxHp: hp, age: 0, aim: Math.PI / 2, stun: 0 };
}
__name(part3, "part");
function makeFrozenBoss(g) {
  const hp = g.players ? 11050 : 6500;
  return { id: testId(g), type: "boss", testKind: "F_BOSS", name: "\u96F6\u5EA6\u51B0\u7687", x: 240, y: -100, r: 48, hp, maxHp: hp, age: 0, stage: 1, attack: "volley", attackTime: 3.6, fire: 1.2, sideIndex: 0, crystalFire: 2, summon: 16, weakTime: 0, parts: [part3(g, "F_GUN", -1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part3(g, "F_GUN", 1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part3(g, "F_NODE", 0, Math.round(hp * 0.15) / (g.players ? 1.5 : 1))] };
}
__name(makeFrozenBoss, "makeFrozenBoss");
function warnBeam2(g, b) {
  const l = b.laser;
  g.testWarnings.push({ x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(l.start) * 850, y1: l.y0 + Math.sin(l.start) * 850, kind: "frozen-laser" });
}
__name(warnBeam2, "warnBeam");
function stepFrozenBoss(g, dt, enemyDt, live, onHit, emit) {
  const b = g.boss;
  if (!b || b.hp <= 0) return;
  const stopped = Math.min(dt, b.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
  b.stun = Math.max(0, (b.stun || 0) - dt);
  b.age += edt;
  b.y = Math.min(150, b.y + 60 * edt);
  if (!["warning", "laser"].includes(b.attack)) b.x += (240 + Math.sin(b.age * 0.3) * 24 - b.x) * Math.min(1, edt * 2);
  for (const p of b.parts) {
    p.x = b.x + p.side * 125;
    p.y = b.y + (p.testKind === "F_NODE" ? -100 : 12);
    p.age = b.age;
    p.stun = Math.max(0, (p.stun || 0) - dt);
  }
  if (b.y < 150 || !live.length) return;
  const target = live[Math.floor(b.age / 7) % live.length];
  updateBossPhase(g, b, emit);
  if (stepCoreSpecial(g, b, clock, live, onHit)) return;
  b.weakTime = b.attack === "weak" ? b.attackTime : 0;
  b.r = b.weakTime ? 60 : 48;
  b.openSoon = ["warning", "laser"].includes(b.attack) ? b.attackTime : 0;
  if (clock === 0 && dt > 0) {
    if (b.attack === "warning") warnBeam2(g, b);
    return;
  }
  if (b.beam) updateLaser(g, b, clock);
  if (b.attack === "volley") {
    b.fire -= clock;
    b.crystalFire -= clock;
    const gun = b.parts[b.sideIndex % 2];
    if (gun.hp > 0) {
      gun.charge = clamp7(1 - b.fire / 0.8, 0, 1);
      gun.aim = Math.atan2(target.y - gun.y, target.x - gun.x);
    }
    if (b.fire <= 0) {
      if (gun.hp > 0 && gun.stun <= 0) fan4(g, gun, target, b.stage >= 2 ? 7 : 3, 0.28, false);
      b.sideIndex++;
      b.fire = b.stage >= 2 ? 1.35 : 1.5;
    }
    if (b.crystalFire <= 0 && b.parts[2].hp > 0 && b.parts[2].stun <= 0) {
      if (b.stage >= 2) ring(g, b, target, 12, b.age * 0.14, true);
      else fan4(g, b, target, 3, 0.55, true);
      b.crystalFire = 5;
    }
  }
  if (b.attack === "warning") warnBeam2(g, b);
  b.attackTime = Math.max(0, b.attackTime - clock);
  if (b.attackTime === 0) {
    if (b.attack === "volley") {
      const gun = b.parts.filter((p) => p.testKind === "F_GUN" && p.hp > 0 && p.stun <= 0)[b.sideIndex % Math.max(1, b.parts.filter((p) => p.testKind === "F_GUN" && p.hp > 0 && p.stun <= 0).length)];
      if (!gun) {
        b.attack = "weak";
        b.attackTime = 3.2;
      } else {
        const a = clamp7(Math.atan2(target.y - gun.y, target.x - gun.x), 0.5, Math.PI - 0.5);
        b.laser = { x0: gun.x, y0: gun.y + 10, start: a, end: a, length: 850, tone: "frozen", sourceId: gun.id };
        b.attack = "warning";
        b.attackTime = 1.2;
      }
    } else if (b.attack === "warning") {
      const source2 = b.parts.find((p) => p.id === b.laser.sourceId);
      if (!source2 || source2.hp <= 0) {
        b.attack = "weak";
        b.attackTime = 3.2;
      } else {
        startLaser(g, b);
        b.attackTime = 1.2;
        b.beam.total = 1.2;
      }
    } else if (b.attack === "laser") {
      clearLaser(g, b);
      b.attack = "weak";
      b.attackTime = 3.2;
    } else {
      b.attack = "volley";
      b.attackTime = 3.6;
      b.fire = 1.2;
      b.crystalFire = 2;
      b.weakTime = 0;
      b.r = 48;
    }
  }
  if (["warning", "laser"].includes(b.attack) && b.parts.find((p) => p.id === b.laser?.sourceId)?.hp <= 0) {
    clearLaser(g, b);
    b.attack = "weak";
    b.attackTime = 3.2;
    b.openSoon = 0;
  }
  b.summon -= clock;
  if (b.summon <= 0 && b.attack === "weak" && g.enemies.filter((e) => e.hp > 0).length <= (g.players ? 12 : 9)) {
    for (let i = 0; i < 3; i++) spawnFrozenEnemy(g, "E19", i);
    b.summon = b.parts[2].hp > 0 ? 18 : 30;
  }
  for (const p of live) {
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 6) onHit(p, "collision");
    for (const a of b.parts) if (a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) < a.r + 6) onHit(p, "collision");
  }
}
__name(stepFrozenBoss, "stepFrozenBoss");
function stepFrozenEX(g, dt, enemyDt, players, onHit, emit) {
  g.testWarnings = [];
  g.testWaveIndex ??= 0;
  const live = players.filter((p) => p.hp > 0 && p.connected !== false), cap = g.players ? 16 : 12;
  stepFrozenCrystals(g, dt, live);
  while (g.stageTime < 135 && g.testWaveIndex < FROZEN_WAVES.length && FROZEN_WAVES[g.testWaveIndex].time <= g.stageTime) {
    if (g.enemies.filter((e) => e.hp > 0).length >= cap) break;
    const w = FROZEN_WAVES[g.testWaveIndex++];
    spawnFrozenEnemy(g, w.kind, w.index);
  }
  if (g.stageTime >= 135 && g.phase === 0) {
    g.phase = 1;
    emit("ice-warning");
  }
  if (g.stageTime >= 140 && g.phase < 2) {
    g.phase = 2;
    g.bullets = [];
    emit("test-warning");
  }
  if (g.stageTime >= 150 && !g.boss) {
    g.enemies = [];
    g.bullets = [];
    g.boss = makeFrozenBoss(g);
    g.bossSpawned = true;
    g.phase = 3;
    emit("boss");
  }
  const support = g.enemies.filter((e) => e.hp > 0 && e.testKind === "E23"), linked = /* @__PURE__ */ new Set();
  for (const s of support) {
    s.links = g.enemies.filter((e) => e.hp > 0 && e.id !== s.id && e.testKind !== "E23" && Math.hypot(e.x - s.x, e.y - s.y) < 150).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)).slice(0, 3).map((e) => e.id);
    for (const id of s.links) linked.add(id);
  }
  for (const e of [...g.enemies]) {
    if (e.hp <= 0) continue;
    const stopped = Math.min(dt, e.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
    e.stun = Math.max(0, (e.stun || 0) - dt);
    e.age += edt;
    const ox = e.x, oy = e.y, target = live[e.id % Math.max(1, live.length)];
    if (g.stageTime >= 140 && g.stageTime < 150) {
      e.y -= 150 * dt;
      continue;
    }
    if (["E21", "E22", "E23", "EX04"].includes(e.testKind)) {
      e.y = Math.min(e.holdY, e.y + (e.speed || 85) * edt);
      e.x = clamp7(e.startX + Math.sin(e.age * 0.5) * (e.testKind === "E22" ? 0 : 18), 40, 440);
    } else if (e.testKind === "E24") {
      if (e.dashPhase === "approach") {
        e.y = Math.min(100, e.y + 100 * edt);
        if (e.y >= 100 && target) {
          e.dashPhase = "warning";
          e.dashWarning = 0.9;
          e.dashAngle = clamp7(Math.atan2(target.y - e.y, target.x - e.x), 0.5, Math.PI - 0.5);
        }
      } else if (e.dashPhase === "warning") {
        e.dashWarning = Math.max(0, e.dashWarning - clock);
        g.testWarnings.push({ kind: "ice-dash", x0: e.x, y0: e.y, x1: e.x + Math.cos(e.dashAngle) * 800, y1: e.y + Math.sin(e.dashAngle) * 800 });
        if (e.dashWarning === 0) e.dashPhase = "dash";
      } else {
        e.x += Math.cos(e.dashAngle) * e.speed * edt;
        e.y += Math.sin(e.dashAngle) * e.speed * edt;
      }
    } else {
      e.y += e.speed * edt;
      e.x = clamp7(e.startX + Math.sin(e.age * 1.2) * (e.testKind === "E20" ? 42 : 14), 25, 455);
    }
    if (dt) {
      e.vx = (e.x - ox) / dt;
      e.vy = (e.y - oy) / dt;
    }
    e.testHaste = linked.has(e.id);
    e.fire -= clock * (e.testHaste ? 1 / 0.9 : 1);
    e.charge = ["E21", "E22", "EX04"].includes(e.testKind) ? clamp7(1 - e.fire / 0.8, 0, 1) : 0;
    if (e.testKind === "E22" && e.charge > 0 && target) {
      e.aim ??= Math.atan2(target.y - e.y, target.x - e.x);
      for (const d of [-0.36, 0.36]) g.testWarnings.push({ kind: "ice-turret", x0: e.x, y0: e.y, x1: e.x + Math.cos(e.aim + d) * 280, y1: e.y + Math.sin(e.aim + d) * 280 });
    }
    if (clock > 0 && e.fire <= 0 && e.y > 20 && e.y < 600 && target && (g.stageTime < 135 || g.boss) && e.dashPhase !== "warning") {
      if (e.testKind === "E22") {
        const a = e.aim ?? Math.atan2(target.y - e.y, target.x - e.x);
        for (const d of [-0.36, 0.36]) bullet4(g, e.x, e.y, a + d, 100, true);
        e.aim = void 0;
      } else if (e.testKind === "EX04") ring(g, e, target, 10, e.cycle++ * 0.25, true);
      else fan4(g, e, target, e.testKind === "E21" ? 3 : 1, e.testKind === "E21" ? 0.4 : 0.2, e.testKind === "E21" || e.testKind === "E23");
      e.fire = e.interval;
    }
    for (const p of live) if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
      onHit(p, "collision");
      if (e.type !== "elite") e.y = 900;
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.y > -320 && e.y < 870 && e.x > -250 && e.x < 730);
  stepFrozenBoss(g, dt, enemyDt, live, onHit, emit);
}
__name(stepFrozenEX, "stepFrozenEX");

// ../dist/volcanic-eruption.js
var ERUPTION = Object.freeze({ period: 15, warning: 2, flight: 1, radius: 45, damage: 20 });
var clamp8 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
function landingZones(players, index) {
  const live = players.filter((p) => p.hp > 0 && p.connected !== false), options = [];
  for (const p of live) options.push({ x: clamp8(p.x, 65, 415), y: clamp8(p.y, 100, 700) });
  for (let i = 0; i < 12; i++) {
    const j = (i + index * 5) % 12;
    options.push({ x: [85, 240, 395][j % 3], y: [180, 350, 520, 690][Math.floor(j / 3)] });
  }
  const out = [];
  for (const p of options) {
    if (out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 130)) out.push(p);
    if (out.length === 3) break;
  }
  return out;
}
__name(landingZones, "landingZones");
function clearEruptions(g) {
  g.environmentHazards = [];
  g.eruption = null;
}
__name(clearEruptions, "clearEruptions");
function stepEruptions(g, players, onHit, emit) {
  const b = g.boss;
  if (!b || b.hp <= 0 || g.state !== "playing") {
    clearEruptions(g);
    return false;
  }
  if (!Number.isFinite(b.combatStartedAt)) return false;
  const index = Math.floor((g.time - b.combatStartedAt + 1e-8) / ERUPTION.period);
  b.eruptionIndex ??= 0;
  if (index > b.eruptionIndex) {
    b.eruptionIndex = index;
    const eventId = testId(g);
    g.eruption = { id: eventId, startedAt: g.time };
    g.environmentHazards = landingZones(players, index).map((p) => ({ ...p, id: testId(g), eventId, r: ERUPTION.radius, startedAt: g.time, impactAt: g.time + ERUPTION.warning + ERUPTION.flight, impacted: false }));
    g.bullets = [];
    emit("eruption");
  }
  const hitByEvent = /* @__PURE__ */ new Map();
  for (const h of g.environmentHazards || []) {
    if (h.impacted || g.time < h.impactAt) continue;
    h.impacted = true;
    let hit = hitByEvent.get(h.eventId);
    if (!hit) {
      hit = /* @__PURE__ */ new Set();
      hitByEvent.set(h.eventId, hit);
    }
    for (const p of players) {
      if (p.hp <= 0 || p.connected === false || hit.has(p)) continue;
      if (Math.hypot(p.x - h.x, p.y - h.y) <= h.r) {
        hit.add(p);
        onHit(p, "environment");
        if (g.state !== "playing") {
          clearEruptions(g);
          return false;
        }
      }
    }
  }
  g.environmentHazards = (g.environmentHazards || []).filter((h) => g.time < h.impactAt + 0.55);
  const active = !!g.eruption && g.time - g.eruption.startedAt < 3.55;
  if (!active) g.eruption = null;
  return active;
}
__name(stepEruptions, "stepEruptions");

// ../dist/magma-ex.js
var clamp9 = /* @__PURE__ */ __name((n, a, b) => Math.max(a, Math.min(b, n)), "clamp");
var MAGMA_ENEMIES = Object.freeze({
  E25: { name: "\u7194\u7FBD\u5075\u5BDF\u6A5F", hp: 70, speed: 190, r: 18, type: "scout", interval: 2.2 },
  E26: { name: "\u8D64\u7130\u6514\u622A\u6A5F", hp: 48, speed: 175, r: 20, type: "scout", interval: 2.7 },
  E27: { name: "\u9ED1\u66DC\u91CD\u88DD\u6A5F", hp: 520, speed: 70, r: 29, type: "elite", interval: 3.5 },
  E28: { name: "\u7194\u5CA9\u9632\u885B\u7832\u53F0", hp: 320, speed: 0, r: 26, type: "elite", interval: 3.8 },
  E29: { name: "\u7194\u6838\u652F\u63F4\u6A5F", hp: 160, speed: 95, r: 22, type: "scout", interval: 3 },
  E30: { name: "\u7070\u71FC\u7A81\u8972\u6A5F", hp: 140, speed: 240, r: 21, type: "scout", interval: 3.5 },
  EX05: { name: "\u7194\u6838\u57F7\u884C\u8005", hp: 1700, speed: 85, r: 38, type: "elite", interval: 3.8 }
});
var windows5 = [[5, 14, "E25", 8], [16, 29, "E25", 12], [30, 43, "E26", 4], [31, 44, "E25", 6], [45, 58, "E27", 2], [47, 59, "E25", 6], [60, 73, "E28", 2], [75, 80, "E29", 2], [77, 89, "E25", 8], [90, 98, "E30", 4], [100, 100, "EX05", 1], [104, 118, "E25", 4], [120, 130, "E27", 2], [122, 134, "E26", 4]];
var MAGMA_WAVES = windows5.flatMap(([start, end, kind, n]) => Array.from({ length: n }, (_, i) => ({ kind, index: i, time: start + (end - start) * i / Math.max(1, n - 1) }))).sort((a, b) => a.time - b.time);
function spawnMagmaEnemy(g, kind, index = 0) {
  const s = MAGMA_ENEMIES[kind], hp = Math.round(s.hp * (g.players ? 1.5 : 1)), side = index % 2 ? 1 : -1, x = kind === "E28" || kind === "E26" || kind === "E30" ? side < 0 ? 65 : 415 : 95 + index % 4 * 95;
  const e = { ...s, id: testId(g), testKind: kind, hp, maxHp: hp, x, y: -65, startX: x, side, age: 0, seed: index * 0.7, holdY: 130 + index % 3 * 55, fire: 2, cycle: 0, charge: 0, dashPhase: "approach" };
  if (kind === "EX05") {
    e.summon = 14;
    e.parts = [part4(g, "M_ARM", -1, 250), part4(g, "M_ARM", 1, 250)];
  }
  g.enemies.push(e);
  return e;
}
__name(spawnMagmaEnemy, "spawnMagmaEnemy");
function bullet5(g, x, y, a, speed = 125, split = false) {
  if (g.bullets.filter((b2) => !b2.dead).length >= 320) return;
  const b = { id: testId(g), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: split ? 7 : 5, testBullet: "magma", ...split ? { splitIn: 1.2, splitAngle: a } : {} };
  g.bullets.push(b);
  return b;
}
__name(bullet5, "bullet");
function fan5(g, e, p, n = 3, spread = 0.25, split = false) {
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < n; i++) bullet5(g, e.x, e.y + 10, a + (i - (n - 1) / 2) * spread, split ? 90 : 125, split);
  e.muzzleUntil = g.time + 0.18;
}
__name(fan5, "fan");
function ring2(g, e, p, n = 12, turn = 0, split = false) {
  const safe = Math.atan2(p.y - e.y, p.x - e.x);
  for (let i = 0; i < n; i++) {
    const a = turn + i * Math.PI * 2 / n;
    if (Math.abs(Math.atan2(Math.sin(a - safe), Math.cos(a - safe))) < 0.32) continue;
    bullet5(g, e.x, e.y, a, split ? 85 : 105, split);
  }
  e.muzzleUntil = g.time + 0.18;
}
__name(ring2, "ring");
function stepMagmaCrystals(g, dt, live) {
  const parents = [...g.bullets];
  for (const b of parents) {
    if (b.dead || !Number.isFinite(b.splitIn)) continue;
    b.splitIn -= dt;
    if (b.splitIn <= 0.65) {
      b.splitWarning = true;
      for (let i = 0; i < 6; i++) {
        const a = b.splitAngle + Math.PI / 6 + i * Math.PI / 3;
        g.testWarnings.push({ kind: "magma-split", x0: b.x, y0: b.y, x1: b.x + Math.cos(a) * 65, y1: b.y + Math.sin(a) * 65 });
      }
    }
    if (b.splitIn > 0) continue;
    if (live.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 100)) {
      b.splitIn = 0.1;
      continue;
    }
    b.dead = true;
    for (let i = 0; i < 6; i++) bullet5(g, b.x, b.y, b.splitAngle + Math.PI / 6 + i * Math.PI / 3, 105, false);
  }
}
__name(stepMagmaCrystals, "stepMagmaCrystals");
function part4(g, kind, side, hp) {
  hp = Math.round(hp * (g.players ? 1.5 : 1));
  return { id: testId(g), type: "elite", testKind: kind, side, x: 240 + side * 125, y: -100, r: kind === "M_NODE" ? 23 : 27, hp, maxHp: hp, age: 0, aim: Math.PI / 2, stun: 0 };
}
__name(part4, "part");
function makeMagmaBoss(g) {
  const hp = g.players ? 12240 : 7200;
  return { id: testId(g), type: "boss", testKind: "M_BOSS", name: "\u7194\u6838\u66B4\u541B", x: 240, y: -100, r: 48, hp, maxHp: hp, age: 0, stage: 1, attack: "volley", attackTime: 3.6, fire: 1.2, sideIndex: 0, crystalFire: 2, summon: 16, weakTime: 0, parts: [part4(g, "M_GUN", -1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part4(g, "M_GUN", 1, Math.round(hp * 0.15) / (g.players ? 1.5 : 1)), part4(g, "M_NODE", 0, Math.round(hp * 0.15) / (g.players ? 1.5 : 1))] };
}
__name(makeMagmaBoss, "makeMagmaBoss");
function warnBeam3(g, b) {
  const l = b.laser;
  g.testWarnings.push({ x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(l.start) * 850, y1: l.y0 + Math.sin(l.start) * 850, kind: "magma-laser" });
}
__name(warnBeam3, "warnBeam");
function stepMagmaBoss(g, dt, enemyDt, live, onHit, emit) {
  const b = g.boss;
  if (!b || b.hp <= 0) return;
  const stopped = Math.min(dt, b.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
  b.stun = Math.max(0, (b.stun || 0) - dt);
  b.age += edt;
  b.y = Math.min(150, b.y + 60 * edt);
  if (!["warning", "laser"].includes(b.attack)) b.x += (240 + Math.sin(b.age * 0.3) * 24 - b.x) * Math.min(1, edt * 2);
  for (const p of b.parts) {
    p.x = b.x + p.side * 125;
    p.y = b.y + (p.testKind === "M_NODE" ? -100 : 12);
    p.age = b.age;
    p.stun = Math.max(0, (p.stun || 0) - dt);
  }
  if (b.y < 150 || !live.length) return;
  b.combatStartedAt ??= g.time;
  const erupting = stepEruptions(g, live, onHit, emit);
  if (g.state !== "playing") return;
  const target = live[Math.floor(b.age / 7) % live.length];
  updateBossPhase(g, b, emit);
  const contact = /* @__PURE__ */ __name(() => {
    for (const p of live) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 6) onHit(p, "collision");
      for (const a of b.parts) if (a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) < a.r + 6) onHit(p, "collision");
    }
  }, "contact");
  if (erupting) {
    contact();
    b.coreSpecial = null;
    clearLaser(g, b);
    b.attack = "weak";
    b.attackTime = 3.2;
    b.weakTime = 3.2;
    b.openSoon = 0;
    b.r = 60;
    return;
  }
  if (stepCoreSpecial(g, b, clock, live, onHit)) return;
  b.weakTime = b.attack === "weak" ? b.attackTime : 0;
  b.r = b.weakTime ? 60 : 48;
  b.openSoon = ["warning", "laser"].includes(b.attack) ? b.attackTime : 0;
  if (clock === 0 && dt > 0) {
    if (b.attack === "warning") warnBeam3(g, b);
    return;
  }
  if (b.beam) updateLaser(g, b, clock);
  if (b.attack === "volley") {
    b.fire -= clock;
    b.crystalFire -= clock;
    const gun = b.parts[b.sideIndex % 2];
    if (gun.hp > 0) {
      gun.charge = clamp9(1 - b.fire / 0.8, 0, 1);
      gun.aim = Math.atan2(target.y - gun.y, target.x - gun.x);
    }
    if (b.fire <= 0) {
      if (gun.hp > 0 && gun.stun <= 0) fan5(g, gun, target, b.stage >= 2 ? 5 : 3, 0.3, gun.side > 0 && b.stage >= 2);
      b.sideIndex++;
      b.fire = b.stage >= 2 ? 1.35 : 1.5;
    }
    if (b.crystalFire <= 0 && b.parts[2].hp > 0 && b.parts[2].stun <= 0) {
      if (b.stage >= 2) ring2(g, b, target, 10, b.age * 0.14, true);
      else fan5(g, b, target, 1, 0.55, true);
      b.crystalFire = 5;
    }
  }
  if (b.attack === "warning") warnBeam3(g, b);
  b.attackTime = Math.max(0, b.attackTime - clock);
  if (b.attackTime === 0) {
    if (b.attack === "volley") {
      const gun = b.parts.filter((p) => p.testKind === "M_GUN" && p.hp > 0 && p.stun <= 0)[b.sideIndex % Math.max(1, b.parts.filter((p) => p.testKind === "M_GUN" && p.hp > 0 && p.stun <= 0).length)];
      if (!gun) {
        b.attack = "weak";
        b.attackTime = 3.2;
      } else {
        const a = clamp9(Math.atan2(target.y - gun.y, target.x - gun.x), 0.5, Math.PI - 0.5);
        b.laser = { x0: gun.x, y0: gun.y + 10, start: a, end: a, length: 850, tone: "magma", sourceId: gun.id };
        b.attack = "warning";
        b.attackTime = 1.2;
      }
    } else if (b.attack === "warning") {
      const source2 = b.parts.find((p) => p.id === b.laser.sourceId);
      if (!source2 || source2.hp <= 0) {
        b.attack = "weak";
        b.attackTime = 3.2;
      } else {
        startLaser(g, b);
        b.attackTime = 1.2;
        b.beam.total = 1.2;
      }
    } else if (b.attack === "laser") {
      clearLaser(g, b);
      b.attack = "weak";
      b.attackTime = 3.2;
    } else {
      b.attack = "volley";
      b.attackTime = 3.6;
      b.fire = 1.2;
      b.crystalFire = 2;
      b.weakTime = 0;
      b.r = 48;
    }
  }
  if (["warning", "laser"].includes(b.attack) && b.parts.find((p) => p.id === b.laser?.sourceId)?.hp <= 0) {
    clearLaser(g, b);
    b.attack = "weak";
    b.attackTime = 3.2;
    b.openSoon = 0;
  }
  b.summon -= clock;
  if (b.summon <= 0 && b.attack === "weak" && g.enemies.filter((e) => e.hp > 0).length <= (g.players ? 12 : 9)) {
    for (let i = 0; i < 3; i++) spawnMagmaEnemy(g, b.stage >= 2 && i === 2 ? "E26" : "E25", i);
    b.summon = b.parts[2].hp > 0 ? 18 : 30;
  }
  contact();
}
__name(stepMagmaBoss, "stepMagmaBoss");
function stepMagmaEX(g, dt, enemyDt, players, onHit, emit) {
  g.testWarnings = [];
  g.testWaveIndex ??= 0;
  const live = players.filter((p) => p.hp > 0 && p.connected !== false), cap = g.players ? 16 : 12;
  stepMagmaCrystals(g, dt, live);
  while (g.stageTime < 135 && g.testWaveIndex < MAGMA_WAVES.length && MAGMA_WAVES[g.testWaveIndex].time <= g.stageTime) {
    if (g.enemies.filter((e) => e.hp > 0).length >= cap) break;
    const w = MAGMA_WAVES[g.testWaveIndex++];
    spawnMagmaEnemy(g, w.kind, w.index);
  }
  if (g.stageTime >= 135 && g.phase === 0) {
    g.phase = 1;
    emit("magma-warning");
  }
  if (g.stageTime >= 140 && g.phase < 2) {
    g.phase = 2;
    g.bullets = [];
    emit("test-warning");
  }
  if (g.stageTime >= 150 && !g.boss) {
    g.enemies = [];
    g.bullets = [];
    g.boss = makeMagmaBoss(g);
    g.bossSpawned = true;
    g.phase = 3;
    emit("boss");
  }
  const support = g.enemies.filter((e) => e.hp > 0 && e.testKind === "E29"), linked = /* @__PURE__ */ new Set();
  for (const s of support) {
    s.links = g.enemies.filter((e) => e.hp > 0 && e.id !== s.id && e.testKind !== "E29" && Math.hypot(e.x - s.x, e.y - s.y) < 150).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)).slice(0, 3).map((e) => e.id);
    for (const id of s.links) linked.add(id);
  }
  for (const e of [...g.enemies]) {
    if (e.hp <= 0) continue;
    const stopped = Math.min(dt, e.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
    e.stun = Math.max(0, (e.stun || 0) - dt);
    e.age += edt;
    const ox = e.x, oy = e.y, target = live[e.id % Math.max(1, live.length)];
    if (g.stageTime >= 140 && g.stageTime < 150) {
      e.y -= 150 * dt;
      continue;
    }
    if (["E27", "E28", "E29", "EX05"].includes(e.testKind)) {
      e.y = Math.min(e.holdY, e.y + (e.speed || 85) * edt);
      e.x = clamp9(e.startX + Math.sin(e.age * 0.5) * (e.testKind === "E28" ? 0 : 18), 40, 440);
    } else if (e.testKind === "E30") {
      if (e.dashPhase === "approach") {
        e.y = Math.min(100, e.y + 100 * edt);
        if (e.y >= 100 && target) {
          e.dashPhase = "warning";
          e.dashWarning = 0.9;
          e.dashAngle = clamp9(Math.atan2(target.y - e.y, target.x - e.x), 0.5, Math.PI - 0.5);
        }
      } else if (e.dashPhase === "warning") {
        e.dashWarning = Math.max(0, e.dashWarning - clock);
        let wx = e.x, wy = e.y, wa = e.dashAngle;
        for (let i = 0; i < 6; i++) {
          wa += e.side * 0.32 / 3;
          const nx = wx + Math.cos(wa) * e.speed / 3, ny = wy + Math.sin(wa) * e.speed / 3;
          g.testWarnings.push({ kind: "magma-dash", x0: wx, y0: wy, x1: nx, y1: ny });
          wx = nx;
          wy = ny;
        }
        if (e.dashWarning === 0) e.dashPhase = "dash";
      } else {
        e.dashAngle += e.side * 0.32 * edt;
        e.x += Math.cos(e.dashAngle) * e.speed * edt;
        e.y += Math.sin(e.dashAngle) * e.speed * edt;
      }
    } else {
      e.y += e.speed * edt;
      e.x = clamp9(e.startX + Math.sin(e.age * 1.2) * (e.testKind === "E26" ? 42 : 14), 25, 455);
    }
    if (e.testKind === "EX05") e.summon -= clock;
    for (const p of e.parts || []) {
      p.x = e.x + p.side * 62;
      p.y = e.y + 4;
      p.age = e.age;
      p.stun = Math.max(0, (p.stun || 0) - dt);
    }
    if (dt) {
      e.vx = (e.x - ox) / dt;
      e.vy = (e.y - oy) / dt;
    }
    e.testHaste = linked.has(e.id);
    e.fire -= clock * (e.testHaste ? 1 / 0.9 : 1);
    e.charge = ["E27", "E28", "EX05"].includes(e.testKind) ? clamp9(1 - e.fire / 0.8, 0, 1) : 0;
    if (e.testKind === "E28" && e.charge > 0 && target) {
      e.aim ??= Math.atan2(target.y - e.y, target.x - e.x);
      for (const d of [-0.36, 0.36]) g.testWarnings.push({ kind: "magma-turret", x0: e.x, y0: e.y, x1: e.x + Math.cos(e.aim + d) * 280, y1: e.y + Math.sin(e.aim + d) * 280 });
    }
    if (clock > 0 && e.fire <= 0 && e.y > 20 && e.y < 600 && target && (g.stageTime < 135 || g.boss) && e.dashPhase !== "warning") {
      if (e.testKind === "E28") {
        const a = e.aim ?? Math.atan2(target.y - e.y, target.x - e.x);
        for (const d of [-0.36, 0.36]) bullet5(g, e.x, e.y, a + d, 100, true);
        e.aim = void 0;
      } else if (e.testKind === "EX05") {
        for (const p of e.parts.filter((p2) => p2.hp > 0 && p2.stun <= 0)) fan5(g, p, target, 3, 0.28, false);
        if (e.summon <= 0 && g.enemies.length <= cap - 2) {
          for (let i = 0; i < 2; i++) spawnMagmaEnemy(g, "E25", i);
          e.summon = 14;
        }
      } else fan5(g, e, target, e.testKind === "E27" ? 3 : 1, e.testKind === "E27" ? 0.4 : 0.2, e.testKind === "E27" || e.testKind === "E29");
      e.fire = e.interval;
    }
    for (const p of live) if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
      onHit(p, "collision");
      if (e.type !== "elite") e.y = 900;
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.y > -320 && e.y < 870 && e.x > -250 && e.x < 730);
  stepMagmaBoss(g, dt, enemyDt, live, onHit, emit);
}
__name(stepMagmaEX, "stepMagmaEX");

// ../dist/convergence-ex.js
var REALMS = Object.freeze(["sky", "desert", "rift", "frozen", "magma"]);
var REALM_LABELS = Object.freeze({ sky: "\u96F2\u6D77", desert: "\u8D64\u7802", rift: "\u661F\u74B0", frozen: "\u51B0\u5C01", magma: "\u7194\u6838" });
var spawners = [spawnTestEnemy, spawnDesertEnemy, spawnRiftEnemy, spawnFrozenEnemy, spawnMagmaEnemy];
var steppers = [stepTestMission, stepDesertTest, stepRiftEX, stepFrozenEX, stepMagmaEX];
var kinds = [["E01", "E02", "E03"], ["E07", "E08", "E10"], ["E13", "E14", "E16"], ["E19", "E20", "E21"], ["E25", "E26", "E27"]];
var CONVERGENCE_WAVES = Object.freeze(kinds.flatMap((ks, realm) => [
  ...Array.from({ length: 6 }, (_, index) => ({ time: 5 + realm * 25 + index * 2.4, realm, kind: ks[0], index })),
  ...Array.from({ length: 2 }, (_, index) => ({ time: 16 + realm * 25 + index * 4, realm, kind: ks[1], index })),
  { time: 22 + realm * 25, realm, kind: ks[2], index: realm % 2 }
]).sort((a, b) => a.time - b.time));
function spawnConvergenceEnemy(g, realm, kind, index = 0) {
  const e = spawners[realm](g, kind, index);
  e.convergenceRealm = realm;
  return e;
}
__name(spawnConvergenceEnemy, "spawnConvergenceEnemy");
function part5(g, kind, side, hp) {
  hp = Math.round((g.players ? 14280 : 8400) * 0.15);
  return { id: testId(g), testKind: kind, type: "elite", side, x: 240 + side * 110, y: -100, r: kind.endsWith("WING") ? 22 : 27, hp, maxHp: hp, age: 0, aim: Math.PI / 2, stun: 0 };
}
__name(part5, "part");
function makeConvergenceBoss(g) {
  const hp = g.players ? 14280 : 8400;
  return { id: testId(g), type: "boss", testKind: "C_BOSS", name: "\u754C\u5F8B\u6838\u5FC3\u30FB\u4E94\u5883\u88C1\u6C7A\u8005", x: 240, y: -100, r: 45, hp, maxHp: hp, age: 0, stage: 1, realms: ["sky"], cycleIndex: 0, attack: "volley", attackTime: 3.8, fire: 0.8, summon: 20, weakTime: 0, parts: [part5(g, "C_FIRE", -1, 850), part5(g, "C_ICE", 1, 850), part5(g, "C_SKY_WING", -1, 550), part5(g, "C_SAND_WING", 1, 550)] };
}
__name(makeConvergenceBoss, "makeConvergenceBoss");
var clamp10 = /* @__PURE__ */ __name((x, a, b) => Math.max(a, Math.min(b, x)), "clamp");
function bullet6(g, x, y, a, speed = 125, split = false) {
  if (g.bullets.filter((b) => !b.dead).length >= 320) return;
  g.bullets.push({ id: testId(g), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: split ? 7 : 5, testBullet: "convergence", convergenceRealm: -1, ...split ? { splitIn: 1.2, splitAngle: a } : {} });
}
__name(bullet6, "bullet");
var sourceKinds = { sky: "C_SKY_WING", desert: "C_SAND_WING", frozen: "C_ICE", magma: "C_FIRE" };
function source(b, realm) {
  return realm === "rift" ? b : b.parts.find((p) => p.testKind === sourceKinds[realm] && p.hp > 0 && p.stun <= 0);
}
__name(source, "source");
function fireRealm(g, b, realm, target) {
  const s = source(b, realm);
  if (!s) return;
  const a = Math.atan2(target.y - s.y, target.x - s.x);
  s.muzzleUntil = g.time + 0.2;
  s.aim = a;
  if (realm === "rift") {
    const n = b.stage === 3 ? 18 : 12;
    for (let i = 0; i < n; i++) {
      const angle = i * Math.PI * 2 / n + b.age * 0.12;
      if (Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a))) > 0.36) bullet6(g, s.x, s.y, angle, 100);
    }
    return;
  }
  const count = (b.stage >= 2 ? { sky: 7, desert: 9, frozen: 11, magma: 7 } : { sky: 3, desert: 5, frozen: 7, magma: 3 })[realm], spread = { sky: 0.22, desert: 0.24, frozen: 0.19, magma: 0.34 }[realm];
  for (let i = 0; i < count; i++) bullet6(g, s.x, s.y + 8, a + (i - (count - 1) / 2) * spread, realm === "frozen" ? 95 : realm === "sky" ? 140 : 115, realm === "magma" && i === Math.floor(count / 2));
}
__name(fireRealm, "fireRealm");
function setCycle(b) {
  const i = b.cycleIndex % 5;
  b.realms = b.stage === 1 ? [REALMS[i]] : [REALMS[i], REALMS[(i + 2) % 5]];
  b.attack = "volley";
  b.attackTime = 3.8;
  b.fire = 0.8;
  b.weakTime = 0;
  b.openSoon = 0;
}
__name(setCycle, "setCycle");
function planBeam(b, p, seconds = 1.2) {
  const a = clamp10(Math.atan2(p.y - b.y, p.x - b.x), 0.5, Math.PI - 0.5);
  b.laser = { x0: b.x, y0: b.y + 15, start: a, end: a, length: 850, tone: "rift", sourceId: b.id };
  b.attack = "warning";
  b.attackTime = seconds;
  b.warning = seconds;
  b.realms = ["rift"];
}
__name(planBeam, "planBeam");
function beamWarning(g, b) {
  const l = b.laser;
  g.testWarnings.push({ kind: "convergence-laser", x0: l.x0, y0: l.y0, x1: l.x0 + Math.cos(l.start) * 850, y1: l.y0 + Math.sin(l.start) * 850 });
}
__name(beamWarning, "beamWarning");
function stepConvergenceBoss(g, dt, enemyDt, live, onHit, emit) {
  const b = g.boss;
  if (!b || b.hp <= 0) return;
  g.testWarnings ??= [];
  const stopped = Math.min(dt, b.stun || 0), clock = dt - stopped, edt = dt ? enemyDt * clock / dt : 0;
  b.stun = Math.max(0, (b.stun || 0) - dt);
  b.age += edt;
  b.y = Math.min(155, b.y + 65 * edt);
  if (!["warning", "laser"].includes(b.attack)) b.x += (240 + Math.sin(b.age * 0.28) * 16 - b.x) * Math.min(1, edt * 2);
  for (const p of b.parts) {
    const wing = p.testKind.endsWith("WING");
    p.x = b.x + p.side * (wing ? 90 : 115);
    p.y = b.y + (wing ? -72 : 14);
    p.age = b.age;
    p.stun = Math.max(0, (p.stun || 0) - dt);
    if (p.hp <= 0) p.destroyedAt ??= g.time;
  }
  if (b.y < 155 || !live.length) return;
  const target = live[Math.floor(b.age / 7) % live.length];
  if (b.stage === 1 && b.hp < b.maxHp * 0.8 || b.stage === 2 && b.hp < b.maxHp * 0.5) {
    clearLaser(g, b);
    g.bullets = [];
    b.stage = b.hp < b.maxHp * 0.5 ? 3 : 2;
    b.attack = "weak";
    b.attackTime = 3;
    b.realms = [];
    b.cycleIndex = 0;
    b.combo = null;
    b.comboCooldown = 3;
    g.environmentHazards = [];
    emit("boss-phase");
  }
  b.weakTime = b.attack === "weak" ? b.attackTime : 0;
  b.r = b.weakTime > 0 ? 57 : 45;
  b.openSoon = ["warning", "laser"].includes(b.attack) ? b.attackTime : 0;
  if (b.attack === "warning") beamWarning(g, b);
  if (b.attack === "judgment") {
    b.realms = [REALMS[b.judgmentIndex]];
    const s = source(b, b.realms[0]);
    if (s && b.attackTime > 0.7) {
      const a = Math.atan2(target.y - s.y, target.x - s.x);
      g.testWarnings.push({ kind: "convergence-realm", x0: s.x, y0: s.y, x1: s.x + Math.cos(a) * 650, y1: s.y + Math.sin(a) * 650 });
    }
  }
  if (clock === 0 && dt > 0) {
    if (b.combo) stepConvergenceCombo(g, b, 0, live, onHit, emit);
    return;
  }
  if (stepConvergenceCombo(g, b, clock, live, onHit, emit)) {
    for (const p of live) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6) onHit(p, "collision");
      for (const part6 of b.parts) if (part6.hp > 0 && Math.hypot(p.x - part6.x, p.y - part6.y) < part6.r + 6) onHit(p, "collision");
    }
    return;
  }
  if (b.attack === "volley") {
    b.fire -= clock;
    if (b.fire <= 0) {
      for (const realm of b.realms) fireRealm(g, b, realm, target);
      b.fire = (b.stage >= 2 ? 1.35 : 1.35) * (b.parts.some((p) => p.testKind === "C_SAND_WING" && p.hp > 0 && p.stun <= 0) ? 0.9 : 1);
    }
  }
  if (b.attack === "judgment" && !b.judgmentFired && b.attackTime - clock <= 0.7) {
    fireRealm(g, b, REALMS[b.judgmentIndex], target);
    b.judgmentFired = true;
  }
  if (b.attack === "laser") updateLaser(g, b, clock);
  b.attackTime = Math.max(0, b.attackTime - clock);
  b.warning = b.attack === "warning" ? b.attackTime : 0;
  if (b.attackTime === 0) {
    if (b.attack === "volley") planBeam(b, target);
    else if (b.attack === "warning") {
      startLaser(g, b);
      b.attackTime = b.stage === 3 ? 1.8 : 1.2;
      b.beam.total = b.attackTime;
    } else if (b.attack === "laser") {
      clearLaser(g, b);
      b.attack = "weak";
      b.attackTime = b.stage === 3 ? 1.8 : 2.4;
      b.realms = [];
      b.warning = 0;
    } else if (b.attack === "judgment") {
      b.judgmentIndex++;
      if (b.judgmentIndex < 5) {
        b.attackTime = 1.6;
        b.judgmentFired = false;
      } else planBeam(b, target, 1.5);
    } else {
      b.cycleIndex++;
      if (b.stage >= 2 && b.cycleIndex % (b.stage === 3 ? 2 : 3) === 0) {
        b.attack = "judgment";
        b.judgmentIndex = 0;
        b.judgmentFired = false;
        b.attackTime = 1.6;
        b.realms = ["sky"];
        emit("convergence-judgment");
      } else setCycle(b);
    }
  }
  b.summon -= clock;
  const skyWing = b.parts.find((p) => p.testKind === "C_SKY_WING");
  if (b.summon <= 0 && b.attack === "weak" && skyWing.hp > 0 && skyWing.stun <= 0 && g.enemies.filter((e) => e.hp > 0).length <= 4) {
    for (let i = 0; i < 2; i++) spawnConvergenceEnemy(g, b.stage >= 2 ? 2 : 0, b.stage >= 2 ? "E13" : "E01", i);
    b.summon = 20;
  }
  for (const p of live) {
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6) onHit(p, "collision");
    for (const s of b.parts) if (s.hp > 0 && Math.hypot(p.x - s.x, p.y - s.y) < s.r + 6) onHit(p, "collision");
  }
}
__name(stepConvergenceBoss, "stepConvergenceBoss");
function stepRealmEnemies(g, dt, enemyDt, players, onHit) {
  const all = g.enemies, liveBullets = g.bullets, remaining = [], warnings2 = [];
  let bullets = liveBullets;
  for (let realm = 0; realm < 5; realm++) {
    const enemies = all.filter((e) => e.convergenceRealm === realm), own = bullets.filter((b) => b.convergenceRealm === realm), other = bullets.filter((b) => b.convergenceRealm !== realm);
    const shadow = Object.create(g);
    Object.defineProperty(shadow, "stageTime", { value: g.stageTime >= 135 && g.stageTime < 150 ? g.stageTime : 20 });
    Object.assign(shadow, { mission: ["skytest", "deserttest", "riftex", "frozenex", "magmaex"][realm], enemies, bullets: own, boss: null, testWaveIndex: Infinity, testWarnings: [], phase: 3 });
    const quiet = g.stageTime >= 135 && g.stageTime < 140, fire = quiet ? enemies.map((e) => e.fire) : [];
    if (quiet) enemies.forEach((e) => e.fire = Infinity);
    steppers[realm](shadow, dt, enemyDt, players, onHit, () => {
    });
    if (quiet) enemies.forEach((e, i) => e.fire = fire[i]);
    for (const e of shadow.enemies) e.convergenceRealm = realm;
    for (const b of shadow.bullets) b.convergenceRealm = realm;
    remaining.push(...shadow.enemies);
    bullets = other.concat(shadow.bullets);
    warnings2.push(...shadow.testWarnings);
    if (g.nextId !== void 0) g.nextId = shadow.nextId;
    if (shadow.testNextId !== void 0) g.testNextId = shadow.testNextId;
  }
  g.enemies = remaining;
  g.bullets = bullets;
  g.testWarnings.push(...warnings2);
}
__name(stepRealmEnemies, "stepRealmEnemies");
function stepConvergenceEX(g, dt, enemyDt, players, onHit, emit) {
  g.testWarnings = [];
  g.testWaveIndex ??= 0;
  const cap = g.players ? 16 : 12, live = players.filter((p) => p.hp > 0 && p.connected !== false);
  while (g.stageTime < 135 && g.testWaveIndex < CONVERGENCE_WAVES.length && CONVERGENCE_WAVES[g.testWaveIndex].time <= g.stageTime) {
    if (g.enemies.filter((e) => e.hp > 0).length >= cap) break;
    const w = CONVERGENCE_WAVES[g.testWaveIndex++];
    spawnConvergenceEnemy(g, w.realm, w.kind, w.index);
  }
  if (g.stageTime >= 135 && g.phase === 0) {
    g.phase = 1;
    emit("convergence-warning");
  }
  if (g.stageTime >= 140 && g.phase < 2) {
    g.phase = 2;
    g.bullets = [];
    emit("test-warning");
  }
  if (g.stageTime >= 150 && !g.boss) {
    g.enemies = [];
    g.bullets = [];
    g.boss = makeConvergenceBoss(g);
    g.bossSpawned = true;
    g.phase = 3;
    emit("boss");
  }
  stepRealmEnemies(g, dt, enemyDt, players, onHit);
  const bossBullets = g.bullets.filter((b) => b.convergenceRealm === -1), rest = g.bullets.filter((b) => b.convergenceRealm !== -1), shadow = Object.create(g);
  shadow.bullets = bossBullets;
  shadow.testWarnings = g.testWarnings;
  stepMagmaCrystals(shadow, dt, live);
  for (const b of shadow.bullets) b.convergenceRealm = -1;
  g.bullets = rest.concat(shadow.bullets);
  if (g.nextId !== void 0) g.nextId = shadow.nextId;
  if (shadow.testNextId !== void 0) g.testNextId = shadow.testNextId;
  stepConvergenceBoss(g, dt, enemyDt, live, onHit, emit);
  if (g.bullets.filter((b) => !b.dead).length > 384) {
    const lasers = g.bullets.filter((b) => b.testBullet === "laser"), others = g.bullets.filter((b) => b.testBullet !== "laser");
    g.bullets = others.slice(0, Math.max(0, 384 - lasers.length)).concat(lasers);
  }
}
__name(stepConvergenceEX, "stepConvergenceEX");
function convergenceDamageMultiplier() {
  return 1;
}
__name(convergenceDamageMultiplier, "convergenceDamageMultiplier");

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

// ../dist/ex-route.js
function enterEXIntermission(g) {
  g.environmentHazards = [];
  g.eruption = null;
  g.state = "intermission";
  g.res = 0;
  g.intro = 0;
  g.introTime = 0;
  g.burst = 0;
  g.boss = null;
  g.enemies = [];
  g.bullets = [];
  g.shots = [];
  g.missiles = [];
  g.pickups = [];
  g.particles = [];
  g.criticalHits = [];
  g.testWarnings = [];
  g.supportDamage = new SupportDamage();
  for (const a of g.players || [g]) {
    resetSkillTransient(a);
    configureSkills(a, "survivalex", [0, 0, 0]);
    a.shield = 0;
    a.shieldHitUntil = 0;
    a.missileCd = 0;
    a.fire = 0;
    a.lastInput = -Infinity;
    a.input = { x: 0, y: 0 };
  }
}
__name(enterEXIntermission, "enterEXIntermission");
function startEXStageTwo(g, builds) {
  const actors = g.players || [g];
  if (g.campaign !== "survivalex" || g.state !== "intermission" || (g.stageIndex < 0 || g.stageIndex >= 5) || !Array.isArray(builds) || builds.length !== actors.length) return false;
  if (!actors.every((a, i) => a.connected === false || skillBuildReady(builds[i], "survivalex"))) return false;
  g.environmentHazards = [];
  g.eruption = null;
  g.stageIndex++;
  g.stageStartedAt = g.time;
  g.mission = ["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex"][g.stageIndex];
  g.state = "playing";
  g.phase = 0;
  g.bossSpawned = false;
  g.boss = null;
  g.testWaveIndex = 0;
  g.testWarnings = [];
  g.spawn = 1;
  g.flash = 0;
  g.lastInput = {};
  g.supportSlot = void 0;
  g.supportSinger = g.singer || "freyja";
  actors.forEach((a, i) => {
    configureSkills(a, "survivalex", a.connected === false ? [0, 0, 0] : builds[i]);
    a.hp = a.connected === false ? 0 : 100;
    a.invuln = 2;
    a.fire = 0;
    a.missileCd = 0;
    a.shield = 0;
    a.shieldHitUntil = 0;
    a.lastInput = -Infinity;
    a.input = { x: 0, y: 0 };
    if (g.players) {
      a.x = 180 + a.slot * 120;
      a.y = 620;
    } else g.p = { x: 240, y: 620 };
  });
  return true;
}
__name(startEXStageTwo, "startEXStageTwo");

// ../dist/weapons.js
var WEAPONS = { balanced: { name: "\u591A\u91CD\u9396\u5B9A", cooldown: 8, description: "8 \u679A\u98DB\u5F48\u9396\u5B9A\u6700\u8FD1\u6575\u6A5F \xB7 \u76EE\u6A19\u6B7B\u4EA1\u5F8C\u91CD\u65B0\u9396\u5B9A \xB7 \u51B7\u537B 8 \u79D2" }, swift: { name: "\u75BE\u98A8\u7A81\u9032", cooldown: 6, description: "\u6CBF\u79FB\u52D5\u65B9\u5411\u7A81\u9032 \xB7 \u885D\u523A\u4E2D\u7121\u6575 0.35 \u79D2\uFF0C\u7D50\u675F\u5F8C\u53E6\u52A0 0.15 \u79D2 \xB7 \u51B7\u537B 6 \u79D2" }, heavy: { name: "\u8CAB\u7A7F\u91CD\u7832", cooldown: 10, description: "\u84C4\u529B 1.2 \u79D2\u5F8C\u767C\u5C04\u8CAB\u7A7F\u5149\u675F \xB7 \u51B7\u537B 10 \u79D2" } };
var weaponRules = /* @__PURE__ */ __name((id) => WEAPONS[Object.hasOwn(WEAPONS, id) ? id : "balanced"], "weaponRules");
function startWeapon(actor, pos, aircraft, input, launch) {
  if (actor.skillCampaign) return startSkillWeapon(actor, pos, input, launch);
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
function stepWeapon(actor, pos, dt, targets, damage, bullets = []) {
  if (actor.skillCampaign) return stepSkillWeapon(actor, pos, dt, targets, damage, bullets);
  const skill = actor.skill;
  if (!skill) return false;
  if (actor.hp <= 0) {
    actor.skill = null;
    return false;
  }
  if (skill.kind === "dash") {
    const used = Math.min(dt, skill.remaining), x = pos.x, y = pos.y;
    pos.x = Math.max(FLIGHT_BOUNDS.left, Math.min(FLIGHT_BOUNDS.right, x + skill.dx * 600 * used));
    pos.y = Math.max(FLIGHT_BOUNDS.top, Math.min(FLIGHT_BOUNDS.bottom, y + skill.dy * 600 * used));
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

// src/combat.mjs
var clamp11 = /* @__PURE__ */ __name((v, a, b) => Math.max(a, Math.min(b, v)), "clamp");
var CoopCombat = class {
  static {
    __name(this, "CoopCombat");
  }
  constructor(players, random = Math.random) {
    this.supportDamage = new SupportDamage();
    this.campaign = missionRules(players[0]?.mission).id;
    this.mission = this.campaign === "survivalex" ? "skytest" : this.campaign === "survival" ? "sky" : this.campaign;
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
    this.players.forEach((p, i) => configureSkills(p, this.campaign, players[i].build));
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
      resetSkillTransient(p);
      p.shield = 0;
      p.skill = null;
      p.fire = 0;
      p.invuln = 2;
      p.x = 180 + p.slot * 120;
      p.y = 620;
    }
    this.event("stage", { mission: this.mission, stage: 2 });
  }
  startEXNextStage(builds) {
    if (!startEXStageTwo(this, builds)) return false;
    this.event("stage", { mission: this.mission, stage: this.stageIndex + 1, ex: true });
    return true;
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
    p.input = { x: data.x, y: data.y, target: data.target ? { x: clamp11(data.target.x, FLIGHT_BOUNDS.left, FLIGHT_BOUNDS.right), y: clamp11(data.target.y, FLIGHT_BOUNDS.top, FLIGHT_BOUNDS.bottom) } : null };
    if (this.state === "playing" && this.intro <= 0) {
      if (data.missile === true && startWeapon(p, p, p.aircraft, p.input, () => this.launch(p, 8, false))) this.event("missile", { slot });
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
  launch(p, n, support = false) {
    if (p.skillCampaign && !support) {
      this.missiles.push(...makeSkillMissiles(p, p, combatTargets(this), () => this.nextId++));
      return;
    }
    const burstId = support ? this.supportDamage.begin() : null;
    const targets = combatTargets(this);
    for (let i = 0; i < n; i++) this.missiles.push({ id: this.nextId++, owner: p.slot, targetId: !support ? nearestEnemy(targets, p)?.id ?? null : null, x: p.x + (i % 2 ? 18 : -18), y: p.y, vx: (i % 2 ? 1 : -1) * 150, vy: -50, life: support ? 4.5 : 3.5, age: 0, damage: support ? 40 : 20, burstId, super: support });
  }
  damage(e, amount, owner) {
    if (e.hp <= 0 || this.state !== "playing") return;
    e.hitUntil = this.time + 0.16;
    e.hp = Math.max(0, e.hp - amount * (this.res > 0 ? supportRules(this).vulnerability : 1) * testDamageMultiplier(this, e) * bossPartDamageMultiplier(this, e) * convergenceDamageMultiplier(this, e));
    unlockBossParts(this.boss);
    if (e.hp === 0) {
      const p = this.players[owner], points = e.type === "boss" ? 5e3 : e.type === "elite" ? 300 : 100;
      this.score += points;
      p.score += points;
      p.kills++;
      p.energy = Math.min(100, p.energy + 10);
      for (const ally of this.players) if (ally.slot !== p.slot) ally.energy = Math.min(100, ally.energy + 5);
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
    return damage;
  }
  hit(p, source2 = "bullet") {
    if (this.state !== "playing" || p.hp <= 0 || p.invuln > 0) return;
    if (skillIncomingDamage(p, 20, source2) === 0) return;
    if (this.res > 0 && p.shield > 0) {
      p.shield--;
      p.invuln = 1.5;
      p.shieldHitUntil = this.time + 0.3;
      this.event("shield", { slot: p.slot, remaining: p.shield });
      return;
    }
    if (skillShieldAvailable(p)) {
      p.dashShield = 0;
      p.invuln = 1.5;
      p.shieldHitUntil = this.time + 0.3;
      this.event("shield", { slot: p.slot, remaining: 0 });
      return;
    }
    p.hp = Math.max(0, p.hp - skillIncomingDamage(p, 20, source2));
    if (p.hp === 0) resetSkillTransient(p);
    p.invuln = 1.5;
    this.event("hit", { slot: p.slot });
    if (this.players.every((p2) => p2.hp <= 0)) this.finish(false);
  }
  finish(win) {
    if (["result", "transition"].includes(this.state) || this.state === "intermission" && win) return;
    if (win && this.campaign === "survivalex" && this.stageIndex < 5) {
      enterEXIntermission(this);
      this.event("intermission");
      return;
    }
    if (win && this.campaign === "survival" && this.stageIndex === 0) {
      this.state = "transition";
      return;
    }
    this.environmentHazards = [];
    this.eruption = null;
    this.state = "result";
    this.win = win;
    this.res = 0;
    this.intro = 0;
    this.burst = 0;
    this.criticalHits = [];
    this.missiles = [];
    this.shots = [];
    for (const p of this.players) {
      resetSkillTransient(p);
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
    if (!["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(this.campaign) && this.stageTime >= 190) {
      this.finish(false);
      return;
    }
    if (!["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(this.campaign)) this.phase = this.stageTime < 65 ? 0 : this.stageTime < 130 ? 1 : 2;
    const rules = supportRules(this), active = this.res > 0, resStep = Math.min(dt, this.res), movementTime = dt + resStep * (rules.move - 1), bulletStep = dt - resStep * (1 - rules.bullet), enemyStep = dt + resStep * (rules.enemyMove - 1);
    this.burst = Math.max(0, this.burst - dt);
    if (this.res > 0) {
      this.res = Math.max(0, this.res - dt);
      if (this.res === 0) {
        const p = this.players[this.supportSlot];
        for (const ally of this.players) ally.shield = 0;
        if (rules.burst) {
          if (p?.hp > 0 && p.connected) this.launch(p, 16, true);
          this.burst = 2.2;
          this.event("burst", { slot: this.supportSlot });
        } else this.event("resonanceEnd");
      }
    }
    for (const p of this.players) {
      p.invuln = Math.max(0, p.invuln - dt);
      p.missileCd = Math.max(0, p.missileCd - dt);
      if (p.hp <= 0 || !p.connected) continue;
      const dashing = stepWeapon(p, p, dt, combatTargets(this), (e, n) => this.strike(e, n, this.res > 0 && rules.critChance > 0 && p.slot === this.supportSlot, p.slot), this.bullets);
      if (this.state !== "playing") {
        for (const pilot of this.players) resetSkillTransient(pilot);
        return;
      }
      const movement = dashing ? 0 : skillMovementSpeed(p, aircraftRules(p.aircraft).speed) * movementTime;
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
      p.x = clamp11(p.x, FLIGHT_BOUNDS.left, FLIGHT_BOUNDS.right);
      p.y = clamp11(p.y, FLIGHT_BOUNDS.top, FLIGHT_BOUNDS.bottom);
      p.ackSeq = p.seq;
      p.fire -= dt;
      if (p.fire <= 0) {
        p.fire += aircraftRules(p.aircraft).interval / (active ? rules.fire : 1);
        for (const shot2 of aircraftShots(p.aircraft, p.x, p.y)) this.shots.push({ id: this.nextId++, owner: p.slot, ...shot2 });
      }
    }
    if (this.mission === "convergenceex") stepConvergenceEX(this, dt, enemyStep, this.players, (p, source2) => this.hit(p, source2), (type) => this.event(type));
    else if (this.mission === "magmaex") stepMagmaEX(this, dt, enemyStep, this.players, (p, source2) => this.hit(p, source2), (type) => this.event(type));
    else if (this.mission === "frozenex") stepFrozenEX(this, dt, enemyStep, this.players, (p, source2) => this.hit(p, source2), (type) => this.event(type));
    else if (this.mission === "riftex") stepRiftEX(this, dt, enemyStep, this.players, (p, source2) => this.hit(p, source2), (type) => this.event(type));
    else if (this.mission === "deserttest") stepDesertTest(this, dt, enemyStep, this.players, (p, source2) => this.hit(p, source2), (type) => this.event(type));
    else if (this.mission === "skytest") stepTestMission(this, dt, enemyStep, this.players, (p, source2) => this.hit(p, source2), (type) => this.event(type));
    else {
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
      const live2 = this.players.filter((p) => p.hp > 0 && p.connected);
      for (const e of this.enemies) {
        const stopped = Math.min(dt, e.stun || 0), edt = dt ? enemyStep * (dt - stopped) / dt : 0;
        e.stun = Math.max(0, (e.stun || 0) - dt);
        e.age += edt;
        e.y += e.speed * edt;
        e.x = clamp11(e.x + Math.sin(e.age * 1.7 + e.seed) * 35 * edt, 20, 460);
        e.fire -= dt - stopped;
        if (stopped < dt && e.fire <= 0 && e.y > 20 && live2.length) {
          const p = live2[e.id % live2.length], a = Math.atan2(p.y - e.y, p.x - e.x), n = e.type === "elite" ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const angle = a + (i - (n - 1) / 2) * 0.18;
            this.bullets.push({ id: this.nextId++, x: e.x, y: e.y + 15, vx: Math.cos(angle) * 145, vy: Math.sin(angle) * 145, r: 5 });
          }
          e.fire = e.type === "elite" ? 1.4 : 2.1;
        }
        for (const p of live2) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 6) {
          this.hit(p, "collision");
          e.y = 880;
        }
      }
      const b2 = this.boss;
      if (b2?.hp > 0) {
        const stopped = Math.min(dt, b2.stun || 0), bdt = dt ? enemyStep * (dt - stopped) / dt : 0;
        b2.stun = Math.max(0, (b2.stun || 0) - dt);
        b2.age += bdt;
        b2.y = Math.min(155, b2.y + 65 * bdt);
        b2.x = 240 + Math.sin(b2.age * 0.7) * 110;
        b2.fire -= dt - stopped;
        if (stopped < dt && b2.fire <= 0 && b2.y > 70) {
          const n = b2.hp < 1500 ? 13 : 9;
          for (let i = 0; i < n; i++) {
            const a = 0.2 + i * (Math.PI - 0.4) / (n - 1);
            this.bullets.push({ id: this.nextId++, x: b2.x, y: b2.y + 25, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 5 });
          }
          b2.fire = b2.hp < 1500 ? 0.85 : 1.25;
        }
        for (const p of live2) if (Math.hypot(b2.x - p.x, b2.y - p.y) < 60) this.hit(p, "collision");
      }
    }
    const live = this.players.filter((p) => p.hp > 0 && p.connected), b = this.boss;
    const targets = combatTargets(this);
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
      const owner = this.players[m.owner];
      if (owner && stepSkillMissile(owner, m, dt, targets, (e2, n) => this.strike(e2, n, this.res > 0 && rules.critChance > 0 && m.owner === this.supportSlot, m.owner))) continue;
      m.life -= dt;
      m.age += dt;
      const e = targets.find((e2) => e2.id === m.targetId && e2.hp > 0) || (m.super ? targets.find((e2) => e2.hp > 0) : nearestEnemy(targets, m));
      m.targetId = e?.id ?? null;
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
    if (this.state !== "playing") {
      for (const p of this.players) resetSkillTransient(p);
      return;
    }
    this.bullets = this.bullets.filter((s) => !s.sourceId || combatTargets(this).some((e) => e.id === s.sourceId && e.hp > 0));
    for (const s of this.bullets) {
      if (s.dead) continue;
      s.x += s.vx * bulletStep;
      s.y += s.vy * bulletStep;
      for (const p of live) if (enemyBulletHits(s, p)) {
        this.hit(p);
        if (s.testBullet !== "laser") {
          s.y = 900;
          break;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.y > -70 && s.x > -20 && s.x < 500);
    this.missiles = this.missiles.filter((m) => m.life > 0 && m.y > -80 && m.y < 950);
    this.supportDamage.prune(this.missiles);
    for (const p of this.players) pruneSkillVolleys(p, this.missiles);
    this.bullets = this.bullets.filter((s) => !s.dead && (s.testBullet === "laser" || s.y < 830 && s.y > -60 && s.x > -30 && s.x < 510));
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < 870);
  }
  snapshot() {
    return { environmentHazards: this.environmentHazards || [], eruption: this.eruption || null, campaign: this.campaign, stageIndex: this.stageIndex, stageTime: this.stageTime, criticalHits: this.criticalHits || [], mission: this.mission, testWarnings: this.testWarnings || [], supportSinger: this.supportSinger || "freyja", supportSlot: this.supportSlot, tick: this.tick, time: this.time, state: this.state, win: this.win, score: this.score, phase: this.phase, res: this.res, intro: this.intro, burst: this.burst, players: this.players.map(({ input, lastInput, skillHits, ...p }) => ({ ...p, weaponFx: skillFxSnapshot(p), skill: p.skill ? { ...p.skill } : null })), enemies: this.enemies.map((e) => ({ ...e, parts: e.parts?.map((p) => ({ ...p })) })), boss: this.boss ? { ...this.boss, parts: this.boss.parts?.map((p) => ({ ...p })) } : null, shots: this.shots.map((e) => ({ ...e })), bullets: this.bullets.map((e) => ({ ...e })), missiles: this.missiles.map(({ target, ...e }) => ({ ...e })), events: this.events.map((e) => ({ ...e })) };
  }
};

// src/room.mjs
var BattleRoom = class {
  static {
    __name(this, "BattleRoom");
  }
  constructor(id, players, { random = Math.random } = {}) {
    if (players.length !== 2 || players[0].id === players[1].id) throw Error("Two distinct players required");
    this.singerLocked = players.map((p) => validSinger(p.singer));
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
    this.stageReady = [false, false];
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
    if (this.game.state === "intermission") this.stageReady[slot] = false;
    if (["playing", "countdown", "intermission"].includes(this.phase)) {
      this.resumePhase = this.phase;
      this.phase = "reconnecting";
      this.deadline = now + 2e4;
    }
  }
  message(slot, data, now) {
    if (!this.online[slot]) return false;
    if (data.type === "loaded" && this.phase === "loading") {
      if (!this.loaded[slot] && data.singer !== void 0) {
        if (!validSinger(data.singer) || this.singerLocked[slot] && data.singer !== this.game.players[slot].singer) return false;
        this.game.players[slot].singer = data.singer;
      }
      this.loaded[slot] = true;
    } else if (data.type === "start" && slot === 0 && this.phase === "loading" && this.loaded.every(Boolean) && this.online.every(Boolean)) this.hostStart = true;
    else if (["stage-build", "stage-ready", "stage-start"].includes(data.type)) {
      if (this.phase !== "intermission" || this.game.state !== "intermission" || this.game.campaign !== "survivalex" || data.stage !== this.game.stageIndex) return false;
      const p = this.game.players[slot];
      if (data.type === "stage-build") {
        if (this.stageReady[slot] || !validSkillBuild(data.build) || data.aircraft !== void 0 || data.singer !== void 0) return false;
        configureSkills(p, "survivalex", data.build);
      } else if (data.type === "stage-ready") {
        if (typeof data.ready !== "boolean" || data.ready && !skillBuildReady(p.skillBuild, "survivalex")) return false;
        this.stageReady[slot] = data.ready;
      } else {
        const canHost = slot === 0 || this.soloContinued && !this.online[0], ready = this.game.players.every((p2, i) => !this.online[i] ? this.soloContinued : this.stageReady[i] && skillBuildReady(p2.skillBuild, "survivalex"));
        if (!canHost || !ready || !this.soloContinued && !this.online.every(Boolean)) return false;
        if (!this.game.startEXNextStage(this.game.players.map((p2) => p2.skillBuild))) return false;
        this.phase = "countdown";
        this.deadline = now + 3e3;
        this.last = now;
        this.acc = 0;
        this.stageReady = [false, false];
      }
    } else if (data.type === "input" && this.phase === "playing") return this.game.input(slot, data, now);
    else if (data.type === "continue" && this.phase === "disconnected" && this.online[slot]) {
      this.soloContinued = true;
      this.phase = this.game.state === "intermission" ? "intermission" : "playing";
      this.last = now;
      this.acc = 0;
      for (const p of this.game.players) if (!this.online[p.slot]) p.hp = 0;
    } else if (data.type === "end" && ["disconnected", "reconnecting", "intermission"].includes(this.phase)) {
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
    this.result = { matchId: this.id, campaign: this.game.campaign, win: this.game.win, total: this.game.score, players: this.game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, kills: p.kills })), duration: this.game.time, completedAt: now, eligible: !["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(this.game.campaign) && reason === "completed" && this.started && !this.soloContinued && this.online.every(Boolean), reason: ["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(this.game.campaign) ? "test-mission" : this.soloContinued ? "solo-continued" : reason };
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
    while (this.acc >= 1e3 / 30 && !["result", "intermission"].includes(this.game.state)) {
      this.game.step(1 / 30, now);
      this.acc -= 1e3 / 30;
    }
    if (this.game.state === "intermission") {
      this.phase = "intermission";
      this.stageReady = [false, false];
      this.acc = 0;
    }
    if (this.game.state === "result") this.complete(now);
  }
  snapshot(now) {
    return { type: "snapshot", matchId: this.id, phase: this.phase, countdown: Math.max(0, this.deadline - now), online: [...this.online], stageReady: [...this.stageReady], soloContinued: this.soloContinued, loaded: [...this.loaded], result: this.result, world: this.game.snapshot() };
  }
};

// src/network.mjs
var pick = /* @__PURE__ */ __name((value, keys) => Object.fromEntries(keys.filter((key) => value[key] !== void 0).map((key) => [key, value[key]])), "pick");
function networkSnapshot(snapshot) {
  const w = snapshot.world;
  return { ...snapshot, world: {
    ...w,
    players: w.players.map((p) => pick(p, ["id", "name", "slot", "aircraft", "singer", "x", "y", "hp", "energy", "score", "kills", "invuln", "missileCd", "seq", "ackSeq", "connected", "shield", "shieldHitUntil", "skill", "skillCampaign", "skillBuild", "weaponFx", "weaponCharges", "weaponGap", "dashShield", "bulletImmune", "speedBoost"])),
    enemies: w.enemies.map((e) => ({ ...pick(e, ["id", "type", "testKind", "testProtected", "maxHp", "x", "y", "hp", "r", "age", "seed", "stun", "vx", "vy", "dashPhase", "charge", "muzzleUntil", "hitUntil", "testHaste", "laserWarning", "phased", "phaseWarning", "exit", "dashAngle", "links", "weakUntil", "arrivalSafe", "entrySafe"]), parts: e.parts?.map((p) => pick(p, ["id", "type", "testKind", "side", "x", "y", "hp", "maxHp", "r", "age", "aim", "stun", "hitUntil", "muzzleUntil"])) })),
    boss: w.boss ? { ...pick(w.boss, ["id", "type", "testKind", "name", "x", "y", "hp", "maxHp", "r", "age", "fire", "stun", "stage", "partsUnlocked", "combo", "coreSpecial", "attack", "realms", "cycleIndex", "judgmentIndex", "warning", "attackTime", "weakTime", "warning", "hitUntil", "openSoon"]), parts: (w.boss.parts || []).map((p) => pick(p, ["id", "type", "testKind", "side", "x", "y", "hp", "maxHp", "r", "age", "stun", "aim", "muzzleUntil", "hitUntil", "destroyedAt", "charge"])) } : null,
    shots: w.shots.map((s) => pick(s, ["id", "owner", "x", "y", "vx", "vy", "critical", "super"])),
    bullets: w.bullets.map((s) => pick(s, ["id", "x", "y", "vx", "vy", "r", "testBullet", "beamId", "angle", "width", "tone", "sourceId", "splitIn", "splitAngle", "splitWarning", "convergenceIce"])),
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
var rosterValid = /* @__PURE__ */ __name((players) => Array.isArray(players) && players.length === 2 && players.every((p) => (p.build === void 0 || validSkillBuild(p.build)) && (p.singer === void 0 || validSinger(p.singer)) && (p.mission === void 0 || validMission(p.mission)) && (p.aircraft === void 0 || validAircraft(p.aircraft)) && typeof p.id === "string" && p.id.length < 100 && typeof p.name === "string" && p.name.length <= 160) && players[0].id !== players[1].id, "rosterValid");
var worker_default = { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/network-check" && request.method === "GET") return edgeDiagnostic(request, env);
  if (url.pathname === "/health") return response({ service: "sky-resonance-battle", version: BACKEND_VERSION, combatLayoutV2: true, killEnergy: 10, teammateKillEnergy: 5, mineRays: 12, heavyFirepower2Damage: 250, chargeDamageReduction: 0.5, interceptorHp: 48, interceptorSpeed: 175, enemyArtAlignment: true, expandedFlightSpace: true, flightBounds: FLIGHT_BOUNDS, mission01Test: true, mission01Multipart: true, mission02Test: true, survivalEX: true, mission03EX: true, mission04EX: true, mission05EX: true, mission06EX: true, environmentHazards: true, eruptionPeriod: 15, survivalEXStages: 6, testRetreatAt: 140, testBossAt: 150, lobbyConnectionTest: true, lobbyLoadoutLock: true, survivalSkills: true, fullSkillAllocationRequired: true, transportDiagnostics: true, roomQuotaRelease: true, admissionLimits: ADMISSION_LIMITS, normalMissileLifetime: 3.5, normalMissileTargeting: "nearest-until-death", chainHuntDamageMultiplier: 0.5, swiftImpactRadius: 100, swiftShockRadius: 150, supportMissileLifetime: 4.5, releasePhase: 7, phase7Baseline: true, specialWeapons: true, desertMission: true, aircraftSelection: true, phase6: true, singers: true, supportShieldsBySinger: { freyja: 0, kaname: 1, mikumo: 0 }, supportHealBySinger: { freyja: 0, kaname: 20, mikumo: 0 }, critChance: 0.15, critMultiplier: 2, critRoll: "per-hit", enemyMoveMultiplier: 0.4, supportEffects: true, survivalRoute: true, networkOptimized: true, reviewFixes: true, snapshotHz: 20, roomLocationHint: roomLocationHint(env), supportDamageRule: "per-target-per-volley", supportDamageFirst: 40, supportDamageStep: 4, supportDamageMin: 20, supportBurstOwner: "caster", supportMissilesPerCast: 16, resultsReady: true, roomAuth: env.SITE_PUBLIC_KEY ? "ECDSA-P256" : "HMAC" });
  if (!env.BATTLE_SECRET || !env.SITE_ORIGIN) return response({ error: "Service is not configured" }, 503);
  if (url.pathname.startsWith("/probe/") && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
    if (request.headers.get("Origin") !== env.SITE_ORIGIN) return response({ error: "Origin denied" }, 403);
    const id = url.pathname.slice(7), protocols = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",").map((s) => s.trim());
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !protocols.includes("sky-probe")) return response({ error: "Invalid probe" }, 400);
    let signed;
    try {
      const token = protocols.find((p) => p.startsWith("ticket."))?.slice(7);
      if (!token || token.length > 2048) throw Error();
      signed = JSON.parse(atob(token.replaceAll("-", "+").replaceAll("_", "/")));
    } catch {
      return response({ error: "Unauthorized" }, 401);
    }
    const claim = env.SITE_PUBLIC_KEY ? await verifyRoom(env.SITE_PUBLIC_KEY, signed?.body, signed?.signature) : await verify(env.BATTLE_SECRET, signed?.body, signed?.signature);
    if (!claim || claim.aud !== "sky-room-probe" || claim.matchId !== id || typeof claim.playerId !== "string" || claim.playerId.length > 100 || claim.exp > Date.now() + 6e4) return response({ error: "Unauthorized" }, 401);
    return env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(id), { locationHint: roomLocationHint(env) }).fetch(new Request("https://internal/probe", { headers: { Upgrade: "websocket", "X-Probe-Player": claim.playerId } }));
  }
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
    if (!data.players.every((p) => skillBuildReady(p.build, data.players[0].mission))) return response({ error: "\u751F\u5B58\u4E4B\u9053\uFF0F\u6E2C\u8A66\u95DC\u5361\u9700\u6240\u6709\u73A9\u5BB6\u7528\u5B8C 3 \u9EDE\u5F37\u5316\u9EDE\u6578\u624D\u80FD\u51FA\u64CA\u3002" }, 409);
    const gate = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName("__admission"));
    const admitted = await gate.fetch(new Request("https://internal/admit", { method: "POST", body: JSON.stringify({ matchId: data.matchId, ttl: ["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(data.players[0].mission) ? 24 * 60 * 6e4 : data.players[0].mission === "survival" ? 10 * 6e4 : 6 * 6e4 }) }));
    if (!admitted.ok) return admitted;
    const stub = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(data.matchId), { locationHint: roomLocationHint(env) });
    const created = await stub.fetch(new Request("https://internal/create", { method: "POST", body: JSON.stringify(data) }));
    if (!created.ok) return created;
    return response({ combatLayoutV2: true, killEnergy: 10, teammateKillEnergy: 5, mineRays: 12, heavyFirepower2Damage: 250, chargeDamageReduction: 0.5, interceptorHp: 48, interceptorSpeed: 175, enemyArtAlignment: true, expandedFlightSpace: true, flightBounds: FLIGHT_BOUNDS, mission01Test: true, mission01Multipart: true, mission02Test: true, survivalEX: true, mission03EX: true, mission04EX: true, mission05EX: true, mission06EX: true, environmentHazards: true, eruptionPeriod: 15, survivalEXStages: 6, lobbyLoadoutLock: true, survivalSkills: true, survivalRoute: true, specialWeapons: true, desertMission: true, aircraftSelection: true, matchId: data.matchId, ws: url.origin.replace("https:", "wss:") + "/room/" + data.matchId, tickets: await Promise.all(data.players.map((p, i) => ticket(env.BATTLE_SECRET, data.matchId, p, i))) });
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
    this.probePlayers = /* @__PURE__ */ new Map();
    this.probeSockets = /* @__PURE__ */ new Set();
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
    if (path === "/probe") {
      const player = request.headers.get("X-Probe-Player"), now = Date.now();
      if (this.probeSockets.size >= 2 || now - (this.probePlayers.get(player) || 0) < 15e3) return response({ error: "Please wait before retrying" }, 429);
      this.probePlayers.set(player, now);
      if (this.probePlayers.size > 8) this.probePlayers.delete(this.probePlayers.keys().next().value);
      const pair2 = new WebSocketPair(), client2 = pair2[0], socket2 = pair2[1];
      socket2.accept();
      this.probeSockets.add(socket2);
      let count2 = 0;
      const timeout2 = setTimeout(() => {
        try {
          socket2.close(1e3, "Probe complete");
        } catch {
        }
        cleanup();
      }, 1e4);
      const cleanup = /* @__PURE__ */ __name(() => {
        clearTimeout(timeout2);
        this.probeSockets.delete(socket2);
      }, "cleanup");
      socket2.addEventListener("close", cleanup);
      socket2.addEventListener("error", cleanup);
      socket2.addEventListener("message", (event) => {
        try {
          if (typeof event.data !== "string" || event.data.length > 128 || ++count2 > 10) throw Error();
          const msg = JSON.parse(event.data);
          if (msg.type !== "ping" || !Number.isSafeInteger(msg.nonce)) throw Error();
          socket2.send(JSON.stringify({ type: "pong", nonce: msg.nonce }));
        } catch {
          socket2.close(1008, "Invalid probe");
          cleanup();
        }
      });
      socket2.send(JSON.stringify({ type: "probe-ready", version: BACKEND_VERSION }));
      return new Response(null, { status: 101, webSocket: client2, headers: { "Sec-WebSocket-Protocol": "sky-probe" } });
    }
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
      if (this.room.phase === "loading" && now - this.created > 6e4 || !["skytest", "deserttest", "riftex", "frozenex", "magmaex", "convergenceex", "survivalex"].includes(this.room.game.campaign) && now - this.created > (this.room.game.campaign === "survival" ? 9 : 5) * 6e4) {
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
