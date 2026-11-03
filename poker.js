'use strict';
const { makeDeck, evaluateHand, evaluateBest, cardShort, BOT_NAMES, BOT_AVATARS } = require('./utils');
const START_CHIPS = 1000, SB = 5, BB = 10;

function suggestedDiscards(gp) {
  const cards = gp.cards, e = gp.eval || evaluateHand(gp.cards);
  let keep = new Set([0, 1, 2, 3, 4]);
  if (e.cat === 2) {
    const counts = {}; cards.forEach((c, i) => (counts[c.rank] = counts[c.rank] || []).push(i));
    keep = new Set(Object.values(counts).filter(v => v.length === 2).flat());
  } else if (e.cat === 1) {
    const counts = {}; cards.forEach((c, i) => (counts[c.rank] = counts[c.rank] || []).push(i));
    keep = new Set(Object.values(counts).find(v => v.length === 2));
  } else if (e.cat === 0) {
    const suits = {}; cards.forEach((c, i) => (suits[c.suit] = suits[c.suit] || []).push(i));
    const ff = Object.values(suits).find(v => v.length === 4);
    if (ff) keep = new Set(ff);
    else {
      const high = cards.map((c, i) => ({ c, i })).filter(x => x.c.rank >= 11).map(x => x.i);
      keep = new Set(high.length ? high : [cards.indexOf(cards.reduce((a, b) => a.rank > b.rank ? a : b))]);
    }
  }
  return [0, 1, 2, 3, 4].filter(i => !keep.has(i));
}

class PokerEngine {
  constructor(room, broadcast) {
    this.room = room; this.broadcast = broadcast; this.destroyed = false;
    this.G = null; this.dealerSeat = -1;
  }
  log(m) { this.room.log.push(m); if (this.room.log.length > 60) this.room.log.shift(); }
  addBot() {
    if (this.room.players.length >= this.room.size) return false;
    const used = this.room.players.map(p => p.name);
    let i = BOT_NAMES.findIndex(n => !used.includes(n)); if (i < 0) i = Math.floor(Math.random() * BOT_NAMES.length);
    this.room.players.push({ id: 'bot_' + Math.random().toString(36).slice(2, 9), name: BOT_NAMES[i], avatar: BOT_AVATARS[i], isBot: true, connected: true, chips: START_CHIPS });
    this.log(`🤖 ${BOT_NAMES[i]} takes a seat.`);
    if (this.G && this.G.phase === 'between') this.nextHand();
    return true;
  }
  start() { if (this.room.players.length >= 2 && !this.G) { this.G = { phase: 'between', players: [], pot: 0, board: [] }; this.log('🎲 Poker game started!'); this.nextHand(); } }

  active() { return this.G.players.filter(p => !p.folded); }
  actionable() { return this.G.players.filter(p => !p.folded && !p.allIn); }

  nextHand() {
    const G = this.G; if (!G) return;
    this.room.players.forEach(p => { if (p.isBot && p.chips <= 0) p.chips = START_CHIPS; });
    const seats = this.room.players.filter(p => p.chips > 0 && (p.isBot || p.connected));
    if (seats.length < 2) { G.phase = 'between'; G.players = []; G.message = 'Waiting for at least 2 players with chips…'; this.broadcast(); return; }
    this.dealerSeat = (this.dealerSeat + 1) % seats.length;
    const deck = makeDeck();
    const deal = this.room.variant === 'draw' ? 5 : this.room.variant === 'omaha' ? 4 : 2;
    G.variant = this.room.variant; G.board = []; G.deck = deck;
    G.pot = 0; G.currentBet = 0; G.minRaise = BB; G.winners = null;
    G.players = seats.map(p => ({ id: p.id, ref: p, cards: deck.splice(0, deal), folded: false, allIn: false, bet: 0, acted: false, drawDone: false, eval: null, won: false }));
    if (G.variant === 'draw') G.players.forEach(gp => gp.eval = evaluateHand(gp.cards));
    const n = G.players.length;
    const sbIdx = n === 2 ? this.dealerSeat : (this.dealerSeat + 1) % n;
    const bbIdx = (sbIdx + 1) % n;
    this.postBlind(sbIdx, SB); this.postBlind(bbIdx, BB);
    G.currentBet = Math.max(...G.players.map(p => p.bet));
    G.phase = 'betting1';
    G.message = G.variant === 'draw' ? 'Betting round — place your bets!' : 'Pre-flop — place your bets!';
    G.turnIdx = n === 2 ? this.dealerSeat : (bbIdx + 1) % n;
    this.log(`🃏 New ${G.variant === 'draw' ? '5-Card Draw' : G.variant === 'omaha' ? 'Omaha' : "Hold'em"} hand — ${G.players[this.dealerSeat].ref.name} deals.`);
    this.skip();
    this.broadcast(); this.maybeBot();
  }
  postBlind(idx, amt0) {
    const p = this.G.players[idx], amt = Math.min(amt0, p.ref.chips);
    p.ref.chips -= amt; p.bet += amt; this.G.pot += amt;
    if (!p.ref.chips) p.allIn = true;
  }
  skip() { let g = 0; while (g++ < 30) { const p = this.G.players[this.G.turnIdx]; if (!p || p.folded || p.allIn) { this.G.turnIdx = (this.G.turnIdx + 1) % this.G.players.length; continue; } break; } }
  roundDone() { const a = this.actionable(); return !a.length || a.every(p => p.acted && p.bet === this.G.currentBet); }

