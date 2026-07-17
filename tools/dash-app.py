"""Saltstead harbourmaster's ledger — invite codes, accounts, and login tokens.

:8097 on LAN/Tailscale only. The Cloudflare tunnel (saltstead.sovren.xyz ->
Caddy :8091) routes exactly three public endpoints here: POST /auth/claim,
POST /feedback and POST /visit (the muster book — page visits and play-starts
for saltstead.app AND the marsstead.app teaser, deduped per browser per day).
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
FEEDBACK_F = DASH / "feedback.json"
FEEDBACK_RATE_F = DASH / "feedback_rate.json"
VISIT_RATE_F = DASH / "visit_rate.json"

VISIT_SITES = ("saltstead", "marsstead")
SEEN_KEEP_DAYS = 45      # per-day dedupe sets kept this long; day totals kept forever
EVER_CAP = 20000         # lifetime distinct-browser table cap (oldest last-seen evicted)

PID_RE = re.compile(r"^[a-z0-9-]{4,40}$")
CODE_RE = re.compile(r"^[a-z]+-[a-z]+-\d{2}$")
EMAIL_RE = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$")

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


def _client_ip(req):
    # the Cloudflare tunnel means everything reaches the socket as 127.0.0.1.
    # Vercel-rewritten requests (the game client) carry the player in
    # x-forwarded-for; direct tunnel visitors carry it in cf-connecting-ip.
    # (Moorstead's ledger checks neither properly and files every public
    # report under localhost, sharing one rate cap between all hands.)
    return (req.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or req.headers.get("cf-connecting-ip", "").strip()
            or (req.client.host if req.client else "?"))


def _utc_day(now=None):
    return int((now or time.time()) // 86400)


def _rate_ok(ip, limit, rate_file):
    day = _utc_day()
    rates = _load(rate_file, {})
    rec = rates.get(ip, {"day": day, "n": 0})
    if rec.get("day") != day:
        rec = {"day": day, "n": 0}
    if rec["n"] >= limit:
        return False
    rec["n"] += 1
    rates[ip] = rec
    _save(rate_file, rates)
    return True


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


# ---------------- the other public door: feedback & bug reports ----------------
@app.post("/feedback")
async def feedback(req: Request):
    """Public: player feedback or bug report with page / in-game context."""
    ip = _client_ip(req)
    if not _rate_ok(ip, limit=8, rate_file=FEEDBACK_RATE_F):
        return {"ok": False, "err": "Easy now — only a few reports a day, sailor."}
    try:
        d = await req.json()
    except Exception:
        return {"ok": False, "err": "bad request"}
    kind = str(d.get("kind", "feedback")).strip().lower()
    if kind not in ("bug", "feedback"):
        kind = "feedback"
    message = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", str(d.get("message", "")).strip())[:2000]
    if len(message) < 8:
        return {"ok": False, "err": "Tell us a bit more — at least a sentence."}
    email = str(d.get("email", "")).strip().lower()[:120]
    if email and not EMAIL_RE.match(email):
        return {"ok": False, "err": "That email doesn't look right."}
    name = re.sub(r"[^\w \-']", "", str(d.get("name", "")).strip())[:24]
    pid = str(d.get("pid", ""))[:40].lower()
    ctx = d.get("context") if isinstance(d.get("context"), dict) else {}
    ctx_safe = {
        "page": str(ctx.get("page", ""))[:24],
        "url": str(ctx.get("url", ""))[:240],
        "ua": str(ctx.get("ua", ""))[:240],
        "loc": str(ctx.get("loc", ""))[:36],
        "state": str(ctx.get("state", ""))[:16],
        "tag": str(ctx.get("tag", ""))[:48],
    }
    try:
        ctx_safe["day"] = max(0, min(int(ctx.get("day", 0) or 0), 99999))
        ctx_safe["gold"] = max(0, min(int(ctx.get("gold", 0) or 0), 10**9))
    except Exception:
        pass
    pos = ctx.get("pos") if isinstance(ctx.get("pos"), dict) else {}
    try:
        ctx_safe["pos"] = {
            "x": max(-10**8, min(int(pos.get("x", 0) or 0), 10**8)),
            "z": max(-10**8, min(int(pos.get("z", 0) or 0), 10**8)),
        }
    except Exception:
        ctx_safe["pos"] = {}
    entry = {
        "id": secrets.token_hex(6),
        "ts": time.time(),
        "kind": kind,
        "message": message,
        "email": email,
        "name": name,
        "pid": pid if PID_RE.match(pid) else "",
        "ip": ip,
        "context": ctx_safe,
    }
    log = _load(FEEDBACK_F, [])
    log.append(entry)
    _save(FEEDBACK_F, log[-1000:])
    return {"ok": True, "msg": "Noted on the harbourmaster's ledger — thank you."}


# ---------------- the third public door: the muster book ----------------
# One beacon per page-load ("visit") and one per session when a player takes a
# ship to sea ("play"). Raw counts AND per-browser-per-day uniques are kept, so
# a refresh-happy visitor cannot inflate the uniques and a lost beacon only
# ever undercounts. Day totals live forever; the dedupe sets are pruned.
def _visit_uid(pid, ip, ua):
    basis = ("pid:" + pid) if PID_RE.match(pid) else ("ip:" + ip + "|" + ua[:80])
    return hashlib.sha1(basis.encode()).hexdigest()[:12]


def _record_visit(site, kind, uid):
    day = str(_utc_day())
    data = _load(VISITS_F, {})
    s = data.setdefault(site, {"days": {}, "seen": {}, "ever": {}})
    rec = s["days"].setdefault(day, {"v": 0, "p": 0, "uv": 0, "up": 0})
    seen = s["seen"].setdefault(day, {})
    bit = 1 if kind == "visit" else 2
    prev = int(seen.get(uid, 0))
    if kind == "visit":
        rec["v"] += 1
        if not prev & 1:
            rec["uv"] += 1
    else:
        rec["p"] += 1
        if not prev & 2:
            rec["up"] += 1
    seen[uid] = prev | bit
    e = s["ever"].get(uid) or [int(day), int(day), 0]
    e[1] = int(day)
    if kind == "play":
        e[2] += 1
    s["ever"][uid] = e
    if len(s["ever"]) > EVER_CAP:
        for old in sorted(s["ever"], key=lambda k: s["ever"][k][1])[:len(s["ever"]) - EVER_CAP]:
            del s["ever"][old]
    cutoff = _utc_day() - SEEN_KEEP_DAYS
    s["seen"] = {d: m for d, m in s["seen"].items() if int(d) >= cutoff}
    _save(VISITS_F, data)


@app.post("/visit")
async def visit(req: Request):
    ip = _client_ip(req)
    # generous: real players fire 2-3 a day; a script hammering the door hits the cap
    if not _rate_ok(ip, limit=200, rate_file=VISIT_RATE_F):
        return {"ok": False}
    try:
        d = await req.json()
    except Exception:
        return {"ok": False}
    site = str(d.get("site", "")).strip().lower()
    if site not in VISIT_SITES:
        return {"ok": False}
    kind = str(d.get("kind", "visit")).strip().lower()
    if kind not in ("visit", "play"):
        kind = "visit"
    pid = str(d.get("pid", ""))[:40].lower()
    _record_visit(site, kind, _visit_uid(pid, ip, req.headers.get("user-agent", "")))
    return {"ok": True}


# ---------------- LAN-only: the ledger ----------------
@app.get("/api/visits")
def visits_summary():
    """Aggregates for the Admiralty Board: per site, today / 7 days / ever."""
    data = _load(VISITS_F, {})
    today = _utc_day()
    out = {}
    for site in VISIT_SITES:
        s = data.get(site) or {"days": {}, "seen": {}, "ever": {}}
        days = s.get("days", {})
        seen = s.get("seen", {})
        ever = s.get("ever", {})
        t = days.get(str(today), {})

        week_days = [str(d) for d in range(today - 6, today + 1)]
        wv = sum(days.get(d, {}).get("v", 0) for d in week_days)
        wp = sum(days.get(d, {}).get("p", 0) for d in week_days)
        wuv = len({u for d in week_days for u, b in (seen.get(d) or {}).items() if b & 1})
        wup = len({u for d in week_days for u, b in (seen.get(d) or {}).items() if b & 2})

        recent = []
        for d in range(today - 13, today + 1):
            r = days.get(str(d))
            if r:
                recent.append({"date": time.strftime("%Y-%m-%d", time.gmtime(d * 86400)),
                               **{k: r.get(k, 0) for k in ("v", "uv", "p", "up")}})
        out[site] = {
            "today": {"visits": t.get("v", 0), "uniques": t.get("uv", 0),
                      "plays": t.get("p", 0), "playUniques": t.get("up", 0)},
            "week": {"visits": wv, "uniques": wuv, "plays": wp, "playUniques": wup},
            "ever": {"visits": sum(r.get("v", 0) for r in days.values()),
                     "plays": sum(r.get("p", 0) for r in days.values()),
                     "browsers": len(ever),
                     "players": sum(1 for e in ever.values() if len(e) > 2 and e[2] > 0)},
            "recentDays": recent,
        }
    return {"visits": out}


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


@app.get("/api/feedback")
def list_feedback():
    return {"feedback": list(reversed(_load(FEEDBACK_F, [])[-40:]))}


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
h2{color:#9fb3bf;letter-spacing:2px;font-size:15px;margin:34px 0 8px}
.fb{max-width:760px;border-top:1px solid #16222e;padding:8px 0;font-size:13px}
.fb .kind{font-weight:700;margin-right:8px}
.fb .kind.bug{color:#d47a6a}
.fb .kind.feedback{color:#8fd6a0}
.fb .msg{margin:4px 0;white-space:pre-wrap}
.fb .ctx{color:#6f8291;font-size:11px}
</style></head><body>
<h1>SALTSTEAD &mdash; THE HARBOURMASTER&rsquo;S LEDGER</h1>
<div class="sub">Letters of marque. Mint one per player, hand it over however you like
&mdash; the code is the account. This page never leaves the house.</div>
<div class="mintrow">
  <button onclick="mint(false)">Mint an invite</button>
  <button onclick="mint(true)">Mint a WARDEN code</button>
</div>
<div id="codes">Loading&hellip;</div>
<h2>FEEDBACK &amp; BUGS (last 40)</h2>
<div id="fb">Loading&hellip;</div>
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
const esc = s => String(s||'').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadFb(){
  const d = await (await fetch('/api/feedback')).json();
  const fb = d.feedback||[];
  if(!fb.length){ document.getElementById('fb').innerHTML = '<div class="muted">Nothing yet.</div>'; return; }
  let h='';
  for(const f of fb){
    const c=f.context||{};
    const bits=[new Date(f.ts*1000).toLocaleString(), f.name, f.email, c.page, c.loc,
      c.state, c.day!=null?('day '+c.day):'', c.gold!=null?(c.gold+' dbl'):''].filter(Boolean);
    h += '<div class="fb"><span class="kind '+esc(f.kind)+'">'+esc(f.kind).toUpperCase()+'</span>'
      +'<span class="muted">'+bits.map(esc).join(' &middot; ')+'</span>'
      +'<div class="msg">'+esc(f.message)+'</div>'
      +'<div class="ctx">'+esc(c.ua||'')+'</div></div>';
  }
  document.getElementById('fb').innerHTML = h;
}
load(); loadFb(); setInterval(()=>{load(); loadFb();}, 15000);
</script></body></html>"""


@app.get("/", response_class=HTMLResponse)
def index():
    return PAGE
