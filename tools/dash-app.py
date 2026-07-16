"""Saltstead harbourmaster's ledger — invite codes, accounts, and login tokens.

:8097 on LAN/Tailscale only. The Cloudflare tunnel (saltstead.sovren.xyz ->
Caddy :8091) routes exactly one public endpoint here: POST /auth/claim.
The ledger UI and the mint/revoke endpoints never leave the house.

Deployed at ~/saltstead/dash/app.py on the EVO (repo copy: tools/dash-app.py).
"""
import hashlib
import json
import re
import secrets
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

DASH = Path("/home/james/saltstead/dash")
DASH.mkdir(parents=True, exist_ok=True)
CODES_F = DASH / "codes.json"
ACCOUNTS_F = DASH / "accounts.json"
TOKENS_F = DASH / "tokens.json"
VISITS_F = DASH / "visits.json"

PID_RE = re.compile(r"^[a-z0-9-]{4,40}$")
CODE_RE = re.compile(r"^[a-z]+-[a-z]+-\d{2}$")

# nautical mint words — the code IS the account key, so keep them memorable
MINT_W1 = ("brine", "gull", "kraken", "spume", "reef", "squall", "fathom", "corsair",
           "marlin", "tern", "spray", "drift", "shoal", "trade", "gale", "cutlass",
           "galleon", "tide", "wake", "storm")
MINT_W2 = ("spar", "keel", "mast", "helm", "deck", "stern", "jib", "boom", "hold",
           "chart", "star", "cove", "quay", "dock", "knot", "sail", "moon", "bell",
           "watch", "lamp")

app = FastAPI()


def _load(p, default):
    try:
        return json.loads(p.read_text())
    except Exception:
        return default


def _save(p, data):
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.replace(p)


def _mint_code(warden=False):
    codes = _load(CODES_F, {})
    for _ in range(80):
        w1, w2 = secrets.choice(MINT_W1), secrets.choice(MINT_W2)
        n = secrets.randbelow(80) + 10
        code = f"{w1}-{w2}-{n:02d}"
        if code in codes or not CODE_RE.match(code):
            continue
        codes[code] = {"room": "brine", "warden": bool(warden), "minted": time.time()}
        _save(CODES_F, codes)
        return code
    raise RuntimeError("could not mint a unique invite code")


def _prune_tokens(tokens):
    now = time.time()
    return {k: v for k, v in tokens.items() if v.get("exp", 0) > now - 60}


def _mint_token(code, acct_id, room, name, warden):
    tokens = _prune_tokens(_load(TOKENS_F, {}))
    token = secrets.token_urlsafe(32)
    tokens[token] = {"acct": acct_id, "room": room, "name": name,
                     "warden": warden, "exp": time.time() + 7 * 86400}
    _save(TOKENS_F, tokens)
    return token


# ---------------- the one public door ----------------
@app.post("/auth/claim")
async def claim(req: Request):
    try:
        d = await req.json()
    except Exception:
        return {"ok": False, "error": "bad request"}
    code = str(d.get("code", "")).strip().lower()[:40]
    name = re.sub(r"[^\w \-']", "", str(d.get("name", "")).strip())[:24]
    pid = str(d.get("pid", ""))[:40].lower()
    if not CODE_RE.match(code):
        return {"ok": False, "error": "That code doesn't look right, sailor."}
    codes = _load(CODES_F, {})
    entry = codes.get(code)
    if entry is None:
        return {"ok": False, "error": "No such letter of marque. Check the spelling."}
    accounts = _load(ACCOUNTS_F, {})
    acct = accounts.get(code)
    if acct is None:
        if not name:
            return {"ok": False, "error": "And your name, captain?"}
        acct = {"name": name, "pids": [], "created": time.time()}
    elif name:
        acct["name"] = name  # whoever holds the code owns the name
    if pid and PID_RE.match(pid) and pid not in acct["pids"]:
        acct["pids"] = (acct["pids"] + [pid])[-6:]
    acct["last"] = time.time()
    accounts[code] = acct
    _save(ACCOUNTS_F, accounts)
    acct_id = hashlib.sha1(("salt:" + code).encode()).hexdigest()[:10]
    room = str(entry.get("room") or "brine")
    warden = bool(entry.get("warden"))
    token = _mint_token(code, acct_id, room, acct["name"], warden)
    return {"ok": True, "name": acct["name"], "room": room,
            "acct": acct_id, "token": token, "warden": warden}


# ---------------- LAN-only: the ledger ----------------
@app.post("/api/mint")
async def mint(req: Request):
    try:
        d = await req.json()
    except Exception:
        d = {}
    code = _mint_code(warden=bool(d.get("warden")))
    return {"ok": True, "code": code}


