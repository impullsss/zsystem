// Run this inside Foundry VTT as a script macro or in the browser console.
// It creates disposable ZSystem actors/items for manual regression testing.

await (async () => {
    const FOLDER_NAME = "[ZT] Codex Test Kit";

    const existing = game.folders.find(f => f.type === "Actor" && f.name === FOLDER_NAME);
    if (existing) {
        const actors = game.actors.filter(a => a.folder?.id === existing.id);
        for (const actor of actors) await actor.delete();
        await existing.delete();
    }

    const folder = await Folder.create({ name: FOLDER_NAME, type: "Actor", sorting: "a" });

    const actorDefaults = {
        resources: {
            hp: { value: 110, max: 110, min: 0, penalty: 0 },
            ap: { value: 50, max: 50, min: 0, bonus: 0, effect: 0 },
            infection: { value: 0, stage: 0, active: false }
        },
        attributes: {
            str: { base: 5, value: 5, mod: 0, min: 1, max: 10 },
            agi: { base: 6, value: 6, mod: 0, min: 1, max: 10 },
            vig: { base: 6, value: 6, mod: 0, min: 1, max: 10 },
            per: { base: 7, value: 7, mod: 0, min: 1, max: 10 },
            cha: { base: 5, value: 5, mod: 0, min: 1, max: 10 },
            int: { base: 5, value: 5, mod: 0, min: 1, max: 10 }
        },
        skills: {
            melee: { value: 55, base: 0, points: 44, mod: 0 },
            ranged: { value: 85, base: 0, points: 70, mod: 0 },
            science: { value: 25, base: 0, points: 10, mod: 0 },
            mechanical: { value: 50, base: 0, points: 35, mod: 0 },
            medical: { value: 25, base: 0, points: 10, mod: 0 },
            diplomacy: { value: 45, base: 0, points: 30, mod: 0 },
            leadership: { value: 45, base: 0, points: 30, mod: 0 },
            survival: { value: 55, base: 0, points: 40, mod: 0 },
            athletics: { value: 45, base: 0, points: 30, mod: 0 },
            stealth: { value: 60, base: 0, points: 45, mod: 0 }
        },
        secondary: {
            bravery: { value: 10 },
            tenacity: { value: 10 },
            evasion: { value: 10 },
            carryWeight: { value: 0, max: 50 },
            spentStats: { value: 0 },
            spentSkills: { value: 0 },
            naturalAC: { value: 0 }
        },
        social: { attitude: "neutral", preset: "normal", notes: "" }
    };

    function duplicate(data) {
        return foundry.utils.deepClone(data);
    }

    function weapon(name, system) {
        return {
            name,
            type: "weapon",
            img: "icons/weapons/guns/gun-rifle-brown.webp",
            system: {
                weight: 4,
                quantity: 1,
                equipped: true,
                favorite: true,
                hands: "2h",
                weaponType: "ranged",
                subtype: "ranged_ballistic",
                damageType: "ballistic",
                strReq: 1,
                noise: 12,
                hp: { value: 100, max: 100 },
                ammoType: "",
                mag: { value: 0, max: 0 },
                reloadAP: 4,
                range: 30,
                attacks: {},
                isThrowing: false,
                blastRadius: 0,
                templateType: "cone",
                critChance: 0,
                critMult: 1.5,
                jammed: false,
                ballisticPower: 30,
                armorPiercing: 0,
                lineWidth: 0.75,
                burstConeAngle: 18,
                ...system
            }
        };
    }

    function ammo(name, calibre, ammoKind, quantity = 30) {
        return {
            name,
            type: "ammo",
            img: "icons/weapons/ammunition/bullets-belt.webp",
            system: {
                weight: 0.02,
                quantity,
                calibre,
                ammoKind,
                damageBonus: 0,
                ballisticPowerBonus: 0,
                armorPiercingBonus: 0,
                lineWidthModifier: 0,
                burstConeAngleModifier: 0,
                noiseModifier: 0,
                jamChanceBonus: 0,
                traumaMultiplier: 0
            }
        };
    }

    function armor(name, ac, ballistic, coverage = { torso: true }) {
        return {
            name,
            type: "armor",
            img: "icons/equipment/chest/breastplate-layered-leather-brown.webp",
            system: {
                weight: 5,
                quantity: 1,
                equipped: true,
                ac,
                hp: { value: 100, max: 100 },
                dr: { blunt: 0, slashing: 0, piercing: 0, ballistic, fire: 0 },
                coverage: {
                    head: false,
                    torso: true,
                    lArm: false,
                    rArm: false,
                    lLeg: false,
                    rLeg: false,
                    ...coverage
                },
                penalties: { dex: 0, move: 0, noise: 0 }
            }
        };
    }

    async function createActor(name, type, system, items = [], img = "icons/svg/mystery-man.svg") {
        const actor = await Actor.create({
            name,
            type,
            folder: folder.id,
            img,
            system,
            prototypeToken: {
                name,
                actorLink: false,
                disposition: type === "survivor" ? 1 : -1,
                width: 1,
                height: 1,
                texture: { src: img },
                sight: { enabled: true, range: 30 }
            }
        });
        if (items.length) await actor.createEmbeddedDocuments("Item", items);
        return actor;
    }

    const rifle = weapon("[ZT] Автомат 5.56 - очередь/линия", {
        ammoType: "5.56",
        mag: { value: 30, max: 30 },
        range: 40,
        ballisticPower: 32,
        armorPiercing: 2,
        lineWidth: 0.75,
        burstConeAngle: 18,
        attacks: {
            single: { name: "Одиночный", mode: "ranged", ap: 4, dmg: "20", bullets: 1, noise: 12, mod: 0, chance: 0 },
            burst: { name: "Очередь x5", mode: "ranged", ap: 6, dmg: "20", bullets: 5, noise: 18, mod: 0, chance: 0 }
        }
    });

    const shotgun = weapon("[ZT] Дробовик 12g - пуля/дробь", {
        img: "icons/weapons/guns/gun-pistol-flintlock.webp",
        ammoType: "12g",
        mag: { value: 6, max: 6 },
        range: 20,
        ballisticPower: 32,
        armorPiercing: 0,
        lineWidth: 0.75,
        burstConeAngle: 18,
        attacks: {
            shot: { name: "Выстрел", mode: "ranged", ap: 4, dmg: "22", bullets: 1, noise: 14, mod: 0, chance: 0 }
        }
    });

    const melee = weapon("[ZT] Бита - крит/травмы", {
        img: "icons/weapons/clubs/club-baton-blue.webp",
        weaponType: "melee",
        subtype: "melee_blunt",
        damageType: "blunt",
        ammoType: "",
        mag: { value: 0, max: 0 },
        range: 1.5,
        ballisticPower: 0,
        attacks: {
            hit: { name: "Удар", mode: "melee", ap: 3, dmg: "12", bullets: 0, noise: 0, mod: 0, chance: 0 }
        }
    });

    await createActor("[ZT] Стрелок - оружие/патроны", "survivor", duplicate(actorDefaults), [
        rifle,
        shotgun,
        melee,
        ammo("[ZT] 5.56 обычные", "5.56", "standard", 60),
        ammo("[ZT] 5.56 бронебойные", "5.56", "armor-piercing", 40),
        ammo("[ZT] 5.56 самодельные", "5.56", "homemade", 40),
        ammo("[ZT] 12g пуля", "12g", "slug", 20),
        ammo("[ZT] 12g дробь", "12g", "shot", 20)
    ], "icons/svg/cowled.svg");

    const targetSystem = duplicate(actorDefaults);
    targetSystem.resources.hp = { value: 90, max: 90, min: 0, penalty: 0 };
    targetSystem.resources.ap = { value: 8, max: 8, min: 0, bonus: 0, effect: 0 };
    targetSystem.secondary.evasion.value = 8;

    await createActor("[ZT] Линия 1 - союзник перед целью", "npc", duplicate(targetSystem), [
        armor("[ZT] Лёгкая броня", 2, 3)
    ]);
    await createActor("[ZT] Линия 2 - основная цель", "npc", duplicate(targetSystem), [
        armor("[ZT] Средняя броня", 5, 7)
    ]);
    await createActor("[ZT] Линия 3 - цель за целью", "npc", duplicate(targetSystem), [
        armor("[ZT] Тяжёлая броня", 8, 12)
    ]);
    await createActor("[ZT] Конус A - очередь/дробь", "npc", duplicate(targetSystem), []);
    await createActor("[ZT] Конус B - очередь/дробь", "npc", duplicate(targetSystem), []);

    const friendlySocial = duplicate(actorDefaults);
    friendlySocial.social = { attitude: "friendly", preset: "easy", notes: "Тест дружелюбной социалки" };
    await createActor("[ZT] Социалка - дружелюбный", "npc", friendlySocial, []);

    const hostileSocial = duplicate(actorDefaults);
    hostileSocial.social = { attitude: "hostile", preset: "hard", notes: "Тест враждебной социалки" };
    await createActor("[ZT] Социалка - враждебный", "npc", hostileSocial, []);

    await createActor("[ZT] Пешеход - глобальная карта", "survivor", duplicate(actorDefaults), [], "icons/svg/boot.svg");

    await createActor("[ZT] Пикап - топливо/ремонт", "vehicle", {
        attributes: {
            speed: { value: 50, max: 100 },
            handling: { value: 0 },
            mpg: { value: 8 }
        },
        resources: {
            fuel: { value: 20, max: 60 },
            hp: { value: 55, max: 100 }
        },
        broken: true,
        cargo: { value: 0, max: 500 },
        passengers: []
    }, [
        {
            name: "[ZT] Детали для ремонта",
            type: "materials",
            img: "icons/tools/smithing/anvil.webp",
            system: { weight: 1, quantity: 10, category: "parts", equipped: false, favorite: false }
        }
    ], "icons/svg/truck.svg");

    ui.notifications.info("Создан тестовый набор [ZT] Codex Test Kit.");
    console.log("ZSystem test kit created:", folder.name);
})();
