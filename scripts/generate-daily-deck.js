// Manual/CLI entry for publishing a day's deck. The server publishes the
// deck itself (boot + every 5 min + on-demand), so this script is only
// needed for backfills and --force replacements.
//
//   npm run deck:generate                 # today (IST, 06:00 cutover), no-op if it exists
//   npm run deck:generate -- --day=2026-07-30
//   npm run deck:generate -- --force      # replace, refused once users drew
import { loadConfig } from '../src/config.js';
import { todayKey } from '../src/day.js';
import { publishDeck } from '../src/pool.js';
import { closePool } from '../src/db.js';

const force = process.argv.includes('--force');
const dayArg = process.argv.find((a) => a.startsWith('--day='));
const day = dayArg ? dayArg.split('=')[1] : todayKey();

try {
  const result = await publishDeck(loadConfig(), day, { force });
  if (!result.published) {
    console.log(`[deck] deck for ${day} already exists — nothing to do`);
  }
} catch (err) {
  console.error('[deck] failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
