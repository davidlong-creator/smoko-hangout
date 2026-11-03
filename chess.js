'use strict';
const { CH_VAL } = require('./utils');
const NAMES = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const inBd = (r, c, n) => r >= 0 && r < n && c >= 0 && c < n;

/* ----- standard chess core ----- */
function newBoard() {
  const back = ['r','n','b','q','k','b','n','r'];
  const bd = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) { bd[0][c] = { t: back[c], c: 'b' }; bd[1][c] = { t: 'p', c: 'b' }; bd[6][c] = { t: 'p', c: 'w' }; bd[7][c] = { t: back[c], c: 'w' }; }
  return bd;
}
const cloneBd = bd => bd.map(row => row.map(p => p ? { ...p } : null));
function isAttacked(bd, tr, tc, by) {
  const pdir = by === 'w' ? -1 : 1;
  for (const dc of [-1, 1]) { const r = tr - pdir, c = tc + dc; if (inBd(r, c, 8)) { const p = bd[r][c]; if (p && p.c === by && p.t === 'p') return true; } }
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const r = tr + dr, c = tc + dc; if (inBd(r, c, 8)) { const p = bd[r][c]; if (p && p.c === by && p.t === 'n') return true; } }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const r = tr + dr, c = tc + dc; if (inBd(r, c, 8)) { const p = bd[r][c]; if (p && p.c === by && p.t === 'k') return true; } }
  const slide = (dirs, types) => { for (const [dr, dc] of dirs) { let r = tr + dr, c = tc + dc; while (inBd(r, c, 8)) { const p = bd[r][c]; if (p) { if (p.c === by && types.includes(p.t)) return true; break; } r += dr; c += dc; } } return false; };
  return slide([[1,1],[1,-1],[-1,1],[-1,-1]], ['b','q']) || slide([[1,0],[-1,0],[0,1],[0,-1]], ['r','q']);
}
function kingPos(bd, color) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = bd[r][c]; if (p && p.t === 'k' && p.c === color) return [r, c]; } return null; }
function pseudo(bd, r, c, ep, castling) {
  const p = bd[r][c]; if (!p) return [];
  const moves = [], enemy = p.c === 'w' ? 'b' : 'w';
  const add = (tr, tc) => { if (inBd(tr, tc, 8)) { const t = bd[tr][tc]; if (!t || t.c === enemy) moves.push({ fr: r, fc: c, tr, tc, piece: p.t, capture: t ? t.t : null }); } };
  if (p.t === 'p') {
    const dir = p.c === 'w' ? -1 : 1, start = p.c === 'w' ? 6 : 1, promoRow = p.c === 'w' ? 0 : 7;
    if (inBd(r + dir, c, 8) && !bd[r + dir][c]) {
      moves.push({ fr: r, fc: c, tr: r + dir, tc: c, piece: 'p', capture: null, promo: r + dir === promoRow });
      if (r === start && !bd[r + 2 * dir][c]) moves.push({ fr: r, fc: c, tr: r + 2 * dir, tc: c, piece: 'p', capture: null, double: true });
    }
    for (const dc of [-1, 1]) {
      const tr = r + dir, tc = c + dc; if (!inBd(tr, tc, 8)) continue;
      const t = bd[tr][tc];
      if (t && t.c === enemy) moves.push({ fr: r, fc: c, tr, tc, piece: 'p', capture: t.t, promo: tr === promoRow });
      else if (!t && ep && ep[0] === tr && ep[1] === tc) moves.push({ fr: r, fc: c, tr, tc, piece: 'p', capture: 'p', epCapture: true });
    }
  } else if (p.t === 'n' || p.t === 'k') {
    const offs = p.t === 'n' ? [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    offs.forEach(([dr, dc]) => add(r + dr, c + dc));
    if (p.t === 'k' && castling) {
      const home = p.c === 'w' ? 7 : 0, rights = p.c === 'w' ? ['K','Q'] : ['k','q'];
      if (r === home && c === 4 && !isAttacked(bd, home, 4, enemy)) {
        if (castling[rights[0]] && !bd[home][5] && !bd[home][6] && bd[home][7] && bd[home][7].t === 'r' && !isAttacked(bd, home, 5, enemy) && !isAttacked(bd, home, 6, enemy)) moves.push({ fr: r, fc: c, tr: home, tc: 6, piece: 'k', capture: null, castle: 'K' });
        if (castling[rights[1]] && !bd[home][3] && !bd[home][2] && !bd[home][1] && bd[home][0] && bd[home][0].t === 'r' && !isAttacked(bd, home, 3, enemy) && !isAttacked(bd, home, 2, enemy)) moves.push({ fr: r, fc: c, tr: home, tc: 2, piece: 'k', capture: null, castle: 'Q' });
      }
    }
  } else {
    const dirs = p.t === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : p.t === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of dirs) { let tr = r + dr, tc = c + dc; while (inBd(tr, tc, 8)) { const t = bd[tr][tc]; if (!t) moves.push({ fr: r, fc: c, tr, tc, piece: p.t, capture: null }); else { if (t.c === enemy) moves.push({ fr: r, fc: c, tr, tc, piece: p.t, capture: t.t }); break; } tr += dr; tc += dc; } }
  }
  return moves;
}
function applyToState(st, m) {
  const bd = cloneBd(st.bd), castling = { ...st.castling }, piece = bd[m.fr][m.fc];
  if (m.epCapture) bd[m.fr][m.tc] = null;
  bd[m.tr][m.tc] = m.promo ? { t: m.promoPiece || 'q', c: piece.c } : piece;
  bd[m.fr][m.fc] = null;
  if (m.castle === 'K') { bd[m.tr][5] = bd[m.tr][7]; bd[m.tr][7] = null; }
  if (m.castle === 'Q') { bd[m.tr][3] = bd[m.tr][0]; bd[m.tr][0] = null; }
  if (piece.t === 'k') { if (piece.c === 'w') { castling.K = castling.Q = false; } else { castling.k = castling.q = false; } }
  const corner = (r, c, k) => { if ((m.fr === r && m.fc === c) || (m.tr === r && m.tc === c)) castling[k] = false; };
  corner(7,0,'Q'); corner(7,7,'K'); corner(0,0,'q'); corner(0,7,'k');
  return { bd, castling, ep: m.double ? [(m.fr + m.tr) / 2, m.fc] : null };
}
function legal(st, color) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = st.bd[r][c]; if (!p || p.c !== color) continue;
    for (const m of pseudo(st.bd, r, c, st.ep, st.castling)) {
      const ns = applyToState(st, m), kp = kingPos(ns.bd, color);
      if (kp && !isAttacked(ns.bd, kp[0], kp[1], color === 'w' ? 'b' : 'w')) out.push(m);
    }
  }
  return out;
}
function evaluate(bd) {
  let s = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = bd[r][c]; if (!p) continue;
    let v = CH_VAL[p.t]; if (p.t !== 'k') v += (3.5 - Math.abs(3.5 - c)) * 4 + (3.5 - Math.abs(3.5 - r)) * 4;
    s += p.c === 'w' ? v : -v;
  }
  return s;
}
function quiesce(st, color, alpha, beta, ply) {
  const sign = color === 'w' ? 1 : -1, stand = sign * evaluate(st.bd);
  if (ply >= 4) return stand;
  const moves = legal(st, color);
  const kp = kingPos(st.bd, color), inCheck = kp && isAttacked(st.bd, kp[0], kp[1], color === 'w' ? 'b' : 'w');
  if (!moves.length) return inCheck ? -100000 + ply : 0;
  if (!inCheck) { if (stand >= beta) return beta; if (stand > alpha) alpha = stand; }
  for (const m of moves.filter(m => inCheck || m.capture || m.promo)) {
    const sc = -quiesce(applyToState(st, m), color === 'w' ? 'b' : 'w', -beta, -alpha, ply + 1);
    if (sc >= beta) return beta; if (sc > alpha) alpha = sc;
  }
  return alpha;
}
function negamax(st, color, depth, alpha, beta, ply) {
  if (!depth) return quiesce(st, color, alpha, beta, ply);
  const moves = legal(st, color);
  if (!moves.length) { const kp = kingPos(st.bd, color); return kp && isAttacked(st.bd, kp[0], kp[1], color === 'w' ? 'b' : 'w') ? -100000 + ply : 0; }
  moves.sort((a, b) => (CH_VAL[b.capture] || 0) - (CH_VAL[a.capture] || 0));
  let best = -Infinity;
  for (const m of moves) { const sc = -negamax(applyToState(st, m), color === 'w' ? 'b' : 'w', depth - 1, -beta, -alpha, ply + 1); if (sc > best) best = sc; if (best > alpha) alpha = best; if (alpha >= beta) break; }
  return best;
}
function bestStandardMove(engine, color, depth = 3) {
  const st = { bd: engine.board, ep: engine.ep, castling: engine.castling };
  const moves = legal(st, color); if (!moves.length) return null;
  let best = null, bs = -Infinity;
  for (const m of moves) { const sc = -negamax(applyToState(st, m), color === 'w' ? 'b' : 'w', depth - 1, -Infinity, Infinity, 1); if (sc > bs) { bs = sc; best = m; } }
  return best;
}

