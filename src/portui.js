// The port panel — a DOM layer over the pure ledger in port.js. The game's
// only pointer-driven UI so far: two transactions and the door out.

import { PRIZE_VALUE, HAND_COST, CREW_MAX, sellFleet, canHire } from './port.js';

export class PortUI {
  // onSell / onHire are called with a vetted ledger; the Game mutates state
  constructor(onSell, onHire) {
    this.wrap = document.getElementById('port');
    this.title = this.wrap.querySelector('h2');
    this.pitch = this.wrap.querySelector('.pitch');
    this.status = this.wrap.querySelector('.status');
    this.btnSell = document.getElementById('portsell');
    this.btnHire = document.getElementById('porthire');
    this.btnLeave = document.getElementById('portleave');
    this.open = false;
    this.btnSell.addEventListener('click', () => onSell());
    this.btnHire.addEventListener('click', () => onHire());
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

  // refresh button states + the ledger line from live game numbers
  refresh(gold, crew, fleetSize) {
    const sale = sellFleet(fleetSize, crew);
    this.btnSell.disabled = fleetSize === 0;
    this.btnSell.textContent = fleetSize
      ? `Sell ${fleetSize} prize${fleetSize > 1 ? 's' : ''} \u2014 +${sale.gold} doubloons`
      : `Sell prizes \u2014 none astern (${PRIZE_VALUE} each)`;
    this.btnHire.disabled = !canHire(gold, crew);
    this.btnHire.textContent = crew >= CREW_MAX
      ? `Sign on a hand \u2014 no berths left (${crew}/${CREW_MAX})`
      : `Sign on a hand \u2014 \u2212${HAND_COST} doubloons (${crew}/${CREW_MAX} aboard)`;
    this.status.textContent = `${gold} doubloons in the chest \u00b7 ${crew} hands aboard`
      + (fleetSize ? ` \u00b7 ${fleetSize} prize${fleetSize > 1 ? 's' : ''} astern` : '');
  }
}
