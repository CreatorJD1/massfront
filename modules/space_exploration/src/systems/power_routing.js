/* --------------------------------------------------------------------------
   MASSFRONT — EXPLORATION SHIP POWER ROUTING

   Reactor allocation is deliberately non-combat: propulsion, scanners,
   life support, and fabrication. There is no weapons or space-combat channel.
   -------------------------------------------------------------------------- */

export class PowerRouting {
  constructor() {
    this.totalPips = 16;
    this.pips = {
      propulsion: 4,
      scanners: 4,
      lifeSupport: 4,
      fabrication: 4
    };
    this.capacitor = 100;
    this.maxCapacitor = 100;
  }

  setRoute(system) {
    if (!(system in this.pips) || this.pips[system] >= 8) return false;
    const others = ['propulsion', 'scanners', 'lifeSupport', 'fabrication']
      .filter(candidate => candidate !== system)
      .sort((a, b) => this.pips[b] - this.pips[a] || a.localeCompare(b));
    if (this.pips[others[0]] <= 1) return false;
    this.pips[others[0]]--;
    this.pips[system]++;
    return true;
  }

  getPropulsionMultiplier() {
    return 0.6 + (this.pips.propulsion / 4) * 0.4;
  }

  getScannerMultiplier() {
    return 0.55 + (this.pips.scanners / 4) * 0.45;
  }

  getRecoveryMultiplier() {
    return 0.55 + (this.pips.lifeSupport / 4) * 0.45;
  }

  getFabricationMultiplier() {
    return 0.55 + (this.pips.fabrication / 4) * 0.45;
  }

  snapshot() {
    return {
      totalPips: this.totalPips,
      pips: { ...this.pips },
      multipliers: {
        propulsion: this.getPropulsionMultiplier(),
        scanners: this.getScannerMultiplier(),
        lifeSupport: this.getRecoveryMultiplier(),
        fabrication: this.getFabricationMultiplier()
      },
      capacitor: this.capacitor,
      maxCapacitor: this.maxCapacitor
    };
  }
}