  action(pid, data) {
    const G = this.G; if (!G) return;
    if (data.type === 'next') { if (G.phase === 'showdown' || G.phase === 'between') this.nextHand(); return; }
    if (data.type === 'rebuy') { const p = this.room.players.find(x => x.id === pid); if (p && p.chips <= 0) { p.chips = START_CHIPS; this.log(`💵 ${p.name} rebuys.`); if (G.phase === 'between') this.nextHand(); else this.broadcast(); } return; }
    if (data.type === 'draw') return this.submitDraw(pid, data.discards);
    if (!G.phase.startsWith('betting')) return;
    const idx = G.players.findIndex(p => p.id === pid);
    if (idx !== G.turnIdx) return;
    const p = G.players[idx]; if (!p || p.folded || p.allIn) return;
    const act = data.type;
    if (act === 'fold') { p.folded = true; p.acted = true; this.log(`${p.ref.name} folds.`); }
    else if (act === 'check') { if (G.currentBet > p.bet) return; p.acted = true; this.log(`${p.ref.name} checks.`); }
    else if (act === 'call') {
      const amt = Math.min(G.currentBet - p.bet, p.ref.chips); if (amt <= 0) return;
      p.ref.chips -= amt; p.bet += amt; G.pot += amt; if (!p.ref.chips) p.allIn = true; p.acted = true; this.log(`${p.ref.name} calls ${amt}.`);
    } else if (act === 'raise' || act === 'allin') {
      let target = act === 'allin' ? p.bet + p.ref.chips : Math.floor(data.raiseTo || 0);
      target = Math.min(target, p.bet + p.ref.chips);
      if (target <= G.currentBet) return;
      if (target < G.currentBet + G.minRaise && target !== p.bet + p.ref.chips) return;
      const raiseSize = target - G.currentBet, amt = target - p.bet;
      p.ref.chips -= amt; p.bet = target; G.pot += amt;
      if (raiseSize >= G.minRaise) G.minRaise = raiseSize;
      G.currentBet = target; if (!p.ref.chips) p.allIn = true;
      G.players.forEach(x => { if (x !== p && !x.folded && !x.allIn) x.acted = false; });
      p.acted = true; this.log(`${p.ref.name} raises to ${target}${p.allIn ? ' (all-in!)' : ''}.`);
    } else return;
    if (this.active().length === 1) return this.endEarly();
    if (this.roundDone()) return this.advance();
    G.turnIdx = (idx + 1) % G.players.length; this.skip();
    if (this.roundDone()) return this.advance();
    this.broadcast(); this.maybeBot();
  }

