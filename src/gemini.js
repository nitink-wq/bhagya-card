// Daily Bhagya Card deck generation via Google Gemini (REST, no SDK).
//
// Entirely optional: when GEMINI_API_KEY is unset, or the call fails, or the
// output fails the lint, the pool falls back (yesterday's deck, then the
// config sampleDeck) — stale beats broken; a scary card is an incident.
import { validateCard } from './config.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = 90_000;

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const SCHEMA_EXAMPLE = `{
  "date": "YYYY-MM-DD",
  "deck": [
    {
      "art_key": "the_sun",
      "title": "The Radiant Sun",
      "theme": "self",
      "fortune": ["line 1", "line 2"],
      "finding": "high-level insight, 1-2 sentences",
      "consult_nudge": "ties to THIS card's finding, points to kundli",
      "prefill_question": "first person, must name the title"
    }
  ]
}`;

function buildPrompt(cfg, day, recentTitles) {
  const d = cfg.deck;
  const catalogue = d.cards
    .map((c) => `  ${c.art_key} | "${c.title}" | ${c.theme}`)
    .join('\n');
  // With size == catalogue length the whole deck ships daily and the model
  // only writes words; with a smaller size it also chooses which cards.
  const picksAll = d.size >= d.cards.length;
  const recentLine = recentTitles.length
    ? `\nCards used in the last ${d.recentTitleDays} days (prefer different ones): ${recentTitles.join(', ')}`
    : '';
  return `SYSTEM:
You write the daily words for AstroLokal's Fortune Cards — a fixed deck of
${d.cards.length} illustrated cards read by tier-2/3 Indian users.
Output strict JSON only, no markdown.

THE DECK IS FIXED. ${picksAll
    ? 'You write fresh words for every card in the catalogue below.'
    : 'You choose WHICH cards are in today\'s deck and write their words.'}
You never invent a card, a name, a theme or an art key. Copy art_key,
title and theme verbatim from this catalogue:
${catalogue}

REGISTER: Simple everyday English, class-8 reading level — the kind of English a
tier-2/3 Indian reader follows easily. Short words, short sentences, no idioms
that need a dictionary. Voice of a warm elder telling you what a symbol means —
a little poetic, never spooky, never preachy. Familiar Indian words that are used
in Indian English are welcome (kalash, rangoli, diya, toran).
NEVER write the words "kundli" or "pandit" — both are on the banned list and any
card containing them is rejected.

HARD RULES:
- The words must fit the card's own symbol — The Radiant Sun speaks of light and
  returning energy, The Golden Empress of quiet abundance and money growing.
  Never write words that would sit oddly under that illustration.
- Call these "fortune cards". Never use the word tarot, and never use tarot
  vocabulary (arcana, spread, reversed, suits, querent).
- Every card is positive or neutral. A card may name a tension (a choice, a wait,
  a knot) but NEVER a doom or a loss.
- FINDINGS ARE HIGH-LEVEL ONLY. Name a direction or a theme — never a detailed or
  specific prediction. The finding must leave one open question that only a
  personal reading with an astrologer can answer. Specifics defeat the purpose.
- Every card must carry one soft time element ("in the coming days", "this week").
- fortune lines: no commands, no absolutes, no fear. finding: at most one gentle
  caution framed as care ("with care"), never as a warning ("beware" is banned).
- consult_nudge: ONE open question drawn from THIS card's finding, then the words
  "Ask and know." Shape it exactly like these:
    "Which new door is truly yours? Ask and know."
    "When will the right moment to step forward arrive? Ask and know."
  The question must be grammatical with normal question word order.
  Never a generic "talk to an astrologer", and never name a kundli or a pandit.
- NEVER use an em dash or an en dash anywhere. Use a full stop or a comma
  instead. Cards containing one are rejected.
- prefill_question: the user's own first-person spoken voice, names the card title,
  asks what it means for them. Must read like a real person typing to an astrologer.
- art_key, title and theme are copied from the catalogue above, exactly.
- No theme more than ${d.maxPerTheme} times, so today's deck stays varied.
- The two fortune lines are the whole insight the user reads. Make each a full,
  unhurried sentence of roughly 11-14 words — not a clipped headline.
- Field limits: each fortune line <= 115 chars (exactly 2 lines);
  finding <= 140 chars; consult_nudge <= 110 chars; prefill_question <= 120 chars.
- Each catalogue card appears at most once.
- Standard AstroLokal banned list: no death/illness/accident/legal/divorce/
  pregnancy themes; no absolutes ("zaroor", "pakka", "100%"); no fear words.

USER:
${picksAll
    ? `Write today's words for all ${d.cards.length} catalogue cards for ${day}:`
    : `Pick ${d.size} cards from the catalogue for ${day} and write their words:`}
${SCHEMA_EXAMPLE}
No theme more than ${d.maxPerTheme} times.${recentLine}
Return one JSON object. Nothing else.`;
}

// Validate hard — never trust the model. Throws on any problem; the caller
// (pool.js) decides the fallback.
function validateDeck(parsed, cfg, recentTitles) {
  const d = cfg.deck;
  const deck = parsed?.deck;
  if (!Array.isArray(deck) || deck.length < d.minSize || deck.length > d.maxSize) {
    throw new Error(`deck must hold ${d.minSize}..${d.maxSize} cards, got ${Array.isArray(deck) ? deck.length : 'none'}`);
  }
  // Note: recent titles are a prompt *preference*, not a hard reject. The
  // catalogue is fixed at 20 cards and a deck is 15 of them, so demanding no
  // overlap with the last 3 days would be unsatisfiable. Freshness comes from
  // the words, which are rewritten every day.
  const artKeys = new Set();
  const themeCounts = {};
  return deck.map((card, i) => {
    validateCard(card, cfg, `gemini[${i}]`); // identity, limits, banned-word lint
    if (artKeys.has(card.art_key)) throw new Error(`duplicate art_key "${card.art_key}"`);
    artKeys.add(card.art_key);
    themeCounts[card.theme] = (themeCounts[card.theme] || 0) + 1;
    if (themeCounts[card.theme] > d.maxPerTheme) {
      throw new Error(`theme "${card.theme}" appears more than ${d.maxPerTheme} times`);
    }
    return {
      title: card.title.trim(),
      art_key: card.art_key,
      theme: card.theme,
      fortune: card.fortune.map((l) => l.trim()),
      finding: card.finding.trim(),
      consult_nudge: card.consult_nudge.trim(),
      prefill_question: card.prefill_question.trim(),
    };
  });
}

export async function generateDeckWithGemini(cfg, day, recentTitles) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(cfg, day, recentTitles) }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return validateDeck(JSON.parse(text), cfg, recentTitles);
}
