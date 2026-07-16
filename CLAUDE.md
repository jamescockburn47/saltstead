# Saltstead — working instructions

Procedural sea-rover game on a scaled real-world Earth (Vite + Three.js) — sibling to
Moorstead (`C:\Users\James\Desktop\Moorcraft`), same identity: **procedural-only, zero
assets, browser-first, deterministic, verify-gated**. Public client:
**www.saltstead.app** (Vercel project `saltstead`, GitHub `jamescockburn47/saltstead`).

## Start here

- **[docs/DESIGN.md](docs/DESIGN.md)** — game identity, era-ladder progression, world
  model (1:250 land / gait-compressed ocean), phase plan, named risks.
- `src/` modules are small and single-purpose; pure logic modules (waves, sailing,
 shipphysics, shipframe, foam, earth, terraingen, skymath, lightrig, woodgrain,
 legends, legendfx, combat, monsters, merchants, plunder, treasure, fleet, port,
 ports, shipyard, noise) have **no THREE/DOM imports** and each is guarded by a
 `scripts/verify-*.mjs` check.
- `src/earthdata.js` is **generated** by `scripts/build-earthdata.mjs` from Natural
  Earth (coastlines, rivers, mountain ranges) — never edit by hand.

## Build & verify

- `npm run verify` — the headless gate (28 checks). **Must be green before deploy.**
  Add a verify script with every feature; prefer testing pure modules headlessly over
  eyeballing.
- Dev: `npm run dev` (port 5173). `window.saltstead` is the live Game handle
  (`.ship`, `.cam`, `.aground`, `.coastDist`, `.dayStart`, `.ocean.uniforms`).

## Deploy

Use **`npm run deploy`** (`scripts/deploy.mjs`, inherited from Moorstead) — not bare
`vercel`. Gates on clean tree / on-main / pushed, runs verify + build, patch-bumps,
commits, pushes, ships to Vercel. Domains: saltstead.app → www.saltstead.app.

## The EVO (home server) — hardware facts, verified 2026-07-16

The EVO X2 is an **AMD Ryzen AI MAX+ 395 (Radeon 8060S) with 128 GB of UNIFIED
memory (UMA)**, carved as ~96 GiB GPU + ~32 GiB system. **`free -h` only shows the
32 GiB CPU side — do not conclude the box is out of RAM from it.** Check the GPU pool
with `rocm-smi --showmeminfo vram` (as of writing: ~46 GiB of 96 used by four
llama-servers, so ~50 GiB model headroom). CPU load is negligible (32 cores, idle).

Reachable via `ssh evo-tailscale` (anywhere) or `ssh evo-wifi` (LAN); passwordless
`sudo -n`. Verify server-side questions there, don't disclaim them. Moorstead's relay
(`~/moorstead/worldsvc/`), brain, and dashboard live there; Saltstead's future relay
will too (CSP already whitelists `saltstead.sovren.xyz`). Crew-NPC brains can share
`llama-server-moorstead` (Gemma, `--parallel 32`) or afford their own model — the
UMA headroom allows either.

### Saltstead's harbourmaster ledger (invite codes + warden)

`~/saltstead/dash/app.py` on the EVO (repo copy: `tools/dash-app.py`), systemd unit
`saltstead-dash` on **:8097**. Mint/revoke codes and read player feedback on the
ledger UI at `http://evo:8097/` — **LAN/Tailscale only**. Two endpoints are public:
`POST /auth/claim` (invites) and `POST /feedback` (in-game feedback tool +
`reportQuiet` telemetry, `src/feedback.js`): Vercel rewrites `/dash/*` →
`saltstead.sovren.xyz` (Cloudflare tunnel) → Caddy `:8091` (allowlist) → :8097.
Caddy's global `trusted_proxies private_ranges` keeps the real player IP in
x-forwarded-for (the feedback rate cap is per-IP, 8/day). Codes minted with
`warden: true` grant warden standing (gold hatband + epaulettes on the captain,
`isWarden(auth)` in `identity.js`); the claim response carries `warden` into the
auth blob. Caddy backups: `Caddyfile.bak-20260716-saltstead`, `-feedback`; tunnel
backup: `config.yml.bak-20260716-saltstead`.

## Setting

Alt-history "piracy never died": pirate-age start, ship tiers climb through eras.
Highlight legends (Welsh dragons, Bermuda Triangle, Kraken…) live in `src/legends.js`
— append-only data table.
