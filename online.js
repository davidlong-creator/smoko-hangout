'use strict';
/* ============ ONLINE MULTIPLAYER (injected into the hosted app) ============ */
(function () {
  const $o = id => document.getElementById(id);
  const SUIT_CH = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const RK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const rk = r => RK[r] || r;
  const escO = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  let socket = null, OS = null, chessSel = null, pokerDiscards = new Set(), pendingPromo = null, lastPhaseKey = '';

  // ---- inject the Online section into the home screen ----
  const setup = $o('setupScreen');
  const card = document.createElement('div');
  card.className = 'card-box';
  card.innerHTML = `
    <h2>🌐 Play Online With Friends</h2>
    <p style="text-align:center; color:#d8c6c6; font-size:14px; line-height:1.6;">Real multiplayer! Create a room, share the code (or invite link), and friends join from their own phones/computers. Each player sees only their own cards/role. Bots can fill seats.</p>
    <div id="onlineErr" style="display:none; background:#5c1a14; border-radius:10px; color:#ffd9d3; padding:10px 14px; margin:10px 0;"></div>
    <label>Your name</label>
    <div class="name-row"><span>🧑</span><input id="onlineName" placeholder="e.g. Alex" maxlength="16"></div>
    <div style="display:flex; align-items:center; gap:10px; margin:8px 0 12px;">
      <div id="onlinePfpPreview" class="online-pfp online-pfp-preview">🧑</div>
      <button type="button" class="btn-ghost" id="onlinePfpBtn">📷 Upload profile picture</button>
      <input id="onlinePfpInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;">
    </div>
    <label>Game</label>
    <select id="onlineGameType" style="width:100%;">
      <option value="poker">🃏 Poker</option>
      <option value="werewolf">🐺 Werewolf / Mafia</option>
      <option value="chess">♟️ Chess</option>
    </select>
    <label id="onlineVariantLabel">Poker type</label>
    <select id="onlineVariant" style="width:100%;"></select>
    <label id="onlineSizeLabel">Players at the table</label>
    <select id="onlineSize" style="width:100%;"></select>
    <button class="btn-gold" id="onlineCreateBtn">🌐 Create Online Room</button>
    <div style="display:flex; gap:8px; margin-top:12px;">
      <input id="onlineJoinCode" placeholder="CODE" maxlength="4" style="text-transform:uppercase; text-align:center; font-weight:900; letter-spacing:4px; flex:1;">
      <button class="btn-green" id="onlineJoinBtn">Join Room</button>
    </div>`;
  setup.appendChild(card);

  const VARIANTS = {
    poker: { label: 'Poker type', options: [['draw', '🃏 5-Card Draw'], ['holdem', "🤠 Texas Hold'em"], ['omaha', '🌽 Omaha']], sizes: [2,3,4,5,6,7,8,9,10], sizeLabel: 'Players at the table' },
    werewolf: { label: 'Game', options: [['werewolf', '🐺 Werewolf / Mafia']], sizes: [5,6,7,8,9,10], sizeLabel: 'Villagers (bots fill the rest)' },
    chess: { label: 'Chess type', options: [['standard', '♔ Standard Chess (2 players)'], ['royale3', '👑 Chess Royale — 3 players'], ['royale4', '👑 Chess Royale — 4 players'], ['royale5', '👑 Chess Royale — 5 players']], sizes: [], sizeLabel: '' },
  };
  function refreshOnlineOptions() {
    const gt = $o('onlineGameType').value, cfg = VARIANTS[gt];
    $o('onlineVariantLabel').textContent = cfg.label;
    $o('onlineVariant').innerHTML = cfg.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const sizeSel = $o('onlineSize');
    if (cfg.sizes.length) {
      sizeSel.style.display = 'block'; $o('onlineSizeLabel').style.display = 'block';
      sizeSel.innerHTML = cfg.sizes.map(n => `<option value="${n}" ${n === (gt === 'poker' ? 4 : 7) ? 'selected' : ''}>${n} players</option>`).join('');
    } else { sizeSel.style.display = 'none'; $o('onlineSizeLabel').style.display = 'none'; }
  }
  $o('onlineGameType').onchange = refreshOnlineOptions;
  refreshOnlineOptions();

  // Uploaded profile pictures are cropped and resized locally before sharing.
  const PFP_KEY = 'gamesOnlinePfp';
  function storedPfp() {
    try { const s = localStorage.getItem(PFP_KEY) || ''; return /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(s) ? s : ''; } catch (_) { return ''; }
  }
  function paintPfp() {
    const preview = $o('onlinePfpPreview'), pfp = storedPfp();
    if (!preview) return;
    preview.textContent = pfp ? '' : '🧑';
    preview.style.backgroundImage = pfp ? `url("${pfp}")` : 'none';
  }
  async function resizePfp(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Please choose an image under 8 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That image could not be opened.')); i.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 128, 128);
      let result = canvas.toDataURL('image/webp', 0.84);
      if (result.length > 170000) result = canvas.toDataURL('image/jpeg', 0.78);
      if (result.length > 180000) throw new Error('That picture is too detailed — please choose a smaller image.');
      return result;
    } finally { URL.revokeObjectURL(url); }
  }
  $o('onlinePfpBtn').onclick = () => $o('onlinePfpInput').click();
  $o('onlinePfpInput').onchange = async e => {
    const input = e.target;
    try {
      const pfp = await resizePfp(input.files && input.files[0]);
      try { localStorage.setItem(PFP_KEY, pfp); } catch (_) {}
      paintPfp();
      if (socket && OS) socket.emit('profileUpdate', { avatarImage: pfp }, res => { if (res && !res.ok) onlineError(res.error || 'Could not update picture.'); });
    } catch (err) { onlineError(err.message || 'Could not use that picture.'); }
    input.value = '';
  };
  paintPfp();

  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $o('onlineJoinCode').value = urlRoom.toUpperCase();

  function onlineError(msg) { const e = $o('onlineErr'); if (e) { e.textContent = msg; e.style.display = 'block'; setTimeout(() => e.style.display = 'none', 5000); } const le = $o('onlineLobbyErr'); if (le && OS) { le.textContent = msg; le.style.display = 'block'; setTimeout(() => le.style.display = 'none', 5000); } }
  function ensureSocket() {
    if (typeof io === 'undefined') { onlineError('Online play only works on the hosted version of the app (this copy is the offline file).'); return null; }
    if (!socket) {
      socket = io();
      socket.on('onlineState', s => { OS = s; renderOnline(); if (window.GameParty) window.GameParty.onlineState(s); });
      socket.on('onlineError', onlineError);
      socket.on('connect_error', () => onlineError('Could not reach the game server.'));
      if (window.GameParty) window.GameParty.connect(socket);
    }
    return socket;
  }
  $o('onlineCreateBtn').onclick = () => {
    const s = ensureSocket(); if (!s) return;
    s.emit('createRoom', { name: $o('onlineName').value, avatarImage: storedPfp(), gameType: $o('onlineGameType').value, variant: $o('onlineVariant').value, size: parseInt($o('onlineSize').value) || 4 }, res => { if (res && !res.ok) onlineError(res.error || 'Could not create room.'); });
  };
  $o('onlineJoinBtn').onclick = () => {
    const s = ensureSocket(); if (!s) return;
    const code = $o('onlineJoinCode').value.trim();
    if (code.length !== 4) return onlineError('Enter the 4-letter room code.');
    s.emit('joinRoom', { name: $o('onlineName').value, avatarImage: storedPfp(), code }, res => { if (res && !res.ok) onlineError(res.error || 'Could not join.'); });
  };

  // ---- online screen ----
  const screen = document.createElement('div');
  screen.id = 'onlineScreen';
  screen.style.cssText = 'display:none; max-width:1000px; margin:0 auto; padding:14px; position:relative; z-index:1;';
  document.body.appendChild(screen);

  function playingCard(c, opts = {}) {
    const d = document.createElement('div');
    d.className = 'pcard' + (opts.small ? ' small' : '') + (opts.back ? ' back' : '') + (c && (c.suit === 'h' || c.suit === 'd') ? ' red' : '') + (opts.sel ? ' selected' : '') + (opts.click ? ' clickable' : '') + (opts.win ? ' winner-glow' : '');
    if (!opts.back && c) d.innerHTML = `<span>${rk(c.rank)}</span><span class="suit">${SUIT_CH[c.suit]}︎</span>`;
    return d;
  }
  const btn = (parent, label, cls, fn, dis) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.disabled = !!dis; b.onclick = fn; parent.appendChild(b); return b; };
  function pfpHTML(p, size = 32) {
    const lobby = OS && OS.lobbyPlayers ? OS.lobbyPlayers.find(x => x.id === p.id) : null;
    const image = p.avatarImage || (lobby && lobby.avatarImage) || '';
    if (image) return `<img class="online-pfp" style="width:${size}px;height:${size}px;" src="${escO(image)}" alt="">`;
    return `<span class="online-pfp online-pfp-emoji" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .72)}px;">${p.avatar || '🧑'}</span>`;
  }

  function renderOnline() {
    if (!OS) return;
    const phaseKey = (OS.game ? OS.game.phase || OS.game.kind || '' : 'lobby') + '|' + OS.started;
    if (phaseKey !== lastPhaseKey) { pokerDiscards.clear(); pendingPromo = null; chessSel = null; lastPhaseKey = phaseKey; }
    ['setupScreen', 'gameScreen', 'wolfScreen', 'chessScreen'].forEach(id => { const el = $o(id); if (el) el.style.display = 'none'; });
    screen.style.display = 'block';
    if (!OS.started) return renderLobby();
    if (OS.gameType === 'poker') return renderPoker();
    if (OS.gameType === 'werewolf') return renderWerewolf();
    if (OS.gameType === 'chess') return renderChessOnline();
  }

  function topbarHTML(title) {
    return `<div class="topbar"><div>${title}</div>
      <div style="background:#10231a; padding:6px 14px; border-radius:999px; font-weight:800; letter-spacing:2px;">ROOM: ${OS.code}</div>
      <div style="display:flex; gap:8px;"><button class="btn-ghost" id="olCopy">🔗 Invite link</button><button class="btn-ghost" id="olLeave">🚪 Leave</button></div></div>
      <div id="onlineLobbyErr" style="display:none; background:#5c1a14; border-radius:10px; color:#ffd9d3; padding:10px 14px; margin:8px 0;"></div>`;
  }
  function wireTopbar() {
    $o('olCopy').onclick = e => navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${OS.code}`).then(() => { e.target.textContent = '✅ Copied!'; setTimeout(() => e.target.textContent = '🔗 Invite link', 1500); });
    $o('olLeave').onclick = () => location.reload();
  }
  function logHTML() { return `<div class="panel"><h3>📜 LOG</h3><ul style="list-style:none; font-size:13px; line-height:1.65; max-height:140px; overflow-y:auto;">${OS.log.map(l => `<li>${escO(l)}</li>`).join('')}</ul></div>`; }

  function renderLobby() {
    const gtName = { poker: '🃏 Poker', werewolf: '🐺 Werewolf / Mafia', chess: '♟️ Chess' }[OS.gameType];
    const varName = { draw: '5-Card Draw', holdem: "Texas Hold'em", omaha: 'Omaha', werewolf: '', standard: 'Standard Chess', royale3: 'Chess Royale 3P', royale4: 'Chess Royale 4P', royale5: 'Chess Royale 5P' }[OS.variant] || '';
    screen.innerHTML = `${topbarHTML(`🌐 <b>${gtName}</b> ${varName}`)}
      <div class="panel" style="text-align:center;">
        <div style="font-size:15px; color:#d8c6c6;">Share this code with your friends:</div>
        <div style="font-size:52px; letter-spacing:10px; font-weight:900;">${OS.code}</div>
        <div style="color:#c4a3a8; font-size:13px;">or send them the invite link (they open it, type their name, hit Join Room)</div>
      </div>
      <div class="panel"><h3>🪑 PLAYERS (${OS.lobbyPlayers.length}${OS.gameType === 'chess' ? '/' + OS.size : ''})</h3>
        ${OS.lobbyPlayers.map(p => `<div style="padding:8px 4px; display:flex; align-items:center; gap:8px;">${pfpHTML(p, 34)} <b>${escO(p.name)}</b> ${p.id === OS.hostId ? '👑 host' : ''} ${p.isBot ? '(bot)' : ''} ${p.id === OS.meId ? '(you)' : ''}</div>`).join('') || '<i>Nobody yet…</i>'}
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-top:14px;" id="lobbyBtns"></div>
      <p class="hint" id="lobbyHint"></p>`;
    wireTopbar();
    const host = OS.hostId === OS.meId;
    if (host) {
      btn($o('lobbyBtns'), '🤖 Add Bot', 'btn-green', () => socket.emit('addBot'), OS.gameType === 'chess' && OS.lobbyPlayers.length >= OS.size);
      btn($o('lobbyBtns'), '▶️ Start Game', 'btn-gold', () => socket.emit('startGame'));
      $o('lobbyHint').textContent = OS.gameType === 'poker' ? 'Need at least 2 seats filled — add bots for empty ones!' : OS.gameType === 'werewolf' ? `The village fills to ${OS.size} with bots when you start.` : `The board fills to ${OS.size} seats with AI bots when you start.`;
    } else $o('lobbyHint').textContent = 'Waiting for the host to start the game…';
  }

  /* ---------- Poker ---------- */
  function renderPoker() {
    const g = OS.game;
    screen.innerHTML = `${topbarHTML(`🌐 <b>Poker</b> — ${{ draw: '5-Card Draw', holdem: "Texas Hold'em", omaha: 'Omaha' }[OS.variant]}`)}
      <div class="panel" style="text-align:center;">
        <div style="font-size:24px; font-weight:900; color:#ffe98a;">Pot: ${g.pot}</div>
        <div id="olBoard" style="display:flex; justify-content:center; gap:5px; margin:8px 0; min-height:52px;"></div>
        <div>${escO(g.message)}</div>
        ${g.winners ? `<div style="color:#ffd94d; font-weight:900; font-size:18px; margin-top:6px;">🏆 ${g.winners.map(w => `${escO(w.name)} wins ${w.amount} (${escO(w.hand)})`).join(' · ')}</div>` : ''}
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin:12px 0;" id="olSeats"></div>
      <div style="text-align:center;"><div id="olMyLabel" style="font-weight:800;"></div>
      <div id="olMyCards" style="display:flex; justify-content:center; gap:8px; margin:8px 0; min-height:84px; align-items:center;"></div>
      <div id="olControls" style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin:12px 0;"></div></div>
      ${logHTML()}`;
    wireTopbar();
    const boardEl = $o('olBoard');
    (g.board || []).forEach(c => boardEl.appendChild(playingCard(c)));
    const seatsEl = $o('olSeats');
    OS.players.forEach(p => {
      const d = document.createElement('div');
      d.style.cssText = `background:rgba(0,0,0,.35); border-radius:14px; padding:10px 12px; text-align:center; min-width:120px; ${p.isTurn ? 'box-shadow:0 0 16px #ffd94d;' : ''} ${p.folded ? 'opacity:.45;' : ''}`;
      d.innerHTML = `<div style="font-size:24px; display:flex; align-items:center; justify-content:center; gap:4px;">${pfpHTML(p, 38)}${p.isDealer ? ' <span style="background:#fff;color:#000;border-radius:50%;padding:0 6px;font-size:12px;font-weight:900;">D</span>' : ''}</div>
        <div style="font-weight:800;">${escO(p.name)}${p.isBot ? ' 🤖' : ''}${p.id === OS.meId ? ' (you)' : ''}</div>
        <div style="color:#ffe98a; font-weight:700;">💰 ${p.chips}${p.allIn ? ' ALL-IN' : ''}</div>
        ${p.bet ? `<div>bet ${p.bet}</div>` : ''}${p.handName ? `<div style="color:#ffd94d; font-weight:800;">${escO(p.handName)}</div>` : ''}`;
      const mc = document.createElement('div');
      mc.style.cssText = 'display:flex; justify-content:center; gap:3px; margin-top:5px;';
      if (p.inHand && p.id !== OS.meId) {
        if (p.cards) p.cards.forEach(c => mc.appendChild(playingCard(c, { small: true, win: p.winner })));
        else for (let i = 0; i < p.cardCount; i++) mc.appendChild(playingCard(null, { small: true, back: !p.folded }));
      }
      d.appendChild(mc);
      seatsEl.appendChild(d);
    });
    const me = OS.players.find(p => p.id === OS.meId);
    $o('olMyLabel').textContent = me ? `${me.avatar} ${me.name} — 💰 ${g.myChips} chips` : '';
    const myCards = $o('olMyCards');
    const canSelect = g.phase === 'drawing' && g.inHand && !g.folded && !g.drawDone;
    if (g.inHand && me && me.cards) me.cards.forEach((c, i) => {
      const el = playingCard(c, { click: canSelect, sel: pokerDiscards.has(i) });
      el.style.width = '58px'; el.style.height = '82px'; el.style.fontSize = '21px';
      if (canSelect) el.onclick = () => { pokerDiscards.has(i) ? pokerDiscards.delete(i) : pokerDiscards.add(i); renderPoker(); };
      myCards.appendChild(el);
    });
    const C = $o('olControls');
    if (g.phase === 'showdown') { btn(C, '▶️ Next Hand', 'btn-gold', () => socket.emit('gameAction', { type: 'next' })); if (g.myChips <= 0) btn(C, '💵 Rebuy 1,000', 'btn-green', () => socket.emit('gameAction', { type: 'rebuy' })); return; }
    if (!g.inHand) { C.innerHTML = '<span style="color:#d8c6c6;">👀 You\'ll be dealt in next hand…</span>'; if (g.myChips <= 0) btn(C, '💵 Rebuy 1,000', 'btn-green', () => socket.emit('gameAction', { type: 'rebuy' })); return; }
    if (g.folded) { C.innerHTML = '<span style="color:#d8c6c6;">You folded — watching 👀</span>'; return; }
    if (g.phase === 'drawing') {
      if (!g.drawDone) btn(C, pokerDiscards.size ? `✂️ Draw ${pokerDiscards.size}` : '🖐️ Stand Pat', 'btn-gold', () => socket.emit('gameAction', { type: 'draw', discards: [...pokerDiscards] }));
      else C.innerHTML = '<span style="color:#d8c6c6;">⏳ Waiting for others to draw…</span>';
      return;
    }
    if (g.isMyTurn) {
      btn(C, 'Fold', 'btn-red', () => socket.emit('gameAction', { type: 'fold' }));
      if (g.toCall === 0) btn(C, 'Check', 'btn-green', () => socket.emit('gameAction', { type: 'check' }));
      else btn(C, `Call ${g.toCall}`, 'btn-green', () => socket.emit('gameAction', { type: 'call' }));
      const maxTo = g.myBet + g.myChips, minTo = g.currentBet + g.minRaise;
      if (maxTo > g.currentBet) {
        const range = document.createElement('input');
        range.type = 'range'; range.min = Math.min(minTo, maxTo); range.max = maxTo; range.value = Math.min(minTo, maxTo); range.step = 5; range.style.width = '140px';
        const amt = document.createElement('span'); amt.style.cssText = 'font-weight:900; color:#ffe98a;'; amt.textContent = range.value;
        range.oninput = () => amt.textContent = range.value;
        C.appendChild(range); C.appendChild(amt);
        const rb = btn(C, 'Raise', 'btn-gold', () => socket.emit('gameAction', { type: 'raise', raiseTo: parseInt(range.value) }));
        btn(C, 'All-In 💥', 'btn-gold', () => socket.emit('gameAction', { type: 'allin' }));
      }
    } else C.innerHTML = `<span style="color:#d8c6c6;">Waiting for ${escO((OS.players.find(p => p.isTurn) || {}).name || '…')}…</span>`;
  }

  /* ---------- Werewolf ---------- */
  function renderWerewolf() {
    const g = OS.game;
    // preserve den chat typing across re-renders
    const prevChatVal = $o('olWolfChatInput') ? $o('olWolfChatInput').value : '';
    const chatFocused = document.activeElement && document.activeElement.id === 'olWolfChatInput';
    screen.innerHTML = `${topbarHTML('🌐 <b>Werewolf / Mafia</b>')}
      ${g.myRole ? `<div class="panel" style="text-align:center;"><div style="font-size:30px;">${escO(g.myRole.label)}</div><div>${escO(g.myRole.desc)}</div>${g.myRole.pack && g.myRole.pack.length ? `<div>🐺 Your pack: <b>${g.myRole.pack.map(escO).join(', ')}</b></div>` : ''}${g.myInvestigations && g.myInvestigations.length ? `<div style="margin-top:6px;">🔮 Your investigations: ${g.myInvestigations.map(i => `${escO(i.name)} — ${i.isWolf ? '🐺 WEREWOLF' : 'innocent'}`).join(' · ')}</div>` : ''}</div>` : ''}
      <div class="panel" style="text-align:center;">
        <div style="font-size:22px; font-weight:800; color:#ffd94d;">${escO({ reveal: '🤫 Secret roles', night: `🌙 Night ${g.round}`, morning: `☀️ Day ${g.round}`, vote: `🗳️ Day ${g.round} — vote`, voteResult: '⚖️ Result', over: '🏁 Game over' }[g.phase] || g.phase)}</div>
        <div style="line-height:1.7; margin-top:6px;">${escO(g.message)}</div>
        <div id="olWolfAction" style="display:flex; flex-direction:column; gap:10px; align-items:center; margin-top:14px;"></div>
      </div>
      <div class="panel"><h3>🏘️ THE VILLAGE</h3><div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px;">
        ${OS.players.map(p => `<div style="background:rgba(255,255,255,${p.alive ? '.07' : '.02'}); border-radius:12px; padding:10px; text-align:center; ${p.alive ? '' : 'opacity:.5;'}"><div style="font-size:24px; display:flex; justify-content:center;">${p.alive ? pfpHTML(p, 34) : '⚰️'}</div><div style="font-weight:700;">${escO(p.name)}${p.isBot ? ' 🤖' : ''}${p.id === OS.meId ? ' (you)' : ''}</div><div style="font-size:12px;">${p.alive ? 'Alive' : 'Dead' + (p.role ? ' · ' + escO(p.role) : '')}${p.role && p.alive ? ' · ' + escO(p.role) : ''}</div></div>`).join('')}
      </div></div>
      ${g.wolfChat ? `<div class="panel"><h3>🐺 WOLF DEN — SECRET PACK CHAT</h3>
        <div style="background:rgba(0,0,0,.35); border-radius:12px; padding:12px; max-height:200px; overflow-y:auto; line-height:1.6;">${g.wolfChat.length ? g.wolfChat.map(m => `<div><b>${escO(m.from)}:</b> ${escO(m.text)}</div>`).join('') : '<i>The den is quiet… plot your hunt!</i>'}</div>
        <div style="display:flex; gap:8px; margin-top:10px;"><input id="olWolfChatInput" placeholder="whisper to the pack…" maxlength="200" style="flex:1;"><button class="btn-red" id="olWolfChatSend">Send</button></div></div>` : ''}
      ${logHTML()}`;
    wireTopbar();
    const A = $o('olWolfAction');
    if (g.wolfChat) {
      const inp = $o('olWolfChatInput');
      inp.value = prevChatVal;
      const send = () => { const t = inp.value.trim(); if (t) socket.emit('gameAction', { type: 'wolfChat', text: t }); inp.value = ''; };
      $o('olWolfChatSend').onclick = send;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      if (chatFocused) inp.focus();
    }
    if (!g.iAmAlive && g.phase !== 'over') { A.innerHTML = '<span style="color:#d8c6c6;">☠️ You are dead — watching the village…</span>'; return; }
    if (g.phase === 'reveal' && !g.iAmReady) btn(A, '✅ I know my role — Ready', 'btn-gold', () => socket.emit('gameAction', { type: 'ready' }));
    else if (g.phase === 'morning') btn(A, '🗳️ Discuss & vote', 'btn-gold', () => socket.emit('gameAction', { type: 'continue' }));
    else if (g.phase === 'voteResult') btn(A, '🌙 Night falls…', 'btn-gold', () => socket.emit('gameAction', { type: 'continue' }));
    else if (g.phase === 'over') btn(A, '🔁 Play again', 'btn-gold', () => socket.emit('playAgain'));
    else if (g.myPrompt) {
      const label = g.myPrompt.type === 'vote' ? '🗳️ Who do you accuse?' : { wolf: '🐺 Choose the pack\'s victim:', doctor: '💉 Choose who to protect:', seer: '🔮 Choose who to investigate:' }[g.myPrompt.kind];
      const lab = document.createElement('div'); lab.style.fontWeight = '800'; lab.textContent = label; A.appendChild(lab);
      g.myPrompt.targets.forEach(t => btn(A, `${t.avatar} ${t.name}`, 'btn-ghost', () => socket.emit('gameAction', { type: g.myPrompt.type, kind: g.myPrompt.kind, targetId: t.id })));
    } else if (g.phase === 'night' || g.phase === 'vote') A.innerHTML = '<span style="color:#d8c6c6;">⏳ Waiting for the others…</span>';
  }

  /* ---------- Chess ---------- */
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  function renderChessOnline() {
    const g = OS.game;
    if (!g) { screen.innerHTML = `${topbarHTML('🌐 <b>Chess</b>')}<div class="panel">Setting up the board…</div>`; wireTopbar(); return; }
    const isRoyale = g.kind === 'royale';
    const nameOf = pid => { const p = OS.lobbyPlayers.find(x => x.id === pid); return p ? p.name : '?'; };
    let status, turnPid;
    if (!isRoyale) {
      turnPid = g.seats.find(s => s.color === g.turn).pid;
      status = g.gameOver ? g.result : `${nameOf(turnPid)} (${g.turn === 'w' ? 'White' : 'Black'}) to move${g.inCheck ? ' — CHECK!' : ''}`;
    } else {
      turnPid = g.seats[g.turnIdx].pid;
      status = g.gameOver ? g.result : `${nameOf(turnPid)} (${g.royalePlayers[g.turnIdx].label}) to move`;
    }
    screen.innerHTML = `${topbarHTML(`🌐 <b>${isRoyale ? 'Chess Royale' : 'Chess'}</b>`)}
      <div style="text-align:center; font-size:19px; font-weight:800; color:#ffd94d;">${escO(status)}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin:10px 0;">
        ${(isRoyale ? g.royalePlayers.map((rp, i) => `<span style="background:rgba(255,255,255,${g.turnIdx === i && !g.gameOver ? '.18' : '.05'}); padding:6px 12px; border-radius:999px; font-weight:700; ${rp.alive ? '' : 'opacity:.4; text-decoration:line-through;'}"><span style="color:${rp.hex};">●</span> ${escO(nameOf(g.seats[i].pid))}</span>`).join('') : g.seats.map(s => `<span style="background:rgba(255,255,255,${g.turn === s.color && !g.gameOver ? '.18' : '.05'}); padding:6px 12px; border-radius:999px; font-weight:700;">${s.color === 'w' ? '⚪' : '⚫'} ${escO(nameOf(s.pid))}</span>`).join(''))}
      </div>
      <div style="display:flex; justify-content:center; margin:10px 0;"><div id="olBoard" style="display:grid; gap:0; box-shadow:0 16px 40px rgba(0,0,0,.55); border-radius:8px; overflow:hidden;"></div></div>
      <div id="olChessAction" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin:10px 0;"></div>
      ${logHTML()}`;
    wireTopbar();
    const N = isRoyale ? 14 : 8;
    const bd = $o('olBoard');
    bd.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    bd.style.width = isRoyale ? 'min(94vw, 600px)' : 'min(92vw, 540px)';
    const myMoves = g.myMoves || [];
    const dests = chessSel ? myMoves.filter(m => m.fr === chessSel[0] && m.fc === chessSel[1]) : [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const sq = document.createElement('div');
      const p = g.board[r][c];
      let cls = 'chess-sq ' + ((r + c) % 2 ? 'dark' : 'light');
      if (chessSel && chessSel[0] === r && chessSel[1] === c) cls += ' selected';
      if (g.lastMove && ((g.lastMove.fr === r && g.lastMove.fc === c) || (g.lastMove.tr === r && g.lastMove.tc === c))) cls += ' lastmove';
      const mv = dests.find(m => m.tr === r && m.tc === c);
      if (mv) cls += mv.capture ? ' capturedot' : ' movedot';
      sq.className = cls;
      if (p) {
        const hex = isRoyale ? g.royalePlayers[p.owner].hex : (p.c === 'w' ? '#ffffff' : '#191919');
        const lightPiece = ['#ffffff', '#ffd94d'].includes(hex);
        sq.innerHTML = `<span class="chess-piece" style="font-size:${isRoyale ? 'min(5vw,25px)' : 'min(9vw,42px)'}; color:${hex}; -webkit-text-stroke:1px ${hex === '#26221f' ? '#e8e0d0' : lightPiece ? '#3a3a3a' : 'rgba(0,0,0,.55)'};">${GLYPH[p.t]}︎</span>`;
      }
      sq.onclick = () => {
        if (g.gameOver) return;
        const mine = isRoyale ? (p && p.owner === g.mySeat) : (p && p.c === g.mySeat);
        const isMyBoardTurn = isRoyale ? g.mySeat === g.turnIdx : (g.mySeat && g.mySeat === g.turn);
        if (!isMyBoardTurn) return;
        if (chessSel) {
          const cand = dests.filter(m => m.tr === r && m.tc === c);
          if (cand.length) {
            if (cand.some(m => m.promo)) { pendingPromo = { moves: cand }; renderChessOnline(); return; }
            socket.emit('gameAction', { type: 'move', fr: cand[0].fr, fc: cand[0].fc, tr: r, tc: c });
            chessSel = null; return;
          }
        }
        chessSel = mine ? [r, c] : null;
        renderChessOnline();
      };
      bd.appendChild(sq);
    }
    const A = $o('olChessAction');
    if (pendingPromo) {
      const lab = document.createElement('span'); lab.textContent = 'Promote to:'; lab.style.fontWeight = '800'; A.appendChild(lab);
      [['q', '♛ Queen'], ['r', '♜ Rook'], ['b', '♝ Bishop'], ['n', '♞ Knight']].forEach(([t, label]) => btn(A, label, 'btn-gold', () => { const m = pendingPromo.moves[0]; socket.emit('gameAction', { type: 'move', fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, promoPiece: t }); pendingPromo = null; chessSel = null; }));
    } else {
      const mySeatHere = isRoyale ? g.mySeat >= 0 : !!g.mySeat;
      if (!g.gameOver && mySeatHere) btn(A, '🏳️ Resign', 'btn-red', () => socket.emit('gameAction', { type: 'resign' }));
      if (g.gameOver) btn(A, '🔁 Play again', 'btn-gold', () => socket.emit('playAgain'));
    }
  }
})();
