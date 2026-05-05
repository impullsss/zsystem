export function getForcedD100Roll() {
    const value = Number(game.settings.get("zsystem", "forceD100Roll")) || 0;
    if (value < 1 || value > 100) return 0;
    return Math.floor(value);
}

export async function rollD100() {
    const forced = getForcedD100Roll();
    const formula = forced ? String(forced) : "1d100";
    return new Roll(formula).evaluate();
}
