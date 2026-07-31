// Loads the experiment config. Every user-visible string (copy, card content,
// nudges), every knob (streak rewards, deck size limits) and the banned-word
// lint list live here — logic never contains copy, so re-contenting or A/B
// changes never touch code. Validated at boot: fail fast, not mid-request.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH =
  process.env.EXPERIMENT_CONFIG_PATH ||
  path.join(__dirname, '..', 'config', 'experiment.config.json');

const CARD_FIELD_LIMITS = {
  title: 24,
  // The two fortune lines are the whole on-screen insight, so they get a
  // little more room than a headline would — but stay capped, because the
  // card has to read in one glance on a small phone.
  fortuneLine: 115,
  finding: 140,
  consult_nudge: 110,
  prefill_question: 120,
};

export function validateCard(card, cfg, label) {
  const fail = (msg) => { throw new Error(`config/deck ${label}: ${msg}`); };
  if (typeof card.title !== 'string' || !card.title.trim()) fail('title required');
  if (card.title.length > CARD_FIELD_LIMITS.title) fail(`title over ${CARD_FIELD_LIMITS.title} chars`);
  // A card's identity (art_key + title + theme) is fixed by the catalogue —
  // one illustration per art_key, forever. Only the words are rewritten daily,
  // so a generated deck can never name a card we have no artwork for.
  const entry = cfg.deck.catalogue[card.art_key];
  if (!entry) fail(`unknown art_key "${card.art_key}"`);
  if (card.title !== entry.title) fail(`art_key "${card.art_key}" must be titled "${entry.title}"`);
  if (card.theme !== entry.theme) fail(`art_key "${card.art_key}" must use theme "${entry.theme}"`);
  if (!Array.isArray(card.fortune) || card.fortune.length !== 2 ||
      card.fortune.some((l) => typeof l !== 'string' || !l.trim() || l.length > CARD_FIELD_LIMITS.fortuneLine)) {
    fail('fortune must be exactly 2 non-empty lines within limits');
  }
  for (const field of ['finding', 'consult_nudge', 'prefill_question']) {
    if (typeof card[field] !== 'string' || !card[field].trim()) fail(`${field} required`);
    if (card[field].length > CARD_FIELD_LIMITS[field]) fail(`${field} over ${CARD_FIELD_LIMITS[field]} chars`);
  }
  if (!card.prefill_question.includes(card.title)) {
    fail('prefill_question must contain the card title verbatim');
  }
  // Valence lint: no banned word may appear in any user-visible field.
  const text = [card.title, ...card.fortune, card.finding, card.consult_nudge, card.prefill_question].join(' ');
  const hit = findBannedWord(cfg, text);
  if (hit) fail(`banned word "${hit}" in card text`);
  // House style: no em or en dashes. Language models reach for them
  // constantly, so this is a lint rather than a prompt line — the prompt asks,
  // this guarantees.
  if (/[—–]/.test(text)) fail('em/en dash in card text (use a full stop or a comma)');
}

// Word-boundary match for plain words; substring match for tokens with
// non-word characters (e.g. "100%").
export function findBannedWord(cfg, text) {
  const lower = text.toLowerCase();
  for (const word of cfg.bannedWords) {
    if (/^[\w]+$/.test(word)) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) return word;
    } else if (lower.includes(word.toLowerCase())) {
      return word;
    }
  }
  return null;
}

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const s = raw.streak;
  if (!s || !Number.isInteger(s.length) || s.length < 1) {
    throw new Error('config: streak.length must be a positive integer');
  }
  if (!s.rewards || typeof s.rewards !== 'object' || Object.keys(s.rewards).length === 0) {
    throw new Error('config: streak.rewards must map streak-day -> coins');
  }
  for (const [dayN, amount] of Object.entries(s.rewards)) {
    const n = Number(dayN);
    if (!Number.isInteger(n) || n < 1 || n > s.length || !Number.isInteger(amount) || amount <= 0) {
      throw new Error(`config: streak.rewards["${dayN}"] must be a day 1..${s.length} with a positive integer amount`);
    }
  }

  const d = raw.deck;
  // The card catalogue is the deck's identity table. artKeys is derived from
  // it so there is exactly one place a card can be added or renamed.
  if (!d || !Array.isArray(d.cards) || d.cards.length === 0) {
    throw new Error('config: deck.cards must list the fortune-card catalogue');
  }
  d.catalogue = {};
  d.artKeys = [];
  for (const card of d.cards) {
    const { art_key: key, title, theme, numeral } = card;
    if (!key || !title || !theme || !numeral) {
      throw new Error(`config: deck.cards entry needs art_key, title, theme, numeral (got ${JSON.stringify(card)})`);
    }
    if (d.catalogue[key]) throw new Error(`config: duplicate art_key "${key}" in deck.cards`);
    if (!Array.isArray(d.themes) || !d.themes.includes(theme)) {
      throw new Error(`config: deck.cards "${key}" uses unknown theme "${theme}"`);
    }
    if (title.length > CARD_FIELD_LIMITS.title) {
      throw new Error(`config: deck.cards title "${title}" over ${CARD_FIELD_LIMITS.title} chars`);
    }
    d.catalogue[key] = { art_key: key, title, theme, numeral };
    d.artKeys.push(key);
  }
  if (!d || !Array.isArray(d.themes) || d.themes.length === 0 ||
      !Number.isInteger(d.size) || d.size < 1 ||
      !Number.isInteger(d.minSize) || d.minSize < 1 || d.minSize > d.size ||
      !Number.isInteger(d.maxSize) || d.maxSize < d.size ||
      !Number.isInteger(d.maxPerTheme) || d.maxPerTheme < 1 ||
      !Number.isInteger(d.recentTitleDays) || d.recentTitleDays < 0) {
    throw new Error('config: deck needs cards, themes, size, minSize, maxSize, maxPerTheme, recentTitleDays');
  }
  if (d.maxSize > d.artKeys.length) {
    throw new Error(`config: deck.maxSize (${d.maxSize}) exceeds the ${d.artKeys.length}-card catalogue`);
  }
  if (!Array.isArray(raw.bannedWords)) throw new Error('config: bannedWords must be an array');
  if (!raw.consultTarget?.deeplink) throw new Error('config: consultTarget.deeplink required');
  if (!raw.copy) throw new Error('config: copy block required');
  // Optional: real illustration assets. Until baseUrl is set the client uses
  // its built-in placeholder art, keyed by the same art_key.
  raw.art = raw.art || { baseUrl: null, ext: 'png' };
  raw.astrologer = raw.astrologer || { name: null, avatarUrl: null };

  if (!Array.isArray(raw.sampleDeck) || raw.sampleDeck.length < d.minSize) {
    throw new Error(`config: sampleDeck must hold at least ${d.minSize} cards`);
  }
  const seenTitles = new Set();
  const seenArt = new Set();
  const themeCounts = {};
  raw.sampleDeck.forEach((card, i) => {
    validateCard(card, raw, `sampleDeck[${i}]`);
    if (seenTitles.has(card.title)) throw new Error(`config: duplicate sampleDeck title "${card.title}"`);
    if (seenArt.has(card.art_key)) throw new Error(`config: duplicate sampleDeck art_key "${card.art_key}"`);
    seenTitles.add(card.title);
    seenArt.add(card.art_key);
    themeCounts[card.theme] = (themeCounts[card.theme] || 0) + 1;
    if (themeCounts[card.theme] > d.maxPerTheme) {
      throw new Error(`config: sampleDeck theme "${card.theme}" appears more than ${d.maxPerTheme} times`);
    }
  });

  cached = raw;
  return cached;
}