  advance() {
    const G = this.G;
    G.players.forEach(p => { p.bet = 0; p.acted = false; });
    G.currentBet = 0; G.minRaise = BB;
    if (G.variant === 'draw') {
      if (G.phase === 'betting1') {
        G.phase = 'drawing'; G.message = 'Draw — tap cards to discard, then confirm.';
        this.log('✂️ Draw phase.');
        this.broadcast();
        G.players.filter(p => p.ref.isBot && !p.folded).forEach((p, i) => setTimeout(() => { if (!this.destroyed) this.submitDraw(p.id, suggestedDiscards(p)); }, 700 + i * 500));
        return;
      }
      if (G.phase === 'betting2') return this.showdown();
    } else {
      if (G.phase === 'betting4') return this.showdown();
      if (G.phase === 'betting1') { G.board.push(G.deck.pop(), G.deck.pop(), G.deck.pop()); G.phase = 'betting2'; G.message = 'The Flop.'; this.log(`🎴 Flop: ${G.board.map(cardShort).join(' ')}`); }
      else if (G.phase === 'betting2') { G.board.push(G.deck.pop()); G.phase = 'betting3'; G.message = 'The Turn.'; this.log(`🎴 Turn: ${cardShort(G.board[3])}`); }
      else if (G.phase === 'betting3') { G.board.push(G.deck.pop()); G.phase = 'betting4'; G.message = 'The River!'; this.log(`🎴 River: ${cardShort(G.board[4])}`); }
      return this.beginStreet();
    }
  }
  beginStreet() {
    const G = this.G;
    G.turnIdx = (this.dealerSeat + 1) % G.players.length; this.skip();
    if (!this.actionable().length) return this.advance();
    this.broadcast(); this.maybeBot();
  }
  submitDraw(pid, discards) {
    const G = this.G; if (!G || G.phase !== 'drawing') return;
    const p = G.players.find(x => x.id === pid);
    if (!p || p.folded || p.drawDone) return;
    const idxs = [...new Set((discards || []).filter(i => Number.isInteger(i) && i >= 0 && i < 5))];
    idxs.forEach(i => { p.cards[i] = G.deck.pop(); });
    p.drawDone = true; p.eval = evaluateHand(p.cards);
    this.log(idxs.length ? `${p.ref.name} draws ${idxs.length}.` : `${p.ref.name} stands pat.`);
    if (G.players.filter(x => !x.folded && !x.drawDone).length) { this.broadcast(); return; }
    if (this.active().length === 1) return this.endEarly();
    G.phase = 'betting2'; G.message = 'Final betting round!';
    G.players.forEach(x => { x.bet = 0; x.acted = false; }); G.currentBet = 0; G.minRaise = BB;
    this.log('💰 Final betting round.');
    G.turnIdx = (this.dealerSeat + 1) % G.players.length; this.skip();
    if (!this.actionable().length) return this.showdown();
    this.broadcast(); this.maybeBot();
  }
  endEarly() {
    const G = this.G, w = this.active()[0];
    w.ref.chips += G.pot; w.won = true;
    G.winners = [{ id: w.id, name: w.ref.name, amount: G.pot, hand: 'everyone else folded' }];
    G.phase = 'showdown'; G.message = `${w.ref.name} wins ${G.pot} — everyone else folded.`;
    this.log(`🏆 ${G.message}`); G.pot = 0; this.broadcast();
  }
  showdown() {
    const G = this.G;
    const contenders = this.active();
    contenders.forEach(p => p.eval = G.variant === 'draw' ? evaluateHand(p.cards) : evaluateBest(p.cards, G.board, G.variant));
    const best = Math.max(...contenders.map(p => p.eval.score));
    const winners = contenders.filter(p => p.eval.score === best);
    const share = Math.floor(G.pot / winners.length);
    let rem = G.pot - share * winners.length;
    winners.forEach(w => { w.ref.chips += share + (rem-- > 0 ? 1 : 0); w.won = true; });
    G.winners = winners.map(w => ({ id: w.id, name: w.ref.name, amount: share, hand: w.eval.name }));
    G.phase = 'showdown';
    G.message = winners.length > 1 ? `Split pot! ${winners.map(w => w.ref.name).join(' & ')} (${winners[0].eval.name})` : `${winners[0].ref.name} wins ${G.pot} with ${winners[0].eval.name}!`;
    this.log(`🏆 ${G.message}`); G.pot = 0; this.broadcast();
  }

