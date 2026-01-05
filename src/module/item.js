
export class ZItem extends Item {
  prepareData() {
    super.prepareData();

    const data = this.system ?? this.data?.data ?? this.data;
    if (!data) return;

    const system = this.system;

    // Инициализация Атак для Оружия
    if (this.type === 'weapon') {
      if (!system.attacks) system.attacks = {};
    }

    // Инициализация Брони
    if (this.type === 'armor') {
      if (!system.dr) system.dr = { blunt:0, slashing:0, piercing:0, ballistic:0, fire:0 };
      if (!system.coverage) system.coverage = { head:false, torso:true, lArm:false, rArm:false, lLeg:false, rLeg:false };
    }

    // Если категории нет или она пустая — вычислим автоматически (инференс)
    if (!data.category || data.category === '') {
      // Если item.type уже совпадает с одним из наших ключевых category — используем его
      const explicitTypes = ['weapon','armor','materials','luxury','medicine','food','consumable','resource','misc'];
      if (explicitTypes.includes(this.type)) {
        data.category = (this.type === 'resource') ? 'materials' : this.type;
      } else {
        data.category = this._inferCategory(data) || 'misc';
      }
    } else {
      // если category - массив (на случай старых записей) - нормализуем в строку (первое непустое)
      if (Array.isArray(data.category)) {
        const found = data.category.find(c => typeof c === 'string' && c.trim() !== '');
        data.category = found ?? data.category[data.category.length - 1] ?? 'misc';
      }
    }

    // Дефолты веса/количества
    data.weight = (typeof data.weight !== 'undefined') ? data.weight : 0;
    data.quantity = (typeof data.quantity !== 'undefined') ? data.quantity : 1;

    // Дефолты по типам
    if (this.type === 'weapon') {
      if (system.noise !== undefined) {
            system.noise = Math.max(0, Number(system.noise) || 0);
        }
        // ВАЖНО: Мы НЕ трогаем system.attacks, там минус разрешен
        if (!system.attacks) system.attacks = {};
      data.apCost = (typeof data.apCost !== 'undefined') ? data.apCost : 0;
      data.damage = data.damage ?? '';
      data.skillType = data.skillType ?? 'melee';
      data.reload = data.reload ?? 0;
    }

    if (this.type === 'consumable') {
      data.charges = data.charges ?? 1;
    }
  }

  _inferCategory(data) {
    const name = (this.name || '').toString().toLowerCase();
    const desc = (data?.description || '').toString().toLowerCase();
    const text = name + ' ' + desc;

    if (this.type === 'weapon') return 'weapon';
    if (this.type === 'armor') return 'armor';
    if (this.type === 'resource') {
      if (text.match(/lux|gold|jewel|gem|ring|necklace|ювел|золото|драго/)) return 'luxury';
      return 'materials';
    }
    if (this.type === 'consumable') {
      if (text.match(/food|bread|meat|fish|еда|хлеб|мясо|рыба/)) return 'food';
      if (text.match(/med|heal|апт|бинт|лек|antibio|антиб/)) return 'medicine';
      return 'medicine';
    }
    if (text.match(/armor|брон|жилет|plate|панц/)) return 'armor';
    return 'misc';
  }

  getAPCost() {
    return Number(this.system?.apCost ?? getProperty(this, 'data.data.apCost') ?? 0);
  }
}