/* ----- Royale core ----- */
const RO_COLORS = [
  { label: 'White', hex: '#ffffff', dir: [-1, 0] }, { label: 'Red', hex: '#ff5964', dir: [0, 1] },
  { label: 'Black', hex: '#26221f', dir: [1, 0] }, { label: 'Blue', hex: '#55aaff', dir: [0, -1] },
  { label: 'Gold', hex: '#ffd94d', dir: [-1, 0] },
];
function roPseudo(RO, bd, r, c) {
  const p = bd[r][c]; if (!p) return [];
  const moves = [], N = 14, hostile = (tr, tc) => { const t = bd[tr][tc]; return t && t.owner !== p.owner; };
  if (p.t === 'p') {
    const [dr, dc] = RO.players[p.owner].dir, sr = -dc, sc = dr;
    const oneR = r + dr, oneC = c + dc;
    if (inBd(oneR, oneC, N) && !bd[oneR][oneC]) {
      moves.push({ fr: r, fc: c, tr: oneR, tc: oneC, piece: 'p', capture: null, promo: oneR === 0 || oneR === 13 || oneC === 0 || oneC === 13 });
      const twoR = r + 2 * dr, twoC = c + 2 * dc;
      if (!p.moved && inBd(twoR, twoC, N) && !bd[twoR][twoC]) moves.push({ fr: r, fc: c, tr: twoR, tc: twoC, piece: 'p', capture: null });
    }
    for (const s of [1, -1]) { const tr = r + dr + sr * s, tc = c + dc + sc * s; if (inBd(tr, tc, N) && hostile(tr, tc)) moves.push({ fr: r, fc: c, tr, tc, piece: 'p', capture: bd[tr][tc].t, promo: tr === 0 || tr === 13 || tc === 0 || tc === 13 }); }
  } else if (p.t === 'n' || p.t === 'k') {
    const offs = p.t === 'n' ? [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr, dc] of offs) { const tr = r + dr, tc = c + dc; if (inBd(tr, tc, N) && (!bd[tr][tc] || hostile(tr, tc))) moves.push({ fr: r, fc: c, tr, tc, piece: p.t, capture: bd[tr][tc] ? bd[tr][tc].t : null }); }
  } else {
    const dirs = p.t === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : p.t === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of dirs) { let tr = r + dr, tc = c + dc; while (inBd(tr, tc, N)) { const t = bd[tr][tc]; if (!t) moves.push({ fr: r, fc: c, tr, tc, piece: p.t, capture: null }); else { if (hostile(tr, tc)) moves.push({ fr: r, fc: c, tr, tc, piece: p.t, capture: t.t }); break; } tr += dr; tc += dc; } }
  }
  return moves;
}
const roClone = bd => bd.map(row => row.map(p => p ? { ...p } : null));
function roApply(bd, m) { const nb = roClone(bd), piece = nb[m.fr][m.fc]; nb[m.tr][m.tc] = m.promo ? { t: 'q', owner: piece.owner, moved: true } : { ...piece, moved: true }; nb[m.fr][m.fc] = null; return nb; }
function roKingAttacked(RO, bd, owner) {
  let kr = -1, kc = -1;
  for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) { const p = bd[r][c]; if (p && p.t === 'k' && p.owner === owner) { kr = r; kc = c; } }
  if (kr < 0) return false;
  for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) { const p = bd[r][c]; if (!p || p.owner === owner) continue; if (roPseudo(RO, bd, r, c).some(m => m.tr === kr && m.tc === kc)) return true; }
  return false;
}

