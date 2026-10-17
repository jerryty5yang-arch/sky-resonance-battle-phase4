var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../dist/missions.js
var MISSIONS = Object.freeze({ sky: { id: "sky", name: "\u96F2\u6D77\u9632\u885B\u6230", phase: "BLUE HORIZON", storm: "\u7D2B\u8272\u98A8\u66B4" }, desert: { id: "desert", name: "\u8D64\u7802\u907A\u8DE1", phase: "SCARLET WASTELAND", storm: "\u8D64\u7802\u98A8\u66B4" } });
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
var WEAPONS = { balanced: { name: "\u591A\u91CD\u9396\u5B9A", cooldown: 8, description: "8 \u679A\u8FFD\u8E64\u98DB\u5F48 \xB7 \u51B7\u537B 8 \u79D2" }, swift: { name: "\u75BE\u98A8\u7A81\u9032", cooldown: 6, description: "\u6CBF\u79FB\u52D5\u65B9\u5411\u7A81\u9032 \xB7 \u7121\u6575 0.35 \u79D2 \xB7 \u51B7\u537B 6 \u79D2" }, heavy: { name: "\u8CAB\u7A7F\u91CD\u7832", cooldown: 10, description: "\u84C4\u529B 1.2 \u79D2\u5F8C\u767C\u5C04\u8CAB\u7A7F\u5149\u675F \xB7 \u51B7\u537B 10 \u79D2" } };
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
        damage(e, 60);
      }
    }
    skill.remaining = Math.max(0, skill.remaining - dt);
    if (skill.remaining === 0) {
      skill.kind = "trail";
      skill.remaining = 0.18;
    }
    return true;
  }
  skill.remaining = Math.max(0, skill.remaining - dt);
  if (skill.kind === "charge" && skill.remaining < 1e-8) {
    actor.skill = { kind: "beam", remaining: 0.32, x0: pos.x, y0: pos.y - 24, x1: pos.x, y1: Math.max(-100, pos.y - 674) };
    for (const e of targets) if (e.hp > 0 && e.y <= pos.y - 24 + e.r && e.y >= pos.y - 674 - e.r && Math.abs(e.x - pos.x) <= 22 + e.r) damage(e, 150);
  } else if (skill.remaining === 0) actor.skill = null;
  return false;
}
__name(stepWeapon, "stepWeapon");

