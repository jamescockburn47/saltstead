// The port panel — a DOM layer over the pure ledgers in port.js and
// shipyard.js (and the yard's repair bill in combat.js). Four transactions
// and the door out.

import { PRIZE_VALUE, HAND_COST, sellFleet, canHire, fenceRate } from './port.js';
import { repairCost } from './combat.js';
import { hullById, nextHull } from './shipyard.js';

export class PortUI {
  // onSell / onHire / onRepair / onShip are called with a vetted ledger; the
  // Game mutates state
  constructor(onSell, onHire, onRepair, onShip) {
    this.wrap = document.getElementById('port');
    this.title = this.wrap.querySelector('h2');
    this.pitch = this.wrap.querySelector('.pitch');
    this.status = this.wrap.querySelector('.status');
    this.btnSell = document.getElementById('portsell');
    this.btnHire = document.getElementById('porthire');
    this.btnRepair = document.getElementById('portrepair');
    this.btnShip = document.getElementById('portship');
    this.btnLeave = document.getElementById('portleave');
    this.open = false;
    this.btnSell.addEventListener('click', () => onSell());
    this.btnHire.addEventListener('click', () => onHire());
    this.btnRepair.addEventListener('click', () => onRepair());
    this.btnShip.addEventListener('click', () => onShip());
    this.btnLeave.addEventListener('click', () => this.hide());
  }

  show(haven) {
    this.open = true;
    this.title.textContent = haven.name.toUpperCase();
    this.pitch.textContent = haven.pitch;
    this.wrap.style.display = 'flex';
  }

  hide() {
    this.open = false;
    this.wrap.style.display = 'none';
  }

  // refresh button states + the ledger line from live game numbers.
  // hull: the player's combat.js damage state (rig/hull 0..1);
  // hullId: the rung of the shipwright's ladder they sail;
  // port: the haven/dockyard row (fence rate hangs off its kind).
  refresh(gold, crew, fleetSize, hull = { rig: 1, hull: 1 }, hullId = 'sloop', port = { kind: 'haven' }) {
    const berths = hullById(hullId).berths;
    const rate = fenceRate(port);
    const sale = sellFleet(fleetSize, crew, berths, rate);
    this.btnSell.disabled = fleetSize === 0;
    this.btnSell.textContent = fleetSize
      ? `Sell ${fleetSize} prize${fleetSize > 1 ? 's' : ''} \u2014 +${sale.gold} doubloons`
        + (rate < 1 ? ' (an honest port \u2014 half price, no questions answered)' : '')
      : rate < 1
        ? `Sell prizes \u2014 none astern (${Math.round(PRIZE_VALUE * rate)} each here; havens pay full)`
        : `Sell prizes \u2014 none astern (${PRIZE_VALUE} each)`;
    this.btnHire.disabled = !canHire(gold, crew, berths);
    this.btnHire.textContent = crew >= berths
      ? `Sign on a hand \u2014 no berths left (${crew}/${berths})`
      : `Sign on a hand \u2014 \u2212${HAND_COST} doubloons (${crew}/${berths} aboard)`;
    const bill = repairCost(hull);
    this.btnRepair.disabled = bill <= 0 || gold < bill;
    this.btnRepair.textContent = bill <= 0
      ? 'Repairs \u2014 she\u2019s sound as a bell'
      : gold < bill
        ? `Repairs \u2014 the yard wants ${bill} doubloons (you\u2019re short)`
        : `Repair her \u2014 \u2212${bill} doubloons `
          + `(rig ${(hull.rig * 100).toFixed(0)}% \u00b7 hull ${(hull.hull * 100).toFixed(0)}%)`;
    const next = nextHull(hullId);
    this.btnShip.disabled = !next || gold < next.price;
    this.btnShip.textContent = !next
      ? `The shipwright \u2014 no finer hull on the ladder than your ${hullById(hullId).name}`
      : gold < next.price
        ? `The shipwright \u2014 a ${next.name.toUpperCase()} runs ${next.price} doubloons (you\u2019re short)`
        : `Build a ${next.name.toUpperCase()} \u2014 \u2212${next.price} doubloons `
          + `(${next.guns} guns a side \u00b7 ${next.berths} berths \u00b7 faster, but she draws deep)`;
    this.status.textContent = `${gold} doubloons in the chest \u00b7 ${crew} hands aboard`
      + (fleetSize ? ` \u00b7 ${fleetSize} prize${fleetSize > 1 ? 's' : ''} astern` : '');
  }
}
