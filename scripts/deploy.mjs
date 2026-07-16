// scripts/deploy.mjs — the one safe way to ship Saltstead to production.
// Inherited from Moorstead's deploy gate (scripts/deploy.mjs there).
//
// Gate (warns; needs --force to override): refuses to deploy if the working
// tree is dirty, you're not on main, or main isn't pushed. Then, in order:
//   verify  ->  build  ->  bump version + commit  ->  push  ->  vercel --prod
//
// Usage:
//   npm run deploy                 patch release (0.1.0 -> 0.1.1)
//   npm run deploy -- --minor      minor release
//   npm run deploy -- --major      major release
//   npm run deploy -- --no-bump    deploy without touching the version
//   npm run deploy -- --force      proceed despite gate warnings
//
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const FORCE = has('--force');

const sh = (cmd) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const die = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

// ---- 1. preconditions (warn; --force overrides) ----------------------------
const branch = sh('git rev-parse --abbrev-ref HEAD');
const warnings = [];
if (branch !== 'main') warnings.push(`not on main (on '${branch}') — production ships from main`);
const dirty = sh('git status --porcelain');
if (dirty) warnings.push(`working tree is dirty (uncommitted changes won't be in the deploy):\n     ${dirty.split('\n').join('\n     ')}`);
try {
  sh('git fetch origin --quiet');
  const ahead = sh(`git rev-list --count origin/${branch}..HEAD`);
  const behind = sh(`git rev-list --count HEAD..origin/${branch}`);
  if (ahead !== '0') warnings.push(`${ahead} commit(s) not pushed to origin/${branch}`);
  if (behind !== '0') warnings.push(`${behind} commit(s) on origin/${branch} you don't have — pull first`);
} catch {
  warnings.push(`couldn't compare with origin/${branch} (no upstream yet?)`);
}

if (warnings.length) {
  console.error('\n⚠  Deploy gate warnings:');
  for (const w of warnings) console.error('   • ' + w);
  if (!FORCE) die('Refusing to deploy. Fix the above, or re-run with --force to override.');
  console.error('\n  --force given — proceeding anyway.');
}

// ---- 2. verify + build BEFORE mutating anything ----------------------------
console.log('\n▶ npm run verify');
try { run('npm run verify'); } catch { die('verify failed — not deploying.'); }
console.log('\n▶ npm run build');
try { run('npm run build'); } catch { die('build failed — not deploying.'); }

// ---- 3. version bump --------------------------------------------------------
let newVersion = null;
if (!has('--no-bump')) {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const text = readFileSync(pkgUrl, 'utf8');
  const m = text.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/);
  if (!m) die('could not find a semver "version" in package.json');
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (has('--major')) { maj++; min = 0; pat = 0; }
  else if (has('--minor')) { min++; pat = 0; }
  else pat++;
  newVersion = `${maj}.${min}.${pat}`;
  writeFileSync(pkgUrl, text.replace(m[0], `"version": "${newVersion}"`));
  console.log(`\n▶ version ${m[1]}.${m[2]}.${m[3]} → ${newVersion}`);
  run(`git commit -m "chore(release): v${newVersion}" -- package.json`);
}

// ---- 4. push, then deploy ----------------------------------------------------
console.log(`\n▶ git push origin ${branch}`);
try { run(`git push origin ${branch}`); } catch { die('push failed — fix and re-run (nothing deployed yet).'); }
console.log('\n▶ vercel --prod');
try { run('vercel --prod --yes'); } catch { die('vercel deploy failed (the release commit is already pushed).'); }

console.log(`\n✓ Deployed${newVersion ? ' v' + newVersion : ''} to production — https://www.saltstead.app`);
