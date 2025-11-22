// src/module/dice.js

/**
 * Генерирует HTML для чата
 */
function _getSlotMachineHTML(label, target, rollTotal, isSuccess) {
  const statusClass = isSuccess ? "success" : "failure";
  const statusLabel = isSuccess ? "УСПЕХ" : "ПРОВАЛ";
  
  return `
    <div class="z-chat-card">
      <div class="z-card-header">${label}</div>
      <div class="z-card-sub">Цель: ${target}%</div>
      
      <div class="z-slot-machine">
        <div class="z-reel-window">
          <div class="z-reel-spin ${statusClass}">${rollTotal}</div>
        </div>
      </div>

      <div class="z-result-label ${statusClass}">
        ${statusLabel}
      </div>
    </div>
  `;
}

/**
 * Логика броска навыка
 */
export async function rollSkill(actor, skillId) {
  const skill = actor.system.skills[skillId];
  if (!skill) return;

  const roll = new Roll("1d100");
  await roll.evaluate();
  
  const isSuccess = roll.total <= skill.value;
  const label = skillId.charAt(0).toUpperCase() + skillId.slice(1);

  const content = _getSlotMachineHTML(label, skill.value, roll.total, isSuccess);

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({actor: actor}),
    content: content
  });
}

/**
 * Логика атаки предметом
 */
export async function performAttack(actor, itemId) {
   const item = actor.items.get(itemId);
   if (!item) return;

   // 1. Проверка и списание AP
   const apCost = Number(item.system.apCost) || 0;
   const curAP = Number(actor.system.resources.ap.value);
   
   if (curAP < apCost) {
       ui.notifications.warn(`Недостаточно AP! Нужно ${apCost}, есть ${curAP}.`);
       return;
   }
   await actor.update({"system.resources.ap.value": curAP - apCost});

   // 2. Определение навыка
   let skillType = 'melee';
   const sub = item.system.subtype || '';
   if (['pistol', 'rifle', 'shotgun'].includes(sub)) {
     skillType = 'ranged';
   }

   const skill = actor.system.skills[skillType];
   const skillVal = skill ? skill.value : 0; 
   const skillLabel = skillType.charAt(0).toUpperCase() + skillType.slice(1);

   // 3. Бросок
   const roll = new Roll("1d100");
   await roll.evaluate();
   const isHit = roll.total <= skillVal;

   // 4. Урон
   let dmgHTML = "";
   if (isHit && item.system.damage) {
       try {
           const dmgRoll = new Roll(item.system.damage);
           await dmgRoll.evaluate();
           dmgHTML = `
             <div class="z-damage-box">
               <div class="dmg-label">УРОН</div>
               <div class="dmg-val">${dmgRoll.total}</div>
             </div>`;
       } catch(e) {
           dmgHTML = `<div style="color:red; font-size:0.8em">Ошибка формулы</div>`;
       }
   }

   // 5. Вывод
   let slotHTML = _getSlotMachineHTML(`Атака: ${item.name}`, skillVal, roll.total, isHit);
   
   const content = `
     <div class="z-attack-wrapper">
       ${slotHTML}
       ${dmgHTML}
       <div class="z-ap-spent">Навык: ${skillLabel} | AP: -${apCost}</div>
     </div>
   `;

   await roll.toMessage({
       speaker: ChatMessage.getSpeaker({actor: actor}),
       content: content
   });
}