  botStrength(gp) {
    const G = this.G;
    if (G.variant !== 'draw') {
      if (G.board.length >= 3) { const e = evaluateBest(gp.cards, G.board, G.variant); let s = e.cat * 2; if (e.cat === 1) s += 0.3; return s; }
      const rs = gp.cards.map(c => c.rank).sort((a, b) => b - a);
      const counts = {}; gp.cards.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
      const pairRank = Math.max(0, ...Object.entries(counts).filter(([, n]) => n >= 2).map(([r]) => +r));
      let s = pairRank ? 3 + pairRank / 7 : rs.slice(0, 2).reduce((a, r) => a + r, 0) / 9;
      if (gp.cards.every(c => c.suit === gp.cards[0].suit)) s += 0.5;
      return s;
    }
    const e = gp.eval; let s = e.cat * 2;
    if (e.cat === 1) s += (e.tiebreak[0] - 2) / 10;
    if (e.cat === 0) {
      const suits = {}; gp.cards.forEach(c => suits[c.suit] = (suits[c.suit] || 0) + 1);
      if (Object.values(suits).includes(4)) s += 1.2;
    }
    return s;
  }
  maybeBot() {
    const G = this.G; if (!G || !G.phase.startsWith('betting')) return;
    const p = G.players[G.turnIdx];
    if (!p || !p.ref.isBot || p.folded || p.allIn) return;
    setTimeout(() => {
      if (this.destroyed || !this.G || this.G !== G || !G.phase.startsWith('betting') || G.players[G.turnIdx] !== p) return;
      const strength = this.botStrength(p), toCall = G.currentBet - p.bet, pot = Math.max(G.pot, 1), rnd = Math.random();
      let act = 'check', raiseTo = null;
      if (!toCall) {
        if (strength >= 5 || (strength >= 3 && rnd < 0.5) || rnd < 0.05) { act = 'raise'; raiseTo = G.currentBet + G.minRaise + Math.floor(Math.random() * 4) * 10; }
      } else {
        const ratio = toCall / pot;
        if (strength >= 6 && rnd < 0.6) { act = 'raise'; raiseTo = G.currentBet + G.minRaise * 2; }
        else if (strength >= 1.6) act = 'call';
        else if (strength >= 1.0 && ratio < 0.35) act = 'call';
        else if (rnd < 0.04) { act = 'raise'; raiseTo = G.currentBet + G.minRaise; }
        else act = 'fold';
      }
      if (act === 'raise') { raiseTo = Math.min(raiseTo, p.bet + p.ref.chips); if (raiseTo <= G.currentBet) act = toCall ? 'call' : 'check'; }
      this.action(p.id, { type: act, raiseTo });
    }, 800 + Math.random() * 700);
  }

  disconnect(pid) {
    const G = this.G; if (!G) return;
    const gp = G.players.find(x => x.id === pid);
    if (gp && !gp.folded && G.phase !== 'showdown') {
      const wasTurn = G.phase.startsWith('betting') && G.players[G.turnIdx] && G.players[G.turnIdx].id === pid;
      gp.folded = true; gp.drawDone = true;
      if (this.active().length === 1 && G.phase !== 'between') return this.endEarly();
      if (wasTurn) {
        G.turnIdx = (G.turnIdx + 1) % G.players.length; this.skip();
        if (this.roundDone()) return this.advance();
        this.broadcast(); this.maybeBot();
      } else if (G.phase === 'drawing' && !G.players.filter(x => !x.folded && !x.drawDone).length) {
        this.submitDraw(pid, []); // will no-op (drawDone) then check below
        if (G.phase === 'drawing') { // force completion check
          G.phase = 'betting2'; G.message = 'Final betting round!'; G.players.forEach(x => { x.bet = 0; x.acted = false; }); G.currentBet = 0; G.minRaise = BB; G.turnIdx = (this.dealerSeat + 1) % G.players.length; this.skip(); this.broadcast(); this.maybeBot();
        }
      }
    }
  }

  publicState(viewerId) {
    const G = this.G;
    const meRef = this.room.players.find(p => p.id === viewerId);
    const players = this.room.players.map(p => {
      const gp = G ? G.players.find(x => x.id === p.id) : null;
      const show = G && G.phase === 'showdown' && gp && !gp.folded;
      return {
        id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, connected: p.connected, chips: p.chips,
        inHand: !!gp, folded: gp ? gp.folded : false, allIn: gp ? gp.allIn : false, bet: gp ? gp.bet : 0,
        cards: gp && (p.id === viewerId || show) ? gp.cards : null,
        cardCount: gp ? gp.cards.length : 0,
        isDealer: !!(G && G.players[this.dealerSeat] && G.players[this.dealerSeat].id === p.id),
        isTurn: !!(G && G.phase.startsWith('betting') && G.players[G.turnIdx] && G.players[G.turnIdx].id === p.id),
        handName: show && gp.eval ? gp.eval.name : null, winner: !!(gp && gp.won),
      };
    });
    const myGp = G ? G.players.find(x => x.id === viewerId) : null;
    return {
      players,
      game: G ? {
        phase: G.phase, pot: G.pot, board: G.board || [], message: G.message || '', winners: G.winners,
        currentBet: G.currentBet, minRaise: G.minRaise,
        isMyTurn: !!(G.phase.startsWith('betting') && G.players[G.turnIdx] && G.players[G.turnIdx].id === viewerId),
        toCall: myGp ? Math.max(0, G.currentBet - myGp.bet) : 0,
        myBet: myGp ? myGp.bet : 0, myChips: meRef ? meRef.chips : 0,
        drawDone: myGp ? !!myGp.drawDone : false, folded: myGp ? !!myGp.folded : true, inHand: !!myGp,
      } : null,
    };
  }
}
module.exports = { PokerEngine };
