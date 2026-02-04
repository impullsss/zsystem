export class PerkLogic {
    /**
     * Теперь возвращает сам объект перка, чтобы мы могли вытащить из него данные
     */
    static getPerk(actor, identifier) {
        if (!actor || !actor.items) return null;
        return actor.items.find(i => 
            i.type === "perk" && 
            (i.system.logicKey === identifier || i.name.toLowerCase() === identifier.toLowerCase())
        );
    }

    /**
     * ЛОГИКА ДВИЖЕНИЯ
     */
    static onGetStepCost(actor, baseCost, stepNumber) {
        const perk = this.getPerk(actor, "runner");

        if (perk) {
            // Читаем значение из интерфейса. Если пусто - по умолчанию 4.
            const interval = Number(perk.system.logicValue) || 4;
            
            if (stepNumber > 0 && stepNumber % interval === 0) {
                console.log(`PerkLogic | БЕГУН (${perk.name}): шаг №${stepNumber} бесплатен (интервал: ${interval}).`);
                return 0;
            }
        }

        return baseCost;
    }

    /**
     * ЛОГИКА БОЯ
     */
    static onApplyDamage(attacker, target, damage, weapon) {
        let finalDamage = damage;
        const perk = this.getPerk(attacker, "butcher");

        if (perk && target.hasStatusEffect("bleeding")) {
            // Читаем бонус из интерфейса. Если пусто - по умолчанию 5.
            const bonus = Number(perk.system.logicValue) || 5;
            finalDamage += bonus;
            console.log(`PerkLogic | МЯСНИК: +${bonus} урона по цели с кровотечением.`);
        }

        return finalDamage;
    }
}