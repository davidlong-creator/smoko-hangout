'use strict';
const { BOT_NAMES, BOT_AVATARS } = require('./utils');
const ROLE_INFO = {
  wolf: '🐺 Werewolf — hunt with your pack at night, blend in by day.',
  seer: '🔮 Seer — investigate one player each night.',
  doctor: '💉 Doctor — protect one player each night.',
  villager: '🧑‍🌾 Villager — your vote is your weapon.',
};
const pick = a => a[Math.floor(Math.random() * a.length)];

class WerewolfEngine {
  constructor(room, broadcast) {
    this.room = room; this.broadcast = broadcast; this.destroyed = false;
    this.phase = 'lobby'; this.round = 1; this.wolfChat = []; this.suspicion = {};
    this.ready = new Set(); this.nightSub = {}; this.votes = {}; this.investigations = {};
    this.message = '';
  }
  log(m) { this.room.log.push(m); if (this.room.log.length > 60) this.room.log.shift(); }
  alive() { return this.room.players.filter(p => p.alive); }
  addBot() {
    if (this.room.players.length >= this.room.size) return false;
    const used = this.room.players.map(p => p.name);
    let i = BOT_NAMES.findIndex(n => !used.includes(n)); if (i < 0) i = Math.floor(Math.random() * BOT_NAMES.length);
    this.room.players.push({ id: 'bot_' + Math.random().toString(36).slice(2, 9), name: BOT_NAMES[i], avatar: BOT_AVATARS[i], isBot: true, connected: true, chips: 0 });
    this.log(`🤖 ${BOT_NAMES[i]} joins the village.`);
    return true;
  }
  start() {
    while (this.room.players.length < this.room.size) if (!this.addBot()) break;
    if (this.room.players.length < 5) return;
    const n = this.room.players.length;
    const nWolves = n >= 9 ? 3 : n >= 6 ? 2 : 1;
    let roles = [];
    for (let i = 0; i < nWolves; i++) roles.push('wolf');
    roles.push('seer', 'doctor');
    while (roles.length < n) roles.push('villager');
    for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]]; }
    this.room.players.forEach((p, i) => { p.role = roles[i]; p.alive = true; p.roleRevealed = false; this.suspicion[p.id] = 0; this.investigations[p.id] = []; });
    this.phase = 'reveal'; this.ready.clear();
    this.message = 'Secret roles have been dealt. Check yours, then tap Ready.';
    this.log(`🌕 Werewolf begins with ${n} villagers… ${nWolves} wolf${nWolves > 1 ? 'ves' : ''} among them.`);
    this.room.players.filter(p => p.isBot).forEach(p => this.ready.add(p.id));
    this.broadcast();
    this.checkRevealDone();
  }
  checkRevealDone() {
    if (this.phase !== 'reveal') return;
    if (this.room.players.filter(p => !p.isBot && p.connected).every(p => this.ready.has(p.id))) this.startNight();
  }
  requiredNightActors() {
    const a = [];
    this.alive().filter(p => p.role === 'wolf').forEach(p => a.push({ pid: p.id, kind: 'wolf' }));
    const d = this.alive().find(p => p.role === 'doctor'); if (d) a.push({ pid: d.id, kind: 'doctor' });
    const s = this.alive().find(p => p.role === 'seer'); if (s) a.push({ pid: s.id, kind: 'seer' });
    return a;
  }
  startNight() {
    this.phase = 'night'; this.nightSub = {};
    this.message = `🌙 Night ${this.round} — secret roles are acting…`;
    this.log(`🌙 Night ${this.round} falls.`);
    // bot pack talk in the den
    const botWolf = this.alive().find(p => p.isBot && p.role === 'wolf');
    const wolfCount = this.room.players.filter(p => p.role === 'wolf').length;
    if (botWolf && wolfCount > 1) {
      const targets = this.alive().filter(p => p.role !== 'wolf');
      if (targets.length) this.wolfChat.push({ from: botWolf.name, text: `Pack… I say we hunt ${pick(targets).name} tonight. 🌕` });
    }
    this.broadcast();
    // bots submit after a pause
    this.requiredNightActors().filter(a => { const p = this.room.players.find(x => x.id === a.pid); return p && p.isBot; })
      .forEach((a, i) => setTimeout(() => { if (!this.destroyed && this.phase === 'night') { this.nightSub[a.pid] = this.botNightChoice(a.kind, this.room.players.find(x => x.id === a.pid)); this.checkNightDone(); this.broadcast(); } }, 1200 + i * 700));
  }
  botNightChoice(kind, actor) {
    const alive = this.alive();
    if (kind === 'wolf') {
      const prey = alive.filter(p => p.role !== 'wolf');
      const minS = Math.min(...prey.map(p => this.suspicion[p.id] || 0));
      return pick(prey.filter(p => (this.suspicion[p.id] || 0) <= minS + 1)).id;
    }
    if (kind === 'doctor') return Math.random() < 0.35 ? actor.id : pick(alive).id;
    // seer: most suspicious unknown
    const known = {}; (this.investigations[actor.id] || []).forEach(r => known[r.targetId] = true);
    const unknown = alive.filter(p => p.id !== actor.id && !known[p.id]);
    if (!unknown.length) return actor.id;
    const maxS = Math.max(0, ...unknown.map(p => this.suspicion[p.id] || 0));
    return pick(unknown.filter(p => (this.suspicion[p.id] || 0) === maxS)).id;
  }
  checkNightDone() {
    if (this.phase !== 'night') return;
    const req = this.requiredNightActors();
    if (req.every(a => this.nightSub[a.pid])) this.resolveNight();
  }
  resolveNight() {
    // wolf pack target: majority among wolf submissions
    const wolfVotes = this.requiredNightActors().filter(a => a.kind === 'wolf').map(a => this.nightSub[a.pid]).filter(Boolean);
    const tally = {}; wolfVotes.forEach(id => tally[id] = (tally[id] || 0) + 1);
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const victimId = top ? top[0] : null;
    const doctorActor = this.requiredNightActors().find(a => a.kind === 'doctor');
    const savedId = doctorActor ? this.nightSub[doctorActor.pid] : null;
    const seerActor = this.requiredNightActors().find(a => a.kind === 'seer');
    if (seerActor && this.nightSub[seerActor.pid]) {
      const t = this.room.players.find(p => p.id === this.nightSub[seerActor.pid]);
      if (t) this.investigations[seerActor.pid].push({ targetId: t.id, name: t.name, isWolf: t.role === 'wolf', round: this.round });
    }
    const victim = this.room.players.find(p => p.id === victimId);
    if (victim && savedId !== victim.id) {
      victim.alive = false; victim.roleRevealed = true;
      this.message = `☀️ Dawn — ${victim.name} (a ${ROLE_INFO[victim.role].split(' —')[0]}) was killed by the wolves!`;
      this.log(`☀️ Day ${this.round}: ${victim.name} (${victim.role}) was killed.`);
    } else {
      this.message = '☀️ Dawn — nobody died! The Doctor may have saved a life…';
      this.log(`☀️ Day ${this.round}: nobody died.`);
    }
    const bot = this.alive().find(p => p.isBot);
    if (bot && Math.random() < 0.8) this.log(`💬 ${bot.name}: "${victim && savedId !== victim.id ? `Poor ${victim.name}… the wolves are among us!` : 'Nobody died? The Doctor deserves a medal!'}"`);
    this.phase = 'morning';
    if (this.checkWin()) return;
    this.broadcast();
  }
  startVoting() {
    this.phase = 'vote'; this.votes = {};
    this.message = '🗳️ Vote: tap the player you accuse.';
    this.alive().filter(p => p.isBot).forEach((p, i) => setTimeout(() => {
      if (this.destroyed || this.phase !== 'vote') return;
      this.votes[p.id] = this.botVote(p);
      const t = this.room.players.find(x => x.id === this.votes[p.id]);
      if (t && Math.random() < 0.45) this.log(`💬 ${p.name}: "I vote ${t.name}. Something isn't right about them."`);
      this.checkVoteDone(); this.broadcast();
    }, 1000 + i * 600));
    this.broadcast();
  }
  botVote(voter) {
    const others = this.alive().filter(p => p.id !== voter.id);
    if (voter.role === 'wolf') {
      const prey = others.filter(p => p.role !== 'wolf');
      const maxS = Math.max(0, ...prey.map(p => this.suspicion[p.id] || 0));
      return pick(maxS > 0 ? prey.filter(p => (this.suspicion[p.id] || 0) === maxS) : prey).id;
    }
    const inv = this.investigations[voter.id] || [];
    const knownWolf = inv.find(r => r.isWolf && others.some(p => p.id === r.targetId));
    if (voter.role === 'seer' && knownWolf) return knownWolf.targetId;
    const cleared = new Set(inv.filter(r => !r.isWolf).map(r => r.targetId));
    const pool = others.filter(p => !cleared.has(p.id));
    const use = pool.length ? pool : others;
    const maxS = Math.max(0, ...use.map(p => this.suspicion[p.id] || 0));
    return pick(maxS > 0 && Math.random() < 0.8 ? use.filter(p => (this.suspicion[p.id] || 0) === maxS) : use).id;
  }
  checkVoteDone() {
    if (this.phase !== 'vote') return;
    if (this.alive().every(p => this.votes[p.id])) this.resolveVote();
  }
  resolveVote() {
    const tally = {}; Object.values(this.votes).forEach(id => tally[id] = (tally[id] || 0) + 1);
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const summary = entries.map(([id, n]) => `${this.room.players.find(p => p.id === id).name}: ${n}`).join(' · ');
    if (entries.length && (entries.length === 1 || entries[0][1] > entries[1][1])) {
      const out = this.room.players.find(p => p.id === entries[0][0]);
      Object.entries(this.votes).forEach(([v, t]) => { if (t === out.id && v !== out.id) this.suspicion[v] = Math.max(0, (this.suspicion[v] || 0) + (out.role === 'wolf' ? -1 : 2)); });
      out.alive = false; out.roleRevealed = true;
      this.message = `⚖️ Vote (${summary}) — ${out.name} is eliminated and was a ${ROLE_INFO[out.role].split(' —')[0]}!`;
      this.log(`⚖️ ${this.message}`);
    } else {
      this.message = `⚖️ Tie vote (${summary}) — nobody is eliminated.`;
      this.log(`⚖️ ${this.message}`);
    }
    this.phase = 'voteResult';
    if (this.checkWin()) return;
    this.broadcast();
  }
  checkWin() {
    const wolves = this.alive().filter(p => p.role === 'wolf').length;
    const others = this.alive().length - wolves;
    let winner = null;
    if (!wolves) winner = '🎉 THE VILLAGE WINS!';
    else if (wolves >= others) winner = '🐺 THE WEREWOLVES WIN!';
    if (!winner) return false;
    this.phase = 'over'; this.message = winner;
    this.room.players.forEach(p => p.roleRevealed = true);
    this.log(winner);
    this.broadcast();
    return true;
  }
  action(pid, data) {
    const me = this.room.players.find(p => p.id === pid); if (!me) return;
    if (data.type === 'ready' && this.phase === 'reveal') { this.ready.add(pid); this.checkRevealDone(); this.broadcast(); return; }
    if (data.type === 'continue') {
      if (this.phase === 'morning') return this.startVoting();
      if (this.phase === 'voteResult') { this.round++; return this.startNight(); }
      if (this.phase === 'over') return this.start();
      return;
    }
    if (data.type === 'night' && this.phase === 'night' && me.alive) {
      const req = this.requiredNightActors().find(a => a.pid === pid);
      if (!req || req.kind !== data.kind) return;
      const target = this.room.players.find(p => p.id === data.targetId);
      if (!target || !target.alive) return;
      if (req.kind === 'wolf' && target.role === 'wolf') return;
      if (req.kind !== 'doctor' && target.id === pid) return;
      this.nightSub[pid] = target.id;
      this.checkNightDone(); this.broadcast(); return;
    }
    if (data.type === 'vote' && this.phase === 'vote' && me.alive) {
      const target = this.room.players.find(p => p.id === data.targetId);
      if (!target || !target.alive || target.id === pid) return;
      this.votes[pid] = target.id;
      this.checkVoteDone(); this.broadcast(); return;
    }
    if (data.type === 'wolfChat') {
      if (me.role !== 'wolf') return; // server-enforced: only wolves can talk in the den
      const text = String(data.text || '').trim().slice(0, 200);
      if (!text) return;
      this.wolfChat.push({ from: me.name, text });
      if (this.wolfChat.length > 50) this.wolfChat.shift();
      // a bot packmate may answer
      const botWolf = this.alive().find(p => p.isBot && p.role === 'wolf' && p.id !== pid);
      if (botWolf && Math.random() < 0.8) {
        const mentioned = this.alive().find(p => p.role !== 'wolf' && text.toLowerCase().includes(p.name.toLowerCase()));
        setTimeout(() => { if (!this.destroyed) { this.wolfChat.push({ from: botWolf.name, text: mentioned ? `Agreed — ${mentioned.name} won't see the dawn. 🌕` : pick(['The moon looks tasty tonight. 🌕', 'Keep your head down tomorrow, packmate.', 'Careful — the Seer is still out there.']) }); this.broadcast(); } }, 1000);
      }
      this.broadcast(); return;
    }
  }
  disconnect(pid) {
    const p = this.room.players.find(x => x.id === pid); if (!p) return;
    if (this.phase !== 'lobby' && this.phase !== 'over' && p.alive) {
      p.alive = false; p.roleRevealed = true;
      this.log(`👋 ${p.name} left and was eliminated (${p.role || '?'})`);
      if (this.phase === 'night') this.checkNightDone();
      if (this.phase === 'vote') this.checkVoteDone();
      this.checkWin();
    }
    this.broadcast();
  }
  publicState(viewerId) {
    const me = this.room.players.find(p => p.id === viewerId);
    const players = this.room.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, connected: p.connected,
      alive: !!p.alive, role: (p.roleRevealed || this.phase === 'over' || p.id === viewerId) && p.role ? ROLE_INFO[p.role].split(' —')[0] : null,
    }));
    let myPrompt = null;
    if (me && me.alive) {
      if (this.phase === 'night') {
        const req = this.requiredNightActors().find(a => a.pid === viewerId);
        if (req && !this.nightSub[viewerId]) {
          const targets = this.alive().filter(t => req.kind === 'wolf' ? t.role !== 'wolf' : (t.id !== viewerId || req.kind === 'doctor'));
          myPrompt = { type: 'night', kind: req.kind, targets: targets.map(t => ({ id: t.id, name: t.name, avatar: t.avatar })) };
        }
      } else if (this.phase === 'vote' && !this.votes[viewerId]) {
        myPrompt = { type: 'vote', targets: this.alive().filter(t => t.id !== viewerId).map(t => ({ id: t.id, name: t.name, avatar: t.avatar })) };
      }
    }
    return {
      players,
      game: {
        phase: this.phase, round: this.round, message: this.message,
        myRole: me && me.role ? { key: me.role, label: ROLE_INFO[me.role].split(' —')[0], desc: ROLE_INFO[me.role], pack: me.role === 'wolf' ? this.room.players.filter(p => p.role === 'wolf').map(p => p.name) : [] } : null,
        iAmReady: this.ready.has(viewerId), myPrompt,
        myInvestigations: me ? (this.investigations[viewerId] || []) : [],
        wolfChat: me && me.role === 'wolf' ? this.wolfChat : null,
        iAmAlive: me ? !!me.alive : false,
      },
    };
  }
}
module.exports = { WerewolfEngine };