/* ----- Engine ----- */
class ChessEngine {
  constructor(room, broadcast) {
    this.room = room; this.broadcast = broadcast; this.destroyed = false;
    this.count = room.variant === 'standard' ? 2 : parseInt(room.variant.slice(-1));
    this.gameOver = false; this.result = ''; this.started = false;
  }
  log(m) { this.room.log.push(m); if (this.room.log.length > 60) this.room.log.shift(); }
  addBot() {
    if (this.room.players.length >= this.count) return false;
    if (!this.botNames) this.botNames = 0;
    const names = ['Deep Blue Jr', 'Garry Botparov', 'Magnus Carlson', 'Stockfishy', 'Knight Rider'];
    const name = names[this.botNames++ % names.length];
    this.room.players.push({ id: 'bot_' + Math.random().toString(36).slice(2, 9), name, avatar: '🤖', isBot: true, connected: true, chips: 0 });
    this.log(`🤖 ${name} sits down at the board.`);
    return true;
  }
  seatOf(pid) { return this.seats ? this.seats.findIndex(s => s.pid === pid) : -1; }
  start() {
    while (this.room.players.length < this.count) if (!this.addBot()) break;
    if (this.room.players.length < this.count) return;
    this.started = true; this.gameOver = false; this.result = '';
    if (this.room.variant === 'standard') {
      this.board = newBoard(); this.turn = 'w'; this.castling = { K: true, Q: true, k: true, q: true }; this.ep = null;
      this.seats = [0, 1].map(i => ({ pid: this.room.players[i].id, color: i ? 'b' : 'w' }));
      this.log('♟️ Standard chess started. White to move.');
    } else {
      const bd = Array.from({ length: 14 }, () => Array(14).fill(null));
      const order = ['r','n','b','q','k','b','n','r'];
      const place = (owner, cells, pawns) => { cells.forEach(([r, c], i) => bd[r][c] = { t: order[i], owner, moved: false }); pawns.forEach(([r, c]) => bd[r][c] = { t: 'p', owner, moved: false }); };
      place(0, order.map((_, i) => [13, 3 + i]), order.map((_, i) => [12, 3 + i]));
      place(2, order.map((_, i) => [0, 3 + i]), order.map((_, i) => [1, 3 + i]));
      if (this.count >= 3) place(1, order.map((_, i) => [3 + i, 0]), order.map((_, i) => [3 + i, 1]));
      if (this.count >= 4) place(3, order.map((_, i) => [3 + i, 13]), order.map((_, i) => [3 + i, 12]));
      if (this.count >= 5) place(4, order.map((_, i) => [7, 3 + i]), order.map((_, i) => [6, 3 + i]));
      this.board = bd; this.turnIdx = 0;
      this.players = RO_COLORS.slice(0, this.count).map((col, i) => ({ ...col, alive: true }));
      this.players[0].dir = [-1, 0]; if (this.players[2]) this.players[2].dir = [1, 0];
      if (this.players[1]) this.players[1].dir = [0, 1]; if (this.players[3]) this.players[3].dir = [0, -1];
      if (this.players[4]) this.players[4].dir = [-1, 0];
      this.seats = this.room.players.slice(0, this.count).map((p, i) => ({ pid: p.id, owner: i }));
      this.log(`👑 Chess Royale (${this.count}P) started!`);
    }
    this.broadcast();
    this.maybeBot();
  }
  currentSeatPlayer() {
    if (this.room.variant === 'standard') { const s = this.seats.find(x => x.color === this.turn); return this.room.players.find(p => p.id === s.pid); }
    const s = this.seats[this.turnIdx]; return s ? this.room.players.find(p => p.id === s.pid) : null;
  }
  maybeBot() {
    if (!this.started || this.gameOver) return;
    const cur = this.currentSeatPlayer();
    if (!cur || !cur.isBot) return;
    setTimeout(() => {
      if (this.destroyed || this.gameOver) return;
      if (this.room.variant === 'standard') {
        const m = bestStandardMove(this, this.turn, 2);
        if (m) this.doStandardMove(m);
      } else {
        const m = this.roBestMove(this.turnIdx);
        if (m) this.doRoyaleMove(m);
        else { this.advanceRoyale(); this.broadcast(); this.maybeBot(); }
      }
    }, 650);
  }
  doStandardMove(m) {
    const moverColor = this.turn;
    const st = { bd: this.board, ep: this.ep, castling: this.castling };
    const ns = applyToState(st, m);
    this.board = ns.bd; this.ep = ns.ep; this.castling = ns.castling;
    this.lastMove = m;
    const mover = this.currentSeatPlayer();
    this.log(`${mover ? mover.name : moverColor}: ${NAMES[m.piece]} ${m.capture ? 'captures ' + NAMES[m.capture] : 'moves'}${m.promo ? ' → ' + NAMES[m.promoPiece || 'q'] : ''}`);
    this.turn = moverColor === 'w' ? 'b' : 'w';
    const moves = legal({ bd: this.board, ep: this.ep, castling: this.castling }, this.turn);
    const kp = kingPos(this.board, this.turn), chk = kp && isAttacked(this.board, kp[0], kp[1], this.turn === 'w' ? 'b' : 'w');
    if (!moves.length) {
      this.gameOver = true;
      this.result = chk ? `Checkmate! ${mover ? mover.name : ''} wins! 🏆` : 'Stalemate — draw! 🤝';
      this.log(`🏁 ${this.result}`);
    }
    this.broadcast(); this.maybeBot();
  }
  doRoyaleMove(m) {
    const owner = this.turnIdx;
    const captured = this.board[m.tr][m.tc];
    this.board = roApply(this.board, m);
    this.lastMove = m;
    const mover = this.currentSeatPlayer();
    this.log(`${mover ? mover.name : ''} (${this.players[owner].label}): ${NAMES[m.piece]}${captured ? ' captures ' + NAMES[captured.t] : ' moves'}${m.promo ? ' → Queen' : ''}`);
    if (captured && captured.t === 'k') this.eliminate(captured.owner);
    this.advanceRoyale();
    this.broadcast(); this.maybeBot();
  }
  eliminate(owner) {
    this.players[owner].alive = false;
    for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) if (this.board[r][c] && this.board[r][c].owner === owner) this.board[r][c] = null;
    const seatP = this.room.players.find(p => p.id === this.seats[owner].pid);
    this.log(`💥 ${seatP ? seatP.name : this.players[owner].label} is eliminated — king captured!`);
  }
  advanceRoyale() {
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1) {
      this.gameOver = true;
      const wi = this.players.findIndex(p => p.alive);
      const wp = wi >= 0 ? this.room.players.find(p => p.id === this.seats[wi].pid) : null;
      this.result = wp ? `🏆 ${wp.name} (${this.players[wi].label}) is the last king standing!` : 'Draw!';
      this.log(`🏁 ${this.result}`);
      return;
    }
    let g = 0;
    do { this.turnIdx = (this.turnIdx + 1) % this.count; } while (!this.players[this.turnIdx].alive && g++ < 20);
  }
  roBestMove(owner) {
    const all = [];
    for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) { const p = this.board[r][c]; if (p && p.owner === owner) for (const m of roPseudo(this, this.board, r, c)) all.push(m); }
    if (!all.length) return null;
    const scored = all.map(m => {
      const nb = roApply(this.board, m);
      let s = Math.random() * 15;
      if (m.capture === 'k') s += 100000; else if (m.capture) s += CH_VAL[m.capture] * 1.2 - CH_VAL[m.piece] / 12;
      if (m.promo) s += CH_VAL.q;
      const safe = !roKingAttacked(this, nb, owner);
      if (!safe) s -= 60000;
      return { m, s, safe };
    });
    const pool = scored.filter(x => x.safe || x.m.capture === 'k');
    (pool.length ? pool : scored).sort((a, b) => b.s - a.s);
    return (pool.length ? pool : scored)[0].m;
  }
  action(pid, data) {
    if (!this.started || this.gameOver) return;
    if (data.type === 'resign') {
      if (this.room.variant === 'standard') {
        const seat = this.seatOf(pid); if (seat < 0) return;
        this.gameOver = true;
        const winnerSeat = this.seats[1 - seat];
        const wp = this.room.players.find(p => p.id === winnerSeat.pid);
        this.result = `${wp ? wp.name : ''} wins by resignation! 🏆`;
        this.log(`🏳️ ${this.result}`); this.broadcast();
      } else {
        const seat = this.seatOf(pid); if (seat < 0 || !this.players[seat].alive) return;
        this.eliminate(seat);
        if (this.turnIdx === seat) this.advanceRoyale();
        this.broadcast(); this.maybeBot();
      }
      return;
    }
    if (data.type !== 'move') return;
    if (this.room.variant === 'standard') {
      const seat = this.seats.find(s => s.pid === pid);
      if (!seat || seat.color !== this.turn) return;
      const st = { bd: this.board, ep: this.ep, castling: this.castling };
      const m = legal(st, this.turn).find(x => x.fr === data.fr && x.fc === data.fc && x.tr === data.tr && x.tc === data.tc && (!x.promo || (data.promoPiece || 'q') === (x.promoPiece || 'q') || x.promo));
      if (!m) return;
      if (m.promo) m.promoPiece = ['q','r','b','n'].includes(data.promoPiece) ? data.promoPiece : 'q';
      this.doStandardMove(m);
    } else {
      const seat = this.seatOf(pid);
      if (seat !== this.turnIdx || !this.players[seat].alive) return;
      const p = this.board[data.fr] && this.board[data.fr][data.fc];
      if (!p || p.owner !== seat) return;
      const m = roPseudo(this, this.board, data.fr, data.fc).find(x => x.tr === data.tr && x.tc === data.tc);
      if (!m) return;
      this.doRoyaleMove(m);
    }
  }
  disconnect(pid) {
    if (!this.started || this.gameOver) return;
    const seat = this.seatOf(pid); if (seat < 0) return;
    if (this.room.variant === 'standard') {
      this.gameOver = true;
      const wp = this.room.players.find(p => p.id === this.seats[1 - seat].pid);
      this.result = `${wp ? wp.name : 'Opponent'} wins — opponent disconnected.`;
      this.log(`🏁 ${this.result}`);
    } else if (this.players[seat].alive) {
      this.eliminate(seat);
      if (this.turnIdx === seat) this.advanceRoyale();
    }
    this.broadcast(); this.maybeBot();
  }
  publicState(viewerId) {
    const players = this.room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, connected: p.connected }));
    if (!this.started) return { players, game: null };
    if (this.room.variant === 'standard') {
      const mySeat = this.seats.find(s => s.pid === viewerId);
      const isMyTurn = mySeat && mySeat.color === this.turn && !this.gameOver;
      const myMoves = isMyTurn ? legal({ bd: this.board, ep: this.ep, castling: this.castling }, this.turn) : [];
      const kp = kingPos(this.board, this.turn);
      return {
        players,
        game: {
          kind: 'standard', board: this.board, turn: this.turn, seats: this.seats, lastMove: this.lastMove || null,
          inCheck: kp ? isAttacked(this.board, kp[0], kp[1], this.turn === 'w' ? 'b' : 'w') : false,
          gameOver: this.gameOver, result: this.result, mySeat: mySeat ? mySeat.color : null, myMoves,
        },
      };
    }
    const mySeat = this.seatOf(viewerId);
    const isMyTurn = mySeat === this.turnIdx && !this.gameOver && this.players[mySeat] && this.players[mySeat].alive;
    const myMoves = [];
    if (isMyTurn) for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) { const p = this.board[r][c]; if (p && p.owner === mySeat) myMoves.push(...roPseudo(this, this.board, r, c)); }
    return {
      players,
      game: {
        kind: 'royale', board: this.board, turnIdx: this.turnIdx, seats: this.seats, royalePlayers: this.players,
        lastMove: this.lastMove || null, gameOver: this.gameOver, result: this.result, mySeat, myMoves,
      },
    };
  }
}
module.exports = { ChessEngine, NAMES };
