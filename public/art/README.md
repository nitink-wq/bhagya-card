# Card illustrations

Drop the 12 final illustrations in this folder with **exactly** these names
(the config's `art.baseUrl: "art"` makes the app serve them from here):

| file | card |
|---|---|
| `the_sun.png` | The Radiant Sun |
| `the_star.png` | The Guiding Star |
| `the_wheel.png` | The Turning Wheel |
| `the_chariot.png` | The Golden Chariot |
| `the_world.png` | The Whole World |
| `the_open_road.png` | The Open Road |
| `the_empress.png` | The Golden Empress |
| `the_full_home.png` | The Full Home |
| `the_festive_gate.png` | The Festive Gate |
| `the_emperor.png` | The Steady Emperor |
| `the_skilled_hand.png` | The Skilled Hand |
| `the_three_cups.png` | The Three Cups |

Source images are 1024×1536 (2:3); the client shows them full-bleed at
204×316 inside the gold frame. If a file is missing the client falls back to
its inline placeholder emblem, so a partial upload never breaks the page —
but ship all 12 together so the deck looks consistent.

To serve from a CDN instead, upload the same files there and change
`art.baseUrl` in `config/experiment.config.json`.
