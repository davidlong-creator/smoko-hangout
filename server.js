'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { PokerEngine } = require('./poker');
const { WerewolfEngine } = require('./werewolf');
const { ChessEngine } = require('./chess');
const { roomCode: genCode, BOT_AVATARS } = require('./utils');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/online.js', (_req, res) => res.sendFile(path.join(__dirname, 'online.js')));
app.get('/party.js', (_req, res) => res.sendFile(path.join(__dirname, 'party.js')));
const PORT = process.env.PORT || 3000;

const rooms = new Map();
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
const ENGINES = { poker: PokerEngine, werewolf: WerewolfEngine, chess: ChessEngine };
const cleanName = n => String(n || '').trim().slice(0, 16) || 'Player';
const cleanImage = value => {
  const s = String(value || '');
  return s.length <= 180000 && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(s) ? s : '';
};

function fullState(room, viewerId) {
  const base = {
    code: room.code, gameType: room.gameType, variant: room.variant, size: room.size,
    hostId: room.hostId, started: !!room.started, log: room.log.slice(-30), meId: viewerId,
    lobbyPlayers: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, avatarImage: p.avatarImage || '', isBot: p.isBot, connected: p.connected, chips: p.chips })),
  };
  if (room.engine) Object.assign(base, room.engine.publicState(viewerId));
  else base.players = base.lobbyPlayers;
  return base;
}
function broadcast(room) {
  if (!rooms.has(room.code)) return;
  for (const p of room.players) {
    if (!p.isBot && p.connected && p.socketId) io.to(p.socketId).emit('onlineState', fullState(room, p.id));
  }
}
function makeEngine(room) {
  const Cls = ENGINES[room.gameType];
  room.engine = new Cls(room, () => broadcast(room));
}
function ensureParty(room) {
  if (!room.partyChat) room.partyChat = [];
  if (!room.partyGroups) room.partyGroups = [];
  if (!room.mediaRoom) room.mediaRoom = `GamesHost-${room.code}-${crypto.randomBytes(9).toString('hex')}`;
}
function publicPartyMessage(m) {
  return { id: m.id, fromId: m.fromId, from: m.from, text: m.text, at: m.at, conversation: m.conversation, toId: m.toId, groupId: m.groupId };
}
function emitPartyTo(room, player) {
  ensureParty(room);
  const chat = room.partyChat.filter(m => !m.audience || m.audience.includes(player.id)).slice(-100).map(publicPartyMessage);
  const groups = room.partyGroups.filter(g => g.memberIds.includes(player.id)).map(g => ({ id: g.id, name: g.name, memberIds: g.memberIds }));
  io.to(player.socketId).emit('partyState', {
    code: room.code, mediaRoom: room.mediaRoom, chat, groups,
    members: room.players.filter(p => !p.isBot && p.connected).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, avatarImage: p.avatarImage || '' })),
  });
}
function broadcastParty(room) {
  if (!rooms.has(room.code)) return;
  ensureParty(room);
  for (const p of room.players) if (!p.isBot && p.connected && p.socketId) emitPartyTo(room, p);
}
function sendPartyMessage(room, msg) {
  room.partyChat.push(msg);
  if (room.partyChat.length > 200) room.partyChat.splice(0, room.partyChat.length - 200);
  const outgoing = publicPartyMessage(msg);
  for (const p of room.players) {
    if (p.isBot || !p.connected || !p.socketId) continue;
    if (msg.audience && !msg.audience.includes(p.id)) continue;
    io.to(p.socketId).emit('partyMessage', outgoing);
  }
}

