// src/module/perk-logic.js

export class PerkLogic {
    /**
     * Универсальная проверка наличия перка
     */
    static has(actor, identifier) {
        if (!actor || !actor.items) return false;
        
        // Ищем перк
        const perk = actor.items.find(i => 
            i.type === "perk" && 
            (i.system.logicKey === identifier || i.name.toLowerCase() === identifier.toLowerCase())
        );

        if (perk) {
            // Если нашли - пишем в консоль один раз для отладки
            console.log(`PerkLogic | Найден перк: ${perk.name} (ID: ${perk.id})`);
            return true;
        }
        
        return false;
    }

    /**
     * ЛОГИКА ДВИЖЕНИЯ
     */
    static onGetStepCost(actor, baseCost, stepNumber) {
        // Проверяем наличие Бегуна
        const isRunner = this.has(actor, "runner");

        if (isRunner) {
            // Каждая 4-я клетка бесплатно
            if (stepNumber > 0 && stepNumber % 4 === 0) {
                console.log(`PerkLogic | Сработал БЕГУН! Шаг №${stepNumber} стоит 0 AP.`);
                return 0;
            }
        }

        return baseCost;
    }

    static onApplyDamage(attacker, target, damage, weapon) {
        let finalDamage = damage;
        if (this.has(attacker, "butcher") && target.hasStatusEffect("bleeding")) {
            finalDamage += 5;
            console.log("PerkLogic | Мясник +5 урона");
        }
        return finalDamage;
    }
}