// src/combat.mjs
var clamp = /* @__PURE__ */ __name((v, a, b) => Math.max(a, Math.min(b, v)), "clamp");
var CoopCombat = class {
  static {
    __name(this, "CoopCombat");
  }
  constructor(players, random = Math.random) {
    this.mission = missionRules(players[0]?.mission).id;
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
    this.players = players.map((p, i) => ({ id: p.id, name: p.name, aircraft: aircraftRules(p.aircraft).id, slot: i, x: 180 + i * 120, y: 620, hp: 100, energy: 25, score: 0, kills: 0, fire: 0, invuln: 2, missileCd: 0, input: { x: 0, y: 0 }, lastInput: -Infinity, seq: -1, connected: true }));
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
        this.event("support", { slot });
      }
    }
    return true;
  }
  launch(p, n) {
    const targets = [...this.enemies.filter((e) => e.hp > 0), ...this.boss?.hp > 0 ? [this.boss] : []];
    for (let i = 0; i < n; i++) this.missiles.push({ id: this.nextId++, owner: p.slot, targetId: n === 8 && targets.length ? targets[i % targets.length].id : null, x: p.x + (i % 2 ? 18 : -18), y: p.y, vx: (i % 2 ? 1 : -1) * 150, vy: -50, life: 4.5, age: 0, damage: n > 8 ? 40 : 22, super: n > 8 });
  }
  damage(e, amount, owner) {
    if (e.hp <= 0 || this.state !== "playing") return;
    e.hp = Math.max(0, e.hp - amount);
    if (e.hp === 0) {
      const p = this.players[owner], points = e.type === "boss" ? 5e3 : e.type === "elite" ? 300 : 100;
      this.score += points;
      p.score += points;
      p.kills++;
      p.energy = Math.min(100, p.energy + 10);
      this.event("explosion", { x: e.x, y: e.y, boss: e.type === "boss" });
      if (e.type === "boss") this.finish(true);
    }
  }
  hit(p) {
    if (p.hp <= 0 || p.invuln > 0) return;
    p.hp = Math.max(0, p.hp - 20);
    if (p.hp === 0) p.skill = null;
    p.invuln = 1.5;
    this.event("hit", { slot: p.slot });
    if (this.players.every((p2) => p2.hp <= 0)) this.finish(false);
  }
  finish(win) {
    if (this.state === "result") return;
    this.state = "result";
    this.win = win;
    this.event("finish", { win });
  }
  step(dt, now) {
    if (this.state !== "playing") return;
    this.tick++;
    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - dt);
      if (this.intro === 0) {
        this.res = 6;
        for (const ally of this.players) if (ally.hp > 0) ally.hp = Math.min(100, ally.hp + 20);
        this.event("resonance", { heal: 20 });
      }
      return;
    }
    this.time += dt;
    if (this.time >= 190) {
      this.finish(false);
      return;
    }
    this.phase = this.time < 65 ? 0 : this.time < 130 ? 1 : 2;
    const resStep = Math.min(dt, this.res), movementTime = dt + resStep * 0.5, bulletStep = dt - resStep * 0.6;
    this.burst = Math.max(0, this.burst - dt);
    if (this.res > 0) {
      this.res = Math.max(0, this.res - dt);
      if (this.res === 0) {
        for (const p of this.players.filter((p2) => p2.hp > 0 && p2.connected)) this.launch(p, 28);
        this.burst = 2.2;
        this.event("burst");
      }
    }
    for (const p of this.players) {
      p.invuln = Math.max(0, p.invuln - dt);
      p.missileCd = Math.max(0, p.missileCd - dt);
      if (p.hp <= 0 || !p.connected) continue;
      const dashing = stepWeapon(p, p, dt, [...this.enemies, ...this.boss ? [this.boss] : []], (e, n) => this.damage(e, n, p.slot));
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
      p.fire -= dt;
      if (p.fire <= 0) {
        p.fire += aircraftRules(p.aircraft).interval;
        for (const shot of aircraftShots(p.aircraft, p.x, p.y)) this.shots.push({ id: this.nextId++, owner: p.slot, ...shot });
      }
    }
    this.spawn -= dt;
    if (this.spawn <= 0 && this.time < 158) {
      const elite = this.time > 65 && this.random() < 0.27;
      this.enemies.push({ id: this.nextId++, type: elite ? "elite" : "scout", x: 45 + this.random() * 390, y: -55, hp: elite ? 90 : 30, r: elite ? 25 : 17, speed: elite ? 48 : 80, age: 0, fire: 1.3, seed: this.random() * 6 });
      this.spawn = this.boss ? 3.5 : this.time < 65 ? 1.1 : 0.8;
    }
    if (this.time >= 130 && !this.boss) {
      this.boss = { id: this.nextId++, type: "boss", x: 240, y: -100, hp: 3e3, maxHp: 3e3, r: 60, age: 0, fire: 1.4 };
      this.event("boss");
    }
    const live = this.players.filter((p) => p.hp > 0 && p.connected);
    for (const e of this.enemies) {
      e.age += dt;
      e.y += e.speed * dt;
      e.x = clamp(e.x + Math.sin(e.age * 1.7 + e.seed) * 35 * dt, 20, 460);
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
      b.age += dt;
      b.y = Math.min(155, b.y + 65 * dt);
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
        this.damage(e, s.damage, s.owner);
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
        this.damage(e, m.damage, m.owner);
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
    this.bullets = this.bullets.filter((s) => s.y < 830 && s.y > -60 && s.x > -30 && s.x < 510);
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < 870);
  }
  snapshot() {
    return { mission: this.mission, tick: this.tick, time: this.time, state: this.state, win: this.win, score: this.score, phase: this.phase, res: this.res, intro: this.intro, burst: this.burst, players: this.players.map(({ input, lastInput, skillHits, ...p }) => ({ ...p, skill: p.skill ? { ...p.skill } : null })), enemies: this.enemies.map((e) => ({ ...e })), boss: this.boss ? { ...this.boss } : null, shots: this.shots.map((e) => ({ ...e })), bullets: this.bullets.map((e) => ({ ...e })), missiles: this.missiles.map((e) => ({ ...e })), events: this.events.map((e) => ({ ...e })) };
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
    if (data.type === "loaded" && this.phase === "loading") this.loaded[slot] = true;
    else if (data.type === "start" && slot === 0 && this.phase === "loading" && this.loaded.every(Boolean) && this.online.every(Boolean)) this.hostStart = true;
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
    this.result = { matchId: this.id, win: this.game.win, total: this.game.score, players: this.game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, kills: p.kills })), duration: this.game.time, completedAt: now, eligible: reason === "completed" && this.started && !this.soloContinued && this.online.every(Boolean), reason: this.soloContinued ? "solo-continued" : reason };
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
  if (url.pathname === "/health") return response({ service: "sky-resonance-battle", version: 8, specialWeapons: true, desertMission: true, aircraftSelection: true, resultsReady: true, roomAuth: env.SITE_PUBLIC_KEY ? "ECDSA-P256" : "HMAC" });
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
    const admitted = await gate.fetch(new Request("https://internal/admit", { method: "POST", body: JSON.stringify({ matchId: data.matchId }) }));
    if (!admitted.ok) return admitted;
    const stub = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(data.matchId));
    const created = await stub.fetch(new Request("https://internal/create", { method: "POST", body: JSON.stringify(data) }));
    if (!created.ok) return created;
    return response({ specialWeapons: true, desertMission: true, aircraftSelection: true, matchId: data.matchId, ws: url.origin.replace("https:", "wss:") + "/room/" + data.matchId, tickets: await Promise.all(data.players.map((p, i) => ticket(env.BATTLE_SECRET, data.matchId, p, i))) });
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
    this.created = 0;
    this.writing = false;
    this.saved = false;
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
      const { matchId } = await request.json(), now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
      return this.ctx.storage.transaction(async (store) => {
        let quota = await store.get("quota") || { day, count: 0, active: {} };
        if (quota.day !== day) quota = { day, count: 0, active: quota.active };
        for (const [id, expires] of Object.entries(quota.active)) if (expires < now) delete quota.active[id];
        if (!quota.active[matchId]) {
          if (quota.count >= 100 || Object.keys(quota.active).length >= 3) return response({ error: "\u514D\u8CBB\u6E2C\u8A66\u984D\u5EA6\u5DF2\u9054\u4E0A\u9650\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66\u3002" }, 429);
          quota.count++;
          quota.active[matchId] = now + 6 * 6e4;
          await store.put("quota", quota);
        }
        return response({ allowed: true });
      });
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
    let slot = null, authenticated = false, authenticating = false, count = 0, start = Date.now();
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
          socket.send(JSON.stringify({ type: "welcome", slot, matchId: this.room.id }));
          socket.send(JSON.stringify(this.room.snapshot(Date.now())));
          this.run();
          return;
        }
        this.lastSeen.set(slot, Date.now());
        this.room.message(slot, msg, Date.now());
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
  run() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      if (!this.room) return;
      if (this.room.phase === "loading" && now - this.created > 6e4 || now - this.created > 5 * 6e4) {
        this.room.game.finish(false);
        this.room.complete(now, "timeout");
      }
      for (const [slot, socket] of this.sockets) if (now - this.lastSeen.get(slot) > 1e4) {
        socket.close(1001, "Heartbeat expired");
        this.room.disconnect(slot, now);
        this.sockets.delete(slot);
      }
      this.room.advance(now);
      if (++this.cycle % 2 === 0) {
        const data = JSON.stringify(this.room.snapshot(now));
        for (const socket of this.sockets.values()) try {
          if (socket.bufferedAmount > 262144) {
            socket.close(1013, "Slow connection");
            continue;
          }
          socket.send(data);
        } catch {
        }
      }
      if (this.room.result && !this.saved && !this.writing) {
        this.writing = true;
        this.ctx.waitUntil(this.ctx.storage.put("match", { id: this.room.id, players: this.room.game.players.map((p) => ({ id: p.id, name: p.name, aircraft: p.aircraft, mission: this.room.game.mission })), created: this.created, result: this.room.result }).then(() => {
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
