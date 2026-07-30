# Bhagya Card — illustration brief (for an image-generation model)

## Technical spec (fixed — every card identical)

| Property | Value |
|---|---|
| Count | 20 images, one per `art_key` |
| Size | **1024 × 1536 px** (2:3 portrait) |
| Format | PNG (or JPG q90+), **sRGB**, no transparency — full-bleed |
| Filename | exactly `{art_key}.png` (e.g. `the_sun.png`) |
| Safe area | keep the subject inside the **central 80%** — the app rounds corners (r≈65 px at this scale) and cover-crops a few px on some screens |
| Display size | ~204 × 316 CSS px inside a gold-foil frame on a warm cream page |

The app renders the card's **name below the card** in its own font, so:

> **NO text, lettering, words or numbers anywhere in the image.**
> Decorative banners/cartouches may appear but must be **empty**.

## Style block (prepend to every prompt, verbatim)

> A premium fortune-card illustration in Indian miniature-painting style
> blended with modern flat vector art. Deep indigo-navy night background
> (#1B1F4B to #2A2F6B) scattered with tiny gold stars and dots. The central
> subject is luminous metallic gold (#FFBF6E, #E8A33F, #C57C22) with warm
> saffron-orange accents (#F45722) and soft cream highlights (#FFF7E8),
> glowing gently against the dark sky. Thin ornate gold border with subtle
> Indian motifs (paisley, lotus, diya flames) framing the card, symmetrical
> composition, one single central emblem, readable even as a small thumbnail.
> Auspicious, warm, hopeful mood — never dark, spooky or occult. No skulls,
> no weapons, no religious deity depictions, no human faces in detail,
> no text, no letters, no numbers, no watermark. Elegant, festive,
> Diwali-card level of craft. Full-bleed, 2:3 portrait.

Consistency rules across the set:
- Same background treatment, same border style, same lighting on all 20 —
  they must read as one deck.
- One clear central emblem per card; supporting elements small and few.
- If the model supports a style/seed reference, generate `the_sun` first and
  reference it for the other 19.

## The 20 cards (append one line to the style block)

| # | file | Card | Subject line for the generator |
|---|---|---|---|
| I | `the_sun.png` | The Radiant Sun | A magnificent golden sun with ornate rays and a serene glow at the centre of the sky, small lotus flowers at the base. |
| II | `the_star.png` | The Guiding Star | One large radiant eight-pointed golden star low over calm night water, its reflection a shimmering gold path. |
| III | `the_strength.png` | The Gentle Strength | A great banyan tree with golden leaves and graceful aerial roots, glowing softly, tiny diyas at its base. |
| IV | `the_lantern.png` | The Lantern Bearer | A single ornate hanging brass lantern with a bright warm flame inside, casting a circle of golden light into the dark. |
| V | `the_wheel.png` | The Turning Wheel | A large ornate golden chakra wheel with detailed spokes, mid-turn, sparks of gold light around its rim. |
| VI | `the_chariot.png` | The Golden Chariot | A decorated golden chariot with two spoked wheels moving forward along a starlit road, festive pennant flying. |
| VII | `the_world.png` | The Whole World | A glowing golden globe encircled by a ring of small stars and a lotus-leaf wreath. |
| VIII | `the_open_road.png` | The Open Road | A golden path winding from the foreground through gentle hills toward a bright horizon glow under the night sky. |
| IX | `the_empress.png` | The Golden Empress | An ornate empty golden throne draped with marigold garlands, soft radiance behind it, lotus motifs on the armrests. |
| X | `the_full_home.png` | The Full Home | A warm traditional Indian home with glowing windows, diyas on the threshold, rangoli at the doorstep, under stars. |
| XI | `the_festive_gate.png` | The Festive Gate | A decorated toran gateway of mango leaves and marigold strings, golden light pouring through the open arch. |
| XII | `the_emperor.png` | The Steady Emperor | A stately golden crown resting on a carved stone pedestal, steady flame on either side, calm and solid. |
| XIII | `the_skilled_hand.png` | The Skilled Hand | An open right hand in gold, palm up, a small radiant flame or tool of craft floating above it, henna-like patterns on the wrist. |
| XIV | `the_scales.png` | The Even Scales | A perfectly balanced ornate golden balance scale, two pans level, small glowing gems in each pan. |
| XV | `the_lovers.png` | The Two Hearts | Two golden birds (sarus cranes) facing each other, necks forming a heart, one shared star above them. |
| XVI | `the_three_cups.png` | The Three Cups | Three raised ornate golden goblets touching in a toast, drops of golden light rising like celebration sparks. |
| XVII | `the_teacher.png` | The Wise Teacher | An open ancient book on a carved wooden stand, golden light rising from its pages like gentle flames, a small diya beside it. |
| XVIII | `the_golden_coin.png` | The Golden Coin | One large embossed golden coin with a lotus emblem, standing upright, radiating warm light, small coins at its base. |
| XIX | `the_wish_cup.png` | The Wish Cup | A single ornate golden cup catching a falling star as a stream of golden light, ripples of light in the cup. |
| XX | `the_harvest.png` | The Patient Harvest | Golden sheaves of ripe wheat tied with a red thread, standing in a moonlit field, fireflies of golden light around them. |

## Negative prompt (if the tool takes one)

> text, letters, numbers, typography, watermark, signature, skull, bones,
> weapons, blood, demons, scary, horror, human face close-up, deity,
> religious idol, photorealistic, 3D render, neon, low-res, blurry,
> extra borders beyond the card edge, white margin

## After generation

1. QA each image at **~200 px wide** — the emblem must still read instantly.
2. Name files exactly `{art_key}.png`, upload all 20 to any static host/CDN
   (e.g. `https://cdn.astrolokal.com/bhagya-card/art/`).
3. Set in `config/experiment.config.json`:
   ```json
   "art": { "baseUrl": "https://cdn.astrolokal.com/bhagya-card/art", "ext": "png" }
   ```
   No code change — the client loads them full-bleed and drops its own
   placeholder frame furniture automatically.

A card's `art_key` is permanent: one illustration per key, forever. If a card
is ever re-illustrated, replace the file at the same name.
