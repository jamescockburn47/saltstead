"""The Admiralty Board — ONE admin page for the whole EVO: Moorstead and
Saltstead side by side, plus the machine's own vitals.

:8099 on LAN/Tailscale only (never routed through the tunnel). It holds no
data of its own: every number is fetched live from the two ledgers
(moorstead-dash :8095, saltstead-dash :8097) and every action — mint,
revoke, move room, approve invite — is proxied straight back to the ledger
that owns the file. If a ledger is down, its panel says so and the rest of
the board keeps working.

Deployed at ~/admin/app.py on the EVO (repo copy: Saltstead tools/admin-app.py).
Unit: evo-admin.service.
"""
import json
import re
import shutil
import subprocess
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

MOOR = "http://127.0.0.1:8095"
SALT = "http://127.0.0.1:8097"

app = FastAPI()


# ---------------- the EVO's own vitals ----------------
def _sys_stats():
    out = {}
    try:
        out["load"] = [round(float(x), 2) for x in Path("/proc/loadavg").read_text().split()[:3]]
        out["cores"] = 32
        mi = {}
        for line in Path("/proc/meminfo").read_text().splitlines()[:5]:
            k, v = line.split(":")
            mi[k] = int(v.strip().split()[0])
        out["memUsedGB"] = round((mi["MemTotal"] - mi["MemAvailable"]) / 1048576, 1)
        out["memTotalGB"] = round(mi["MemTotal"] / 1048576, 1)
        du = shutil.disk_usage("/")
        out["diskUsedGB"] = round(du.used / 1e9)
        out["diskTotalGB"] = round(du.total / 1e9)
    except Exception:
        pass
    try:
        smi = subprocess.run(["rocm-smi", "--showmeminfo", "vram", "--showuse", "--showtemp"],
                             capture_output=True, text=True, timeout=6).stdout
        m = re.search(r"VRAM Total Memory \(B\): (\d+)", smi)
        u = re.search(r"VRAM Total Used Memory \(B\): (\d+)", smi)
        g = re.search(r"GPU use \(%\): (\d+)", smi)
        t = re.search(r"Temperature \(Sensor (?:edge|junction)\) \(C\): ([\d.]+)", smi)
        if m and u:
            out["vramUsedGB"] = round(int(u.group(1)) / 2**30, 1)
            out["vramTotalGB"] = round(int(m.group(1)) / 2**30, 1)
        if g:
            out["gpuUse"] = int(g.group(1))
        if t:
            out["gpuTemp"] = float(t.group(1))
    except Exception:
        pass
    return out


def _services():
    """Every unit the two games lean on, plus whatever llama-servers exist."""
    names = ["moorstead-brain", "moorstead-world", "moorstead-dash",
             "saltstead-dash", "evo-admin", "caddy", "sovren-cloudflared"]
    try:
        r = subprocess.run(["systemctl", "list-units", "llama-server*", "--no-legend", "--all"],
                           capture_output=True, text=True, timeout=4)
        for line in r.stdout.splitlines():
            unit = line.split()[0] if line.split() else ""
            if unit.endswith(".service"):
                names.append(unit[:-8])
    except Exception:
        pass
    out = {}
    for name in dict.fromkeys(names):  # ordered de-dupe
        try:
            r = subprocess.run(["systemctl", "is-active", name],
                               capture_output=True, text=True, timeout=4)
            out[name] = r.stdout.strip()
        except Exception:
            out[name] = "?"
    return out


async def _get(client, url):
    try:
        r = await client.get(url)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


# ---------------- the aggregate the page reads ----------------
@app.get("/api/board")
async def board():
    async with httpx.AsyncClient(timeout=6) as c:
        moor_over = await _get(c, MOOR + "/api/overview")
        moor_codes = await _get(c, MOOR + "/api/codes-full")
        salt_codes = await _get(c, SALT + "/api/codes")
        salt_fb = await _get(c, SALT + "/api/feedback")
    return {
        "now": time.time(),
        "sys": _sys_stats(),
        "services": _services(),
        "moor": {
            "up": moor_over is not None,
            "overview": moor_over or {},
            "codes": (moor_codes or {}).get("codes", []),
        },
        "salt": {
            "up": salt_codes is not None,
            "codes": (salt_codes or {}).get("codes", []),
            "feedback": (salt_fb or {}).get("feedback", []),
        },
    }


# ---------------- proxied actions — each ledger keeps its own files ----------------
async def _post(url, body):
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(url, json=body)
            return r.json()
    except Exception as e:
        return {"ok": False, "err": f"ledger unreachable: {e.__class__.__name__}"}


@app.post("/api/salt/mint")
async def salt_mint(req: Request):
    d = await req.json()
    return await _post(SALT + "/api/mint", {"warden": bool(d.get("warden"))})


@app.post("/api/salt/revoke")
async def salt_revoke(req: Request):
    d = await req.json()
    return await _post(SALT + "/api/revoke", {"code": d.get("code", "")})


@app.post("/api/moor/mint")
async def moor_mint(req: Request):
    d = await req.json()
    return await _post(MOOR + "/api/mint", {"room": d.get("room", "moor")})


@app.post("/api/moor/revoke")
async def moor_revoke(req: Request):
    d = await req.json()
    return await _post(MOOR + "/api/revoke", {"code": d.get("code", "")})


@app.post("/api/moor/setroom")
async def moor_setroom(req: Request):
    d = await req.json()
    return await _post(MOOR + "/api/setroom",
                       {"code": d.get("code", ""), "room": d.get("room", "")})


@app.post("/api/moor/invite-respond")
async def moor_invite(req: Request):
    d = await req.json()
    return await _post(MOOR + "/api/request-invite/respond",
                       {"id": d.get("id", ""), "action": d.get("action", ""),
                        "room": d.get("room", "moor")})


PAGE = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Admiralty Board — Moorstead &amp; Saltstead</title>
<style>
:root{
  --bg:#0d1117;--panel:#131a23;--line:#233041;--ink:#cfd8dc;--dim:#77879a;
  --gold:#e0b352;--sea:#5aa7d8;--moor:#9ec27a;--bad:#d87a6a;--warn:#d8b95a;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:'Segoe UI',system-ui,sans-serif;
  margin:0;padding:22px;line-height:1.45}
.wrap{max-width:1180px;margin:0 auto}
h1{color:var(--gold);letter-spacing:3px;font-size:22px;margin:0}
.sub{color:var(--dim);font-style:italic;margin:2px 0 18px;font-size:13px}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;
  padding:10px 16px;min-width:128px;flex:0 1 auto}
