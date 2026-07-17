#!/bin/bash
# Smoke-test the Admiralty Board end to end (runs ON the EVO).
set -e
echo "--- /api/board ---"
curl -s http://127.0.0.1:8099/api/board | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('moor up:', d['moor']['up'], '| codes:', len(d['moor']['codes']),
      '| players:', len(d['moor']['overview'].get('players', {})))
print('salt up:', d['salt']['up'], '| codes:', len(d['salt']['codes']),
      '| feedback:', len(d['salt']['feedback']))
act = sum(1 for v in d['services'].values() if v == 'active')
print('services:', act, 'active of', len(d['services']),
      [k for k, v in d['services'].items() if v != 'active'])
print('vram:', d['sys'].get('vramUsedGB'), '/', d['sys'].get('vramTotalGB'), 'GB')
"
echo "--- mint+revoke round trip: saltstead ---"
CODE=$(curl -s -X POST http://127.0.0.1:8099/api/salt/mint -H 'Content-Type: application/json' -d '{"warden":false}' | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
echo "minted: $CODE"
curl -s -X POST http://127.0.0.1:8099/api/salt/revoke -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}"
echo
echo "--- mint+revoke round trip: moorstead (dale room) ---"
CODE=$(curl -s -X POST http://127.0.0.1:8099/api/moor/mint -H 'Content-Type: application/json' -d '{"room":"dale"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
echo "minted: $CODE"
curl -s http://127.0.0.1:8095/api/codes-full | python3 -c "
import json, sys
codes = json.load(sys.stdin)['codes']
hit = [c for c in codes if c['code'] == '$CODE']
print('on the ledger:', hit)
"
curl -s -X POST http://127.0.0.1:8099/api/moor/revoke -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}"
echo
echo "--- page serves ---"
curl -s http://127.0.0.1:8099/ | head -c 120
echo
echo "ALL CHECKS RAN"
