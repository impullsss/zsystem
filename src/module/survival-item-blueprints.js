export const SURVIVAL_ITEM_FOLDER_NAME = "ZSystem Survival Economy";

export const SURVIVAL_ITEM_BLUEPRINTS = [
    {
        id: "dry-ration",
        name: "[ZT] Сухой паёк",
        type: "food",
        img: "icons/consumables/grains/bread-loaf-brown.webp",
        system: {
            quantity: 6,
            weight: 0.5,
            category: "food",
            resourceValue: 1,
            satiety: 1,
            spoilage: 0,
            description: "Один компактный приём пищи. 2 ед. покрывают спокойный день выжившего."
        }
    },
    {
        id: "canned-food",
        name: "[ZT] Консервы",
        type: "food",
        img: "icons/containers/kitchenware/vase-jar-grey.webp",
        system: {
            quantity: 4,
            weight: 0.6,
            category: "food",
            resourceValue: 1,
            satiety: 1,
            spoilage: 0,
            description: "Надёжная еда для рейдов. Чуть тяжелее сухпайка, зато почти не портится."
        }
    },
    {
        id: "fresh-meat",
        name: "[ZT] Свежее мясо",
        type: "food",
        img: "icons/consumables/meat/hock-leg-pink-brown.webp",
        system: {
            quantity: 2,
            weight: 0.7,
            category: "food",
            resourceValue: 1,
            satiety: 1.25,
            spoilage: 2,
            description: "Питательно, но портится. Хорошо для лагеря, плохо для долгого рейда без хранения."
        }
    },
    {
        id: "clean-water",
        name: "[ZT] Чистая вода",
        type: "resource",
        img: "icons/consumables/potions/bottle-round-blue.webp",
        system: {
            quantity: 6,
            weight: 1,
            category: "water",
            resourceValue: 1,
            description: "Один литр воды. 3 ед. покрывают спокойный день выжившего."
        }
    },
    {
        id: "dirty-water",
        name: "[ZT] Грязная вода",
        type: "resource",
        img: "icons/consumables/potions/bottle-round-corked-brown.webp",
        system: {
            quantity: 4,
            weight: 1,
            category: "water",
            resourceValue: 1,
            contamination: 35,
            description: "Вода сомнительного качества. Можно пить в крайнем случае, но лучше очистить."
        }
    },
    {
        id: "scrap",
        name: "[ZT] Лом",
        type: "materials",
        img: "icons/commodities/metal/ingot-stamped-steel.webp",
        system: {
            quantity: 6,
            weight: 0.45,
            category: "parts",
            resourceValue: 0.5,
            description: "Грубый лом. Две единицы примерно равны одной ремонтной детали."
        }
    },
    {
        id: "repair-parts",
        name: "[ZT] Ремонтные детали",
        type: "materials",
        img: "icons/tools/smithing/gear-steel-grey.webp",
        system: {
            quantity: 4,
            weight: 0.35,
            category: "parts",
            resourceValue: 1,
            description: "Универсальные детали. 1 деталь примерно 5 HP транспорта или один шаг ремонта оружия."
        }
    },
    {
        id: "field-toolkit",
        name: "[ZT] Набор инструментов",
        type: "misc",
        img: "icons/tools/hand/hammer-and-nail.webp",
        system: {
            quantity: 1,
            weight: 3,
            category: "tools",
            resourceValue: 1,
            description: "Базовый набор для ремонта. Убирает штраф за отсутствие инструментов."
        }
    },
    {
        id: "workshop-kit",
        name: "[ZT] Мастерская",
        type: "misc",
        img: "icons/tools/smithing/anvil.webp",
        system: {
            quantity: 1,
            weight: 20,
            category: "workshop",
            resourceValue: 1,
            description: "Тяжёлый стационарный набор. Лучший выбор для базы, транспорта и сложного ремонта."
        }
    },
    {
        id: "bandage",
        name: "[ZT] Бинт",
        type: "medicine",
        img: "icons/commodities/cloth/cloth-roll-white.webp",
        system: {
            quantity: 4,
            weight: 0.05,
            category: "medicine",
            resourceValue: 0.5,
            healAmount: 3,
            quality: 1,
            description: "Расходник для лёгкой помощи, кровотечения и стабилизации."
        }
    },
    {
        id: "medkit",
        name: "[ZT] Аптечка",
        type: "medicine",
        img: "icons/containers/chest/chest-reinforced-red.webp",
        system: {
            quantity: 1,
            weight: 0.8,
            category: "medicine",
            resourceValue: 2,
            healAmount: 12,
            quality: 2,
            description: "Полноценный набор первой помощи. Дорогой, но надёжный."
        }
    }
];

export function getSurvivalItemData() {
    return SURVIVAL_ITEM_BLUEPRINTS.map((blueprint) => ({
        name: blueprint.name,
        type: blueprint.type,
        img: blueprint.img,
        system: { ...blueprint.system },
        flags: {
            zsystem: {
                survivalBlueprint: blueprint.id
            }
        }
    }));
}

export async function createSurvivalItemsFolder() {
    const existing = game.folders.find((folder) =>
        folder.type === "Item" && folder.name === SURVIVAL_ITEM_FOLDER_NAME
    );
    if (existing) return existing;
    return await Folder.create({
        name: SURVIVAL_ITEM_FOLDER_NAME,
        type: "Item",
        sorting: "a"
    });
}

export async function createSurvivalStarterItems({ replaceExisting = false } = {}) {
    const folder = await createSurvivalItemsFolder();
    const existingByBlueprint = new Map(
        game.items
            .filter((item) => item.getFlag("zsystem", "survivalBlueprint"))
            .map((item) => [item.getFlag("zsystem", "survivalBlueprint"), item])
    );
    const itemsToCreate = [];

    for (const blueprint of getSurvivalItemData()) {
        const existing = existingByBlueprint.get(blueprint.flags.zsystem.survivalBlueprint);
        if (existing && !replaceExisting) continue;
        if (existing && replaceExisting) await existing.delete();
        itemsToCreate.push({ ...blueprint, folder: folder.id });
    }

    if (!itemsToCreate.length) {
        ui.notifications?.info("Предметы выживания уже созданы.");
        return [];
    }

    const created = await Item.createDocuments(itemsToCreate);
    ui.notifications?.info(`Создано предметов выживания: ${created.length}`);
    return created;
}
