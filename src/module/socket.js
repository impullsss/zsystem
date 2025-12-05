import { NoiseManager } from "./noise.js";

// Убрали export let zSocket

export function initSocket() {
    console.log("ZSystem | Initializing Socketlib...");
    
    // Проверка модуля
    if (!game.modules.get("socketlib")?.active) {
        ui.notifications.error("ZSystem: Модуль 'socketlib' отключен! Урон работать не будет.");
        console.error("ZSystem | Socketlib NOT active.");
        return;
    }

    // === ГЛОБАЛЬНАЯ РЕГИСТРАЦИЯ ===
    const socket = socketlib.registerSystem("zsystem");
    
    // 1. ШУМ
    socket.register("addNoiseGM", async (amount) => {
        // Выполняется у ГМа
        await NoiseManager.addGM(amount); 
    });

    // 2. УРОН
    socket.register("applyDamageGM", async (uuid, amount, type, limb) => {
        // Выполняется у ГМа
        const doc = await fromUuid(uuid);
        if (!doc) return;
        const actor = doc.actor || doc;
        
        console.log(`ZSystem (GM) | Socket Damage to ${actor.name}: ${amount}`);
        await actor.applyDamage(amount, type, limb, { fromSocket: true });
    });

    // Сохраняем в глобальную область, чтобы разорвать круг импортов
    game.zsystemSocket = socket;
    
    console.log("ZSystem | Socketlib READY (game.zsystemSocket created).");
}