# Card illustrations

The 12 final illustrations, served by the app itself
(`art.baseUrl: "art"` in `config/experiment.config.json` makes this folder
the source; `art.ext: "jpg"` picks the extension).

| file | card | theme |
|---|---|---|
| `the_sun.jpg` | The Radiant Sun | self |
| `the_star.jpg` | The Guiding Star | self |
| `the_wheel.jpg` | The Turning Wheel | journey |
| `the_chariot.jpg` | The Golden Chariot | journey |
| `the_world.jpg` | The Whole World | journey |
| `the_open_road.jpg` | The Open Road | journey |
| `the_empress.jpg` | The Golden Empress | money |
| `the_full_home.jpg` | The Full Home | home |
| `the_festive_gate.jpg` | The Festive Gate | home |
| `the_emperor.jpg` | The Steady Emperor | work |
| `the_skilled_hand.jpg` | The Skilled Hand | work |
| `the_three_cups.jpg` | The Three Cups | relationships |

## Encoding

Shipped as **704 × 1056 JPEG, quality 82** (~285–410 KB each), resized from
the 1024 × 1536 PNG masters (~3 MB each). The card renders at 204 × 316 CSS
px, so 704 px wide still covers a 3× display with headroom, and JPEG is the
right format for painterly art — the PNG masters were ~10× larger for no
visible gain at this size.

Only **one** image ever loads per user per day (they draw one card), so the
deck's size on disk is never a page-weight cost.

Regenerate from the masters with:

```bash
for f in /path/to/masters/*.png; do
  sips -s format jpeg -s formatOptions 82 -Z 1056 "$f" \
    --out "public/art/$(basename "$f" .png).jpg"
done
```

## Astrologer portrait

`astrologer.jpg` (256 x 256 JPEG q85, ~14 KB) is the face beside the consult
nudge, set via `astrologer.avatarUrl` in the config. It ships **pre-cropped
square to the head** — the 1254 x 1254 master is mostly shoulders, which
would leave the face tiny in a 48 px circle. Recrop from a new master with:

```python
from PIL import Image
im = Image.open('master.png').convert('RGB')
W, H = im.size
side, top = 820, 70                      # tune so the eyes land ~40% down
left = (W - side) // 2
im.crop((left, top, left + side, top + side)).resize((256, 256), Image.LANCZOS) \
  .save('public/art/astrologer.jpg', 'JPEG', quality=85, optimize=True, progressive=True)
```

If it 404s the client removes the `<img>` and the avatar degrades to a plain
gold disc — never a broken-image icon.

## Notes

- These illustrations carry **their own painted border**, so the client drops
  its gold-foil frame in photo mode (`.fcard.photo`) — otherwise it reads as a
  frame inside a frame.
- If a file is missing the client falls back to its inline placeholder emblem,
  so a partial upload never breaks the page — but ship all 12 together so the
  deck looks consistent.
- A card's `art_key` is permanent. To re-illustrate a card, replace the file
  at the same name.
- To serve from a CDN instead, upload the same files there and change
  `art.baseUrl`.
