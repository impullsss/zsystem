// Foundry Script Macro:
// Creates the starter survival-economy items in the world item directory.
//
// Usage:
// 1. Create a Script Macro in Foundry.
// 2. Paste this file content.
// 3. Run as GM.

if (!game.user.isGM) {
  ui.notifications.warn("Только GM может создавать системные предметы.");
} else if (!game.zsystem?.survival?.createStarterItems) {
  ui.notifications.error("ZSystem survival API не найден. Перезагрузите мир после обновления системы.");
} else {
  await game.zsystem.survival.createStarterItems({ replaceExisting: false });
}
