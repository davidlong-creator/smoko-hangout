'use strict';
const SUITS = ['s', 'h', 'd', 'c'];
const SUIT_CHAR = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = r => RANK_LABEL[r] || String(r);
const cardShort = c => `${rankLabel(c.rank)}${SUIT_CHAR[c.suit]}`;
const BOT_NAMES = ['Dead-Eye Dan','Lucky Lucy','Slick Rick','Calamity Jane','Wild Bill','Vegas Vera','Bankroll Bob','Quiet Quinn','Fast Eddie','River Ruth'];
const BOT_AVATARS = ['🤠','🍀','😎','🔥','🎩','💃','🧢','🤫','⚡','🌊'];
const CH_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 100000 };

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function combos(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return combos(rest, k - 1).map(c => [first, ...c]).concat(combos(rest, k));
}
function evaluateHand(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  const uniq = [...new Set(ranks)];
  let isStraight = false, straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; straightHigh = uniq[0]; }
    else if (JSON.stringify(uniq) === JSON.stringify([14, 5, 4, 3, 2])) { isStraight = true; straightHigh = 5; }
  }
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.entries(counts).map(([r, c]) => ({ rank: +r, count: c })).sort((a, b) => b.count - a.count || b.rank - a.rank);
  let cat, name;
  if (isStraight && isFlush) { cat = 8; name = straightHigh === 14 ? 'Royal Flush' : 'Straight Flush'; }
  else if (groups[0].count === 4) { cat = 7; name = 'Four of a Kind'; }
  else if (groups[0].count === 3 && groups[1].count === 2) { cat = 6; name = 'Full House'; }
  else if (isFlush) { cat = 5; name = 'Flush'; }
  else if (isStraight) { cat = 4; name = 'Straight'; }
  else if (groups[0].count === 3) { cat = 3; name = 'Three of a Kind'; }
  else if (groups[0].count === 2 && groups[1].count === 2) { cat = 2; name = 'Two Pair'; }
  else if (groups[0].count === 2) { cat = 1; name = 'One Pair'; }
  else { cat = 0; name = 'High Card'; }
  const tiebreak = isStraight ? [straightHigh] : groups.flatMap(g => Array(g.count).fill(g.rank));
  return { cat, name, tiebreak, score: cat * 1e10 + tiebreak.reduce((a, r, i) => a + r * Math.pow(100, 4 - i), 0) };
}
function evaluateBest(hole, board, variant) {
  let best = null;
  const consider = cards => { const e = evaluateHand(cards); if (!best || e.score > best.score) best = e; };
  if (variant === 'omaha') combos(hole, 2).forEach(h => combos(board, 3).forEach(b => consider([...h, ...b])));
  else combos([...hole, ...board], 5).forEach(consider);
  return best;
}
function roomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
module.exports = { SUITS, SUIT_CHAR, RANK_LABEL, rankLabel, cardShort, BOT_NAMES, BOT_AVATARS, CH_VAL, makeDeck, combos, evaluateHand, evaluateBest, roomCode };