@app.post("/api/revoke")
async def revoke(req: Request):
    try:
        d = await req.json()
    except Exception:
        return {"ok": False, "error": "bad request"}
    code = str(d.get("code", "")).strip().lower()
    codes = _load(CODES_F, {})
    if code not in codes:
        return {"ok": False, "error": "no such code"}
    del codes[code]
    _save(CODES_F, codes)
    accounts = _load(ACCOUNTS_F, {})
    if code in accounts:
        del accounts[code]
        _save(ACCOUNTS_F, accounts)
    tokens = _load(TOKENS_F, {})
    live = {t: v for t, v in tokens.items()
            if v.get("acct") != hashlib.sha1(("salt:" + code).encode()).hexdigest()[:10]}
    if len(live) != len(tokens):
        _save(TOKENS_F, live)
    return {"ok": True, "code": code}


@app.get("/api/codes")
def list_codes():
    codes = _load(CODES_F, {})
    accounts = _load(ACCOUNTS_F, {})
    out = []
    for c in sorted(codes):
        a = accounts.get(c)
        out.append({
            "code": c,
            "warden": bool(codes[c].get("warden")),
            "room": codes[c].get("room", "brine"),
            "name": a["name"] if a else None,
            "last": a.get("last") if a else None,
        })
    return {"codes": out}


PAGE = """<!doctype html><html><head><meta charset="utf-8">
<title>Saltstead — the Harbourmaster's Ledger</title>
<style>
body{background:#0b1420;color:#cfd8dc;font-family:'Segoe UI',sans-serif;margin:0;padding:24px}
h1{color:#e0b352;letter-spacing:2px;margin:0 0 4px}
.sub{color:#6f8291;font-style:italic;margin-bottom:18px}
table{border-collapse:collapse;width:100%;font-size:14px;max-width:760px}
th{text-align:left;color:#9fb3bf;font-weight:600;padding:6px 12px 6px 0;border-bottom:1px solid #24384a}
td{padding:6px 12px 6px 0;border-top:1px solid #16222e;vertical-align:top}
code{color:#e0b352;font-size:15px}
.warden{color:#e0b352;font-weight:700}
.unclaimed{color:#6f8291;font-style:italic}
button{background:#16324a;color:#cfd8dc;border:1px solid #2c516f;border-radius:4px;
  padding:6px 14px;cursor:pointer;font-size:13px}
button:hover{background:#1d4260}
.mintrow{margin:14px 0 22px;display:flex;gap:10px}
.revoke{padding:2px 8px;font-size:11px;background:#3a1a1a;border-color:#5c2c2c}
.muted{color:#6f8291;font-size:12px}
</style></head><body>
<h1>SALTSTEAD &mdash; THE HARBOURMASTER&rsquo;S LEDGER</h1>
<div class="sub">Letters of marque. Mint one per player, hand it over however you like
&mdash; the code is the account. This page never leaves the house.</div>
<div class="mintrow">
  <button onclick="mint(false)">Mint an invite</button>
  <button onclick="mint(true)">Mint a WARDEN code</button>
</div>
<div id="codes">Loading&hellip;</div>
<script>
async function mint(warden){
  const r = await fetch('/api/mint',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({warden})});
  const d = await r.json();
  if(d.ok) alert((warden?'Warden code: ':'Invite code: ')+d.code);
  load();
}
async function revoke(code){
  if(!confirm('Revoke '+code+'? The account and its tokens go with it.')) return;
  await fetch('/api/revoke',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code})});
  load();
}
async function load(){
  const d = await (await fetch('/api/codes')).json();
  let h = '<table><tr><th>Code</th><th>Claimed by</th><th>Standing</th><th>Last seen</th><th></th></tr>';
  for(const c of d.codes){
    const last = c.last ? new Date(c.last*1000).toLocaleString() : '';
    h += '<tr><td><code>'+c.code+'</code></td>'
      +'<td>'+(c.name||'<span class="unclaimed">unclaimed</span>')+'</td>'
      +'<td>'+(c.warden?'<span class="warden">WARDEN</span>':'crew')+'</td>'
      +'<td class="muted">'+last+'</td>'
      +'<td><button class="revoke" onclick="revoke(\\''+c.code+'\\')">revoke</button></td></tr>';
  }
  h += '</table>';
  document.getElementById('codes').innerHTML = h;
}
load(); setInterval(load, 15000);
</script></body></html>"""


@app.get("/", response_class=HTMLResponse)
def index():
    return PAGE