io.on('connection', socket => {
  console.log(`🔌 ${socket.id} connected`);
  let myRoom = null;
  let lastPartyChatAt = 0;
  const me = () => myRoom ? myRoom.players.find(p => p.id === socket.id) : null;

  socket.on('createRoom', (opts, cb) => {
    const gameType = ['poker', 'werewolf', 'chess'].includes(opts.gameType) ? opts.gameType : 'poker';
    let variant = String(opts.variant || 'draw');
    let size = parseInt(opts.size) || 4;
    if (gameType === 'poker') { if (!['draw', 'holdem', 'omaha'].includes(variant)) variant = 'draw'; size = Math.min(10, Math.max(2, size)); }
    if (gameType === 'werewolf') { variant = 'werewolf'; size = Math.min(10, Math.max(5, size)); }
    if (gameType === 'chess') { if (!['standard', 'royale3', 'royale4', 'royale5'].includes(variant)) variant = 'standard'; size = variant === 'standard' ? 2 : parseInt(variant.slice(-1)); }
    let code = genCode(); while (rooms.has(code)) code = genCode();
    const room = { code, gameType, variant, size, hostId: socket.id, players: [], log: [], started: false, engine: null };
    rooms.set(code, room);
    room.players.push({ id: socket.id, socketId: socket.id, name: cleanName(opts.name), avatar: '🧑', avatarImage: cleanImage(opts.avatarImage), isBot: false, connected: true, chips: 1000 });
    room.log.push(`🎲 Room ${code} created for ${gameType}.`);
    myRoom = room; socket.join(code);
    makeEngine(room);
    console.log(`🎲 Room ${code} (${gameType}/${variant}, size ${size}) by ${cleanName(opts.name)}`);
    if (cb) cb({ ok: true, code });
    broadcast(room);
    broadcastParty(room);
  });

  socket.on('joinRoom', (opts, cb) => {
    const { name, code } = opts || {};
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) { if (cb) cb({ ok: false, error: 'Room not found — check the code.' }); return socket.emit('onlineError', 'Room not found — check the code.'); }
    const maxSeats = room.gameType === 'chess' ? room.size : room.size;
    if (room.players.length >= maxSeats && room.started) { if (cb) cb({ ok: false, error: 'That room is full / already playing.' }); return socket.emit('onlineError', 'That room is full / already playing.'); }
    if (room.players.filter(p => !p.isBot).length >= 10) { if (cb) cb({ ok: false, error: 'Room is full of humans!' }); return socket.emit('onlineError', 'Room is full.'); }
    room.players.push({ id: socket.id, socketId: socket.id, name: cleanName(name), avatar: '🧑', avatarImage: cleanImage(opts && opts.avatarImage), isBot: false, connected: true, chips: 1000 });
    room.log.push(`👋 ${cleanName(name)} joined.`);
    myRoom = room; socket.join(room.code);
    console.log(`🚪 ${cleanName(name)} joined ${room.code}`);
    if (cb) cb({ ok: true, code: room.code });
    broadcast(room);
    broadcastParty(room);
  });

  socket.on('partyCreateGroup', (opts, cb) => {
    const room = myRoom, player = me();
    if (!room || !player) return;
    ensureParty(room);
    const requested = Array.isArray(opts && opts.memberIds) ? opts.memberIds.map(String) : [];
    const memberIds = [...new Set([socket.id, ...requested])].filter(id => room.players.some(p => p.id === id && !p.isBot && p.connected));
    if (memberIds.length < 2) { if (cb) cb({ ok: false, error: 'Choose at least one other player.' }); return; }
    const group = { id: crypto.randomBytes(5).toString('hex'), name: String((opts && opts.name) || 'Private group').trim().slice(0, 24) || 'Private group', memberIds };
    room.partyGroups.push(group);
    if (room.partyGroups.length > 30) room.partyGroups.shift();
    broadcastParty(room);
    if (cb) cb({ ok: true, group });
  });
  socket.on('partyChat', opts => {
    const room = myRoom, player = me();
    if (!room || !player) return;
    ensureParty(room);
    const text = String((opts && opts.text) || '').trim().slice(0, 1000);
    if (!text) return;
    const now = Date.now();
    if (now - lastPartyChatAt < 250) return;
    lastPartyChatAt = now;
    let conversation = 'all', audience = null, toId = null, groupId = null;
    const requested = String((opts && opts.conversation) || 'all');
    if (requested.startsWith('dm:')) {
      const target = room.players.find(p => p.id !== socket.id && !p.isBot && p.connected && `dm:${[socket.id, p.id].sort().join('-')}` === requested);
      if (!target) return;
      conversation = requested;
      audience = [socket.id, target.id]; toId = target.id;
    } else if (requested.startsWith('group:')) {
      const id = requested.slice(6);
      const group = room.partyGroups.find(g => g.id === id && g.memberIds.includes(socket.id));
      if (!group) return;
      conversation = `group:${id}`; audience = group.memberIds.slice(); groupId = id;
    }
    sendPartyMessage(room, { id: crypto.randomBytes(6).toString('hex'), fromId: socket.id, from: player.name, text, at: now, conversation, audience, toId, groupId });
  });
  socket.on('profileUpdate', (opts, cb) => {
    const room = myRoom, player = me();
    if (!room || !player) return;
    const avatarImage = cleanImage(opts && opts.avatarImage);
    if (opts && opts.avatarImage && !avatarImage) { if (cb) cb({ ok: false, error: 'Please choose a smaller PNG, JPEG, WebP or GIF image.' }); return; }
    player.avatarImage = avatarImage;
    broadcast(room);
    broadcastParty(room);
    if (cb) cb({ ok: true });
  });

  socket.on('addBot', () => {
    if (!myRoom || !myRoom.engine) return;
    if (myRoom.engine.addBot()) broadcast(myRoom);
  });
  socket.on('startGame', () => {
    if (!myRoom || myRoom.started || !myRoom.engine) return;
    if (myRoom.gameType === 'poker' && myRoom.players.length < 2) return socket.emit('onlineError', 'Need at least 2 players — add a bot!');
    myRoom.started = true;
    myRoom.engine.start();
    broadcast(myRoom);
  });
  socket.on('gameAction', data => { if (myRoom && myRoom.engine) myRoom.engine.action(socket.id, data || {}); });
  socket.on('playAgain', () => {
    if (!myRoom || !myRoom.engine) return;
    if (myRoom.gameType === 'werewolf' && myRoom.engine.phase === 'over') myRoom.engine.start();
    else if (myRoom.gameType === 'chess' && myRoom.engine.gameOver) { myRoom.engine.started = false; myRoom.engine.start(); }
    else if (myRoom.gameType === 'poker') myRoom.engine.action(socket.id, { type: 'next' });
    broadcast(myRoom);
  });

  socket.on('disconnect', () => {
    if (!myRoom) return;
    const room = myRoom, player = me();
    if (player) {
      player.connected = false;
      room.log.push(`👋 ${player.name} disconnected.`);
      if (room.engine) room.engine.disconnect(socket.id);
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.hostId === socket.id) { const nh = room.players.find(p => !p.isBot); room.hostId = nh ? nh.id : null; }
      if (!room.players.some(p => !p.isBot)) {
        if (room.engine) room.engine.destroyed = true;
        rooms.delete(room.code);
        console.log(`🗑️ Room ${room.code} closed (empty)`);
        return;
      }
      // if the game can no longer run (e.g. poker <2 humans+bots), keep room as lobby
      broadcast(room);
      broadcastParty(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`🎮 Games online server on http://0.0.0.0:${PORT}`));