.card .v{font-size:21px;font-weight:700;color:#eef3f6;white-space:nowrap}
.card .k{font-size:11px;color:var(--dim);margin-top:1px}
.bar{height:5px;background:#233041;border-radius:3px;margin-top:7px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--moor)}
.bar i.hot{background:var(--bad)}
.ok{color:var(--moor)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.muted{color:var(--dim);font-size:12px}
section.game{border:1px solid var(--line);border-radius:10px;background:var(--panel);
  padding:16px 20px 12px;margin:22px 0}
section.game.salt{border-left:4px solid var(--sea)}
section.game.moor{border-left:4px solid var(--moor)}
section.game>h2{margin:0 0 2px;font-size:17px;letter-spacing:2px}
section.game.salt>h2{color:var(--sea)}
section.game.moor>h2{color:var(--moor)}
section.game .tag{color:var(--dim);font-size:12px;font-style:italic}
details{border-top:1px solid var(--line);margin-top:12px;padding-top:2px}
details>summary{cursor:pointer;color:#aebdc9;font-weight:600;font-size:13px;
  letter-spacing:1px;padding:8px 0;list-style:none;display:flex;align-items:center;gap:8px}
details>summary::before{content:'\25B8';color:var(--dim);transition:transform .12s}
details[open]>summary::before{transform:rotate(90deg)}
summary .count{background:#233041;color:#aebdc9;border-radius:10px;padding:0 9px;
  font-size:11px;font-weight:600}
summary .count.alert{background:#4a2620;color:#e8a294}
table{border-collapse:collapse;width:100%;font-size:13px;margin:4px 0 10px}
th{text-align:left;color:var(--dim);font-weight:600;padding:4px 12px 4px 0;
  border-bottom:1px solid var(--line);font-size:11px;letter-spacing:1px;text-transform:uppercase}
td{padding:5px 12px 5px 0;border-top:1px solid #1a2431;vertical-align:top}
code{color:var(--gold);font-size:14px;font-family:Consolas,monospace}
.warden{color:var(--gold);font-weight:700}
.unclaimed{color:var(--dim);font-style:italic}
button{background:#1a2c40;color:var(--ink);border:1px solid #2c4763;border-radius:5px;
  padding:6px 14px;cursor:pointer;font-size:13px}
button:hover{background:#224061}
button.small{padding:2px 9px;font-size:11px}
button.danger{background:#3a1d1a;border-color:#5c302c}
button.danger:hover{background:#54291f}
button.gold{background:#3a3014;border-color:#6a5726;color:var(--gold)}
button.gold:hover{background:#4c3f1c}
select{background:#1a2c40;color:var(--ink);border:1px solid #2c4763;border-radius:5px;
  padding:5px 8px;font-size:13px}
.mintrow{display:flex;gap:10px;align-items:center;margin:10px 0 4px;flex-wrap:wrap}
#mintbanner{display:none;margin:12px 0;padding:12px 16px;border:1px solid #6a5726;
  border-radius:8px;background:#241f10}
#mintbanner code{font-size:20px}
.fbmsg{white-space:pre-wrap;max-width:640px}
.fbctx{color:var(--dim);font-size:11px;font-family:Consolas,monospace;white-space:pre-wrap}
.down{padding:10px 0;color:var(--bad);font-weight:600}
.natter{background:#0f151d;border:1px solid var(--line);border-radius:6px;
  padding:8px 12px;margin:6px 0;font-size:13px}
.natter b{color:var(--warn)}.you{color:var(--moor)}.them{color:var(--ink)}
.pid{color:var(--dim);font-size:11px;font-family:Consolas,monospace}
.stamp{color:var(--dim);font-size:11px;text-align:right;margin-top:16px}
</style></head><body><div class="wrap">
<h1>THE ADMIRALTY BOARD</h1>
<div class="sub">Moorstead &amp; Saltstead, one ledger office. LAN / Tailscale only — refreshes every 15 s.</div>
<div id="mintbanner"></div>
<div id="content" class="muted">Fetching the ledgers&hellip;</div>
<div class="stamp" id="stamp"></div>
<script>
'use strict';
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = (now, t) => {
  if (!t) return '\u2014';
  const s = now - t;
  if (s < 90) return Math.max(0, Math.round(s)) + 's ago';
  if (s < 5400) return Math.round(s / 60) + 'm ago';
  if (s < 90000) return (s / 3600).toFixed(1) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
};
const bar = (v, max, hotAt) => '<div class="bar"><i' +
  (v / max > (hotAt || 0.85) ? ' class="hot"' : '') +
  ' style="width:' + Math.min(100, 100 * v / max) + '%"></i></div>';

// clipboard on a plain-http origin: the modern API is unavailable, so fall
// back to the old textarea trick
function copyCode(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = 'copied'; setTimeout(() => { btn.textContent = t; }, 1200); };
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done); return; }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) {}
  ta.remove();
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

function minted(label, code) {
  const b = document.getElementById('mintbanner');
  b.style.display = 'block';
  b.innerHTML = 'Freshly minted \u2014 ' + esc(label) + ': <code>' + esc(code) + '</code> ' +
    '<button class="small" onclick="copyCode(\'' + esc(code) + '\', this)">copy</button> ' +
    '<button class="small" style="float:right" onclick="this.parentNode.style.display=\'none\'">dismiss</button>';
}

async function saltMint(warden) {
  const d = await post('/api/salt/mint', { warden });
  if (d.ok) minted(warden ? 'Saltstead WARDEN code' : 'Saltstead invite', d.code);
  else alert(d.err || d.error || 'mint failed');
  refresh();
}
async function saltRevoke(code) {
  if (!confirm('Revoke Saltstead code ' + code + '? The account and its tokens go with it.')) return;
  await post('/api/salt/revoke', { code });
  refresh();
}
async function moorMint() {
  const room = document.getElementById('moorroom').value;
  const d = await post('/api/moor/mint', { room });
  if (d.ok) minted('Moorstead invite (' + d.room + ')', d.code);
  else alert(d.err || 'mint failed');
  refresh();
}
async function moorRevoke(code) {
  if (!confirm('Revoke Moorstead code ' + code + '? The account and its tokens go with it.')) return;
  await post('/api/moor/revoke', { code });
  refresh();
}
async function moorMove(code, cur) {
  const room = prompt('World-room for ' + code + ' (moor / dale / crag / tarn / bairns):', cur);
  if (!room) return;
  const d = await post('/api/moor/setroom', { code, room: room.trim().toLowerCase() });
  if (!d.ok) alert(d.err || 'failed');
  refresh();
}
async function moorInvite(id, action) {
  let room = 'moor';
  if (action === 'approve') {
    room = (prompt('Adult world room (moor, dale, crag, tarn):', 'moor') || '').trim().toLowerCase();
    if (!room) return;
  }
  const d = await post('/api/moor/invite-respond', { id, action, room });
  if (!d.ok) { alert(d.err || 'failed'); return; }
  if (action === 'approve') minted('Moorstead invite (' + d.room + ') for ' + d.email, d.code);
  refresh();
}

// details panels keep their open/closed state across refreshes; on the very
// first render a few sensible ones start open
let firstRender = true;
const DEFAULT_OPEN = ['salt-codes', 'moor-codes', 'evo-services'];
function openSet() {
  return new Set([...document.querySelectorAll('details[id]')].filter(d => d.open).map(d => d.id));
}
function det(id, title, count, inner, alert) {
  return '<details id="' + id + '"><summary>' + esc(title) +
    (count != null ? ' <span class="count' + (alert ? ' alert' : '') + '">' + count + '</span>' : '') +
    '</summary>' + inner + '</details>';
}
function fbTable(now, fb, game) {
  if (!fb.length) return '<div class="muted">Nothing on the ledger.</div>';
  let h = '<table><tr><th>When</th><th>Kind</th><th>From</th><th>Message</th></tr>';
  for (const f of fb) {
    const c = f.context || {};
    const who = [f.name, f.email, f.ip].filter(Boolean).map(esc).join('<br>');
    const ctx = Object.entries(c).filter(([k, v]) => v !== '' && v != null && k !== 'ua')
      .map(([k, v]) => k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join('\n');
    h += '<tr><td class="muted" style="white-space:nowrap">' + ago(now, f.ts) + '</td>' +
      '<td class="' + (f.kind === 'bug' ? 'bad' : 'ok') + '">' + esc(f.kind) + '</td>' +
      '<td class="muted">' + (who || '\u2014') + '</td>' +
      '<td><div class="fbmsg">' + esc(f.message) + '</div>' +
      (ctx || c.ua ? '<details><summary class="muted" style="font-weight:400">context</summary>' +
        '<div class="fbctx">' + esc(ctx) + (c.ua ? '\nua: ' + esc(c.ua) : '') + '</div></details>' : '') +
      '</td></tr>';
  }
  return h + '</table>';
}

function render(D) {
  const open = openSet();
  const now = D.now, s = D.sys || {};
  let h = '';

  // ---- the EVO itself ----
  h += '<div class="cards">';
  if (s.load) h += '<div class="card"><div class="v">' + s.load[0] + '</div><div class="k">CPU load (1m) / ' + s.cores + ' cores</div>' + bar(s.load[0], s.cores) + '</div>';
  if (s.memUsedGB !== undefined) h += '<div class="card"><div class="v">' + s.memUsedGB + ' / ' + s.memTotalGB + ' GB</div><div class="k">system RAM (CPU side of UMA)</div>' + bar(s.memUsedGB, s.memTotalGB) + '</div>';
  if (s.vramUsedGB !== undefined) h += '<div class="card"><div class="v">' + s.vramUsedGB + ' / ' + s.vramTotalGB + ' GB</div><div class="k">GPU pool (models live here)</div>' + bar(s.vramUsedGB, s.vramTotalGB) + '</div>';
  if (s.gpuUse !== undefined) h += '<div class="card"><div class="v">' + s.gpuUse + '%</div><div class="k">GPU busy</div>' + bar(s.gpuUse, 100) + '</div>';
  if (s.gpuTemp !== undefined) h += '<div class="card"><div class="v">' + s.gpuTemp + '&deg;C</div><div class="k">GPU temp</div>' + bar(s.gpuTemp, 100, 0.85) + '</div>';
  if (s.diskUsedGB !== undefined) h += '<div class="card"><div class="v">' + s.diskUsedGB + ' / ' + s.diskTotalGB + ' GB</div><div class="k">disk</div>' + bar(s.diskUsedGB, s.diskTotalGB) + '</div>';
  h += '</div>';

  const svc = D.services || {};
  const downN = Object.values(svc).filter(v => v !== 'active').length;
  let svcH = '<table><tr><th>Unit</th><th>State</th></tr>';
  for (const [k, v] of Object.entries(svc)) svcH += '<tr><td>' + esc(k) + '</td><td class="' + (v === 'active' ? 'ok' : 'bad') + '">' + esc(v) + '</td></tr>';
  svcH += '</table>';
  h += det('evo-services', 'SERVICES', Object.keys(svc).length + (downN ? ' \u2022 ' + downN + ' down' : ''), svcH, downN > 0);

  // ---- SALTSTEAD ----
  const S = D.salt || {};
  h += '<section class="game salt"><h2>SALTSTEAD</h2><div class="tag">the harbourmaster\u2019s ledger \u2014 letters of marque, one per player; the code IS the account</div>';
  if (!S.up) h += '<div class="down">saltstead-dash (:8097) is not answering</div>';
  else {
    const claimed = S.codes.filter(c => c.name).length;
    const wardens = S.codes.filter(c => c.warden).length;
    h += '<div class="cards">' +
      '<div class="card"><div class="v">' + claimed + ' / ' + S.codes.length + '</div><div class="k">codes claimed</div></div>' +
      '<div class="card"><div class="v">' + wardens + '</div><div class="k">warden codes</div></div>' +
      '<div class="card"><div class="v">' + S.feedback.length + '</div><div class="k">recent feedback</div></div></div>';
    h += '<div class="mintrow"><button onclick="saltMint(false)">Mint an invite</button>' +
      '<button class="gold" onclick="saltMint(true)">Mint a WARDEN code</button>' +
      '<span class="muted">wardens get the gold hatband and the Y-key shipyard</span></div>';
    let t = '<table><tr><th>Code</th><th>Standing</th><th>Claimed by</th><th>Last seen</th><th></th></tr>';
    for (const c of S.codes) {
      t += '<tr><td><code>' + esc(c.code) + '</code> <button class="small" onclick="copyCode(\'' + esc(c.code) + '\', this)">copy</button></td>' +
        '<td>' + (c.warden ? '<span class="warden">WARDEN</span>' : 'crew') + '</td>' +
        '<td>' + (c.name ? esc(c.name) : '<span class="unclaimed">unclaimed</span>') + '</td>' +
        '<td class="muted">' + ago(now, c.last) + '</td>' +
        '<td><button class="small danger" onclick="saltRevoke(\'' + esc(c.code) + '\')">revoke</button></td></tr>';
    }
    t += '</table>';
    h += det('salt-codes', 'INVITE CODES', S.codes.length, t);
    h += det('salt-fb', 'FEEDBACK & BUGS', S.feedback.length, fbTable(now, S.feedback, 'salt'),
      S.feedback.some(f => f.kind === 'bug' && now - f.ts < 86400));
  }
  h += '</section>';

  // ---- MOORSTEAD ----
  const M = D.moor || {}, O = M.overview || {};
  h += '<section class="game moor"><h2>MOORSTEAD</h2><div class="tag">t\u2019 parish ledger \u2014 players, natters an\u2019 t\u2019 brain</div>';
  if (!M.up) h += '<div class="down">moorstead-dash (:8095) is not answering</div>';
  else {
    const st = O.stats || {}, live = O.live || [], t9 = O.talk || {};
    h += '<div class="cards">' +
      '<div class="card"><div class="v">' + live.length + '</div><div class="k">on t\u2019 moor now</div></div>' +
      '<div class="card"><div class="v">' + (st.today ?? 0) + '</div><div class="k">active today</div></div>' +
      '<div class="card"><div class="v">' + (st.week ?? 0) + '</div><div class="k">active last 7 days</div></div>' +
      '<div class="card"><div class="v">' + (st.total ?? 0) + '</div><div class="k">browsers ever seen</div></div>' +
      '<div class="card"><div class="v ' + ((O.llm || {}).status === 'ok' ? 'ok' : 'bad') + '">' + ((O.llm || {}).status === 'ok' ? 'UP' : 'DOWN') + '</div><div class="k">villager brain (LLM)</div></div>' +
      '<div class="card"><div class="v">' + (t9.talksLastHour ?? 0) + '</div><div class="k">chats last hour' + (t9.p95 ? ' \u00b7 p95 ' + t9.p95 + 's' : '') + '</div></div>' +
      '</div>';

    // codes: the full mint/retrieve/revoke desk
    h += '<div class="mintrow"><select id="moorroom"><option>moor</option><option>dale</option>' +
      '<option>crag</option><option>tarn</option><option>bairns</option></select>' +
      '<button onclick="moorMint()">Mint an invite</button>' +
      '<span class="muted">moor/dale/crag/tarn are grown-up rooms; bairns is the kids\u2019 world</span></div>';
    let t = '<table><tr><th>Code</th><th>Room</th><th>Claimed by</th><th>Last seen</th><th></th></tr>';
    for (const c of (M.codes || [])) {
      t += '<tr><td><code>' + esc(c.code) + '</code> <button class="small" onclick="copyCode(\'' + esc(c.code) + '\', this)">copy</button></td>' +
        '<td><b>' + esc(c.room) + '</b></td>' +
        '<td>' + (c.name ? esc(c.name) : '<span class="unclaimed">unclaimed</span>') + '</td>' +
        '<td class="muted">' + ago(now, c.last) + '</td>' +
        '<td><button class="small" onclick="moorMove(\'' + esc(c.code) + '\',\'' + esc(c.room) + '\')">move</button> ' +
        '<button class="small danger" onclick="moorRevoke(\'' + esc(c.code) + '\')">revoke</button></td></tr>';
    }
    t += '</table>';
    h += det('moor-codes', 'INVITE CODES', (M.codes || []).length, t);

    // invite requests
    const pend = (O.inviteRequests || {}).pending || [];
    const dec = (O.inviteRequests || {}).recent || [];
    let rq = '';
    if (pend.length) {
      rq += '<table><tr><th>When</th><th>Email</th><th>Name</th><th>Note</th><th>IP</th><th></th></tr>';
      for (const r of pend) rq += '<tr><td class="muted">' + ago(now, r.ts) + '</td><td>' + esc(r.email) + '</td><td>' + esc(r.name || '') + '</td><td>' + esc(r.note || '') + '</td><td class="muted">' + esc(r.ip) + '</td>' +
        '<td><button class="small" onclick="moorInvite(\'' + esc(r.id) + '\',\'approve\')">approve</button> <button class="small danger" onclick="moorInvite(\'' + esc(r.id) + '\',\'reject\')">reject</button></td></tr>';
      rq += '</table>';
    } else rq += '<div class="muted">None waiting.</div>';
    if (dec.length) {
      rq += '<div class="muted" style="margin-top:6px">Recent decisions</div><table><tr><th>When</th><th>Email</th><th>Status</th><th>Code</th><th>Room</th></tr>';
      for (const r of dec) rq += '<tr><td class="muted">' + ago(now, r.approvedTs || r.closedTs || r.ts) + '</td><td>' + esc(r.email) + '</td><td>' + esc(r.status) + '</td><td class="pid">' + esc(r.code || '') + '</td><td>' + esc(r.room || '') + '</td></tr>';
      rq += '</table>';
    }
    h += det('moor-req', 'INVITE REQUESTS', pend.length + ' waiting', rq, pend.length > 0);

    h += det('moor-fb', 'FEEDBACK & BUGS', (O.feedback || []).length, fbTable(now, O.feedback || [], 'moor'),
      (O.feedback || []).some(f => f.kind === 'bug' && now - f.ts < 86400));

    // who's out, who's been
    let lv = '';
    if (!live.length) lv = '<div class="muted">Nob\u2019dy out just now.</div>';
    else {
      lv = '<table><tr><th>Name</th><th>Where</th><th>Day</th><th>Standing</th><th>Croft</th><th>Ventures</th><th>Seen</th></tr>';
      for (const x of live) lv += '<tr><td class="ok"><b>' + esc(x.name || '(nameless)') + '</b></td><td>' + esc(x.loc) + '</td><td>' + x.day + '</td><td>' + esc(x.standing) + '</td><td>' + x.croft + '/4</td><td>' + x.quests + '</td><td class="muted">' + ago(now, x.ts) + '</td></tr>';
      lv += '</table>';
    }
    h += det('moor-live', 'ON T\u2019 MOOR NOW', live.length, lv, false);

    const ps = Object.entries(O.players || {}).sort((a, b) =>
      ((b[1].visitDays || []).length - (a[1].visitDays || []).length) || (b[1].last - a[1].last));
    let pl = '<table><tr><th>Name(s)</th><th>Days</th><th>Visits</th><th>Minutes</th><th>Worlds</th><th>Last IP</th><th>Last seen</th><th>id</th></tr>';
    for (const [pid, p] of ps) pl += '<tr><td>' + esc((p.names || []).join(', ') || '(nameless)') + '</td><td>' + (p.visitDays || []).length + '</td><td>' + (p.visits || 0) + '</td><td>' + (p.minutes || 0) + '</td><td>' + Object.keys(p.worlds || {}).length + '</td><td class="muted">' + esc(p.lastIp || '') + '</td><td class="muted">' + ago(now, p.last) + '</td><td class="pid">' + esc(pid.slice(0, 12)) + '</td></tr>';
    pl += '</table>';
    h += det('moor-players', 'ALL PLAYERS & BROWSERS', ps.length, pl);

    let nat = '';
    for (const c of (O.conversations || []).slice(0, 8)) {
      nat += '<div class="natter"><span class="pid">' + esc(c.pid.slice(0, 18)) + '</span> \u2014 <span class="muted">' + ago(now, c.mtime) + '</span>';
      for (const ch of (c.chars || [])) {
        nat += '<div style="margin-top:6px"><b>' + esc((ch.playerName ? ch.playerName + ' \u2194 ' : '') + ch.char.replace('char_', 'villager ')) + '</b> <span class="muted">(trust ' + ch.trust + ')</span>';
        if (ch.summary) nat += '<div class="muted" style="font-style:italic">remembers: ' + esc(ch.summary) + '</div>';
        for (const m of (ch.last || [])) nat += '<div class="' + (m.role === 'user' ? 'you' : 'them') + '">' + (m.role === 'user' ? '\u25B8 ' : '\u25C2 ') + esc(m.text) + '</div>';
        nat += '</div>';
      }
      nat += '</div>';
    }
    h += det('moor-nat', 'LATEST NATTERS', (O.conversations || []).length, nat || '<div class="muted">Quiet on t\u2019 moor.</div>');

    let tr = '<table><tr><th>When</th><th>Event</th><th>Name</th><th>IP</th><th>Browser id</th></tr>';
    for (const v of (O.recentVisits || [])) tr += '<tr><td class="muted">' + ago(now, v.ts) + '</td><td>' + esc(v.event) + '</td><td>' + esc(v.name || '(anon)') + '</td><td class="muted">' + esc(v.ip) + '</td><td class="pid">' + esc((v.pid || '').slice(0, 12)) + '</td></tr>';
    tr += '</table><div class="muted">Backend traffic by IP (Caddy log)</div><table><tr><th>IP</th><th>Requests</th><th>First</th><th>Last</th></tr>';
    for (const v of (O.visitors || []).slice(0, 30)) tr += '<tr><td>' + esc(v.ip) + '</td><td>' + v.n + '</td><td class="muted">' + ago(now, v.first) + '</td><td class="muted">' + ago(now, v.last) + '</td></tr>';
    tr += '</table>';
    h += det('moor-traffic', 'SITE ACTIVITY & TRAFFIC', (O.recentVisits || []).length, tr);
  }
  h += '</section>';

  document.getElementById('content').innerHTML = h;
  const toOpen = firstRender ? new Set(DEFAULT_OPEN) : open;
  for (const id of toOpen) { const el = document.getElementById(id); if (el) el.open = true; }
  firstRender = false;
  document.getElementById('stamp').textContent = 'refreshed ' + new Date().toLocaleTimeString();
}

async function refresh() {
  try {
    const D = await (await fetch('/api/board')).json();
    render(D);
  } catch (e) {
    document.getElementById('content').innerHTML = '<div class="down">The board cannot reach its own back end: ' + esc(e.message) + '</div>';
  }
}
refresh();
setInterval(refresh, 15000);
</script></div></body></html>"""


@app.get("/", response_class=HTMLResponse)
def index():
    return PAGE
