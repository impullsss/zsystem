import {
    buildEconomyBalanceReport,
    getEconomyItemBlueprints
} from "../src/module/survival-economy.js";

console.log("ZSystem Survival Economy Simulation");
console.log("===================================");

console.log("\nItem baseline");
for (const item of getEconomyItemBlueprints()) {
    console.log(`- ${item.label}: ${item.units} ${item.resource}, ${item.weightKg} kg, ${item.valueCaps} caps`);
}

console.log("\nScenarios");
for (const report of buildEconomyBalanceReport()) {
    const { scenario, loadout, scavenge, flags } = report;
    console.log(`\nScenario: ${scenario.name}`);
    console.log(`Party: ${loadout.partySize}, days: ${loadout.days}, terrain: ${loadout.terrain}, movement: ${loadout.movementMode}`);
    console.log(`Food: ${loadout.resources.food}, water: ${loadout.resources.water}, parts: ${loadout.resources.parts}, medicine: ${loadout.resources.medicine}, tools: ${loadout.resources.tools}`);
    console.log(`Weight: ${loadout.totals.weightKg} kg`);
    console.log(`Value: ${loadout.totals.valueCaps} caps`);
    console.log(`Consumables: ${loadout.totals.consumableWeightKg} kg, ${loadout.totals.consumableValueCaps} caps`);
    console.log(`Scavenge bottleneck: ~${scavenge.bottleneckHours}h`);
    console.log(`Yield / 4h: food ${scavenge.yieldPer4h.food}, water ${scavenge.yieldPer4h.water}, parts ${scavenge.yieldPer4h.parts}, medicine ${scavenge.yieldPer4h.medicine}`);
    console.log(`Flags: ${flags.join(", ")}`);
    for (const note of loadout.notes) console.log(`Note: ${note}`);
}
