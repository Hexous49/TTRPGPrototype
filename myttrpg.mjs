import { MyTTRPGActor } from "./module/documents.mjs";
import {
  MyTTRPGCharacterData,
  MyTTRPGNPCData,
  MyTTRPGWeaponData,
  MyTTRPGSkillData,
  MyTTRPGShieldGeneratorData,
  MyTTRPGArmorData,
} from "./module/data-models.mjs";
import { MyTTRPGActorSheet } from "./module/sheets/actor-sheet.mjs";

Hooks.once("init", () => {
  console.log("myttrpg | Initializing My TTRPG System");

  CONFIG.Actor.documentClass = MyTTRPGActor;

  CONFIG.Actor.dataModels = {
    character: MyTTRPGCharacterData,
    npc:       MyTTRPGNPCData,
  };

  CONFIG.Item.dataModels = {
    weapon:          MyTTRPGWeaponData,
    skill:           MyTTRPGSkillData,
    shieldGenerator: MyTTRPGShieldGeneratorData,
    armor:           MyTTRPGArmorData,
  };

  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("myttrpg", MyTTRPGActorSheet, {
    makeDefault: true,
    label: "MYTTRPG.SheetLabel.actor",
  });
});

// ─── Shield recharge track ────────────────────────────────────────────────────
// Each Shield Generator item has a rechargeTrack array, e.g. [1, 2, 3, 4].
// The pool stores a rechargePosition pointer that advances each round when
// regen fires and resets to 0 whenever the pool takes damage.
//
// combatStart  → reset every combatant's shield pool to position 0.
// updateCombat → each round transition, recharge by track[position] then advance.
// preUpdateActor → if a pool's value decreases (damage taken), reset position to 0.

Hooks.on("combatStart", async (combat, _options) => {
  if (!game.user.isGM) return;

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor?.system) continue;

    const equippedShieldId = actor.system.equippedShieldId;
    if (!equippedShieldId) continue;

    const rawPools = actor.system.toObject().pools;
    const idx = rawPools.findIndex(p => p.sourceItemId === equippedShieldId);
    if (idx === -1) continue;

    rawPools[idx].rechargePosition = 0;
    await actor.update({ "system.pools": rawPools });
  }
});

Hooks.on("updateCombat", async (combat, changes, _options, _userId) => {
  if (!game.user.isGM) return;
  if (changes.round == null) return;   // only round transitions, not turn changes

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor?.system) continue;

    const equippedShieldId = actor.system.equippedShieldId;
    if (!equippedShieldId) continue;   // no shield equipped

    const rawPools = actor.system.toObject().pools;
    const idx = rawPools.findIndex(p => p.sourceItemId === equippedShieldId);
    if (idx === -1) continue;          // shield has no pool (shouldn't happen)

    const pool = rawPools[idx];
    if (pool.value >= pool.max) continue; // already full — no regen, track stays put

    // Look up the recharge track from the equipped item.
    const shieldItem = actor.items.get(equippedShieldId);
    const track = shieldItem?.system?.rechargeTrack;
    if (!track?.length) continue;      // item has no track defined

    const pos    = pool.rechargePosition ?? 0;
    const amount = track[pos] ?? track[0];

    rawPools[idx].value            = Math.min(pool.max, pool.value + amount);
    // Clamp at the last entry — position stays there until damage resets it to 0.
    rawPools[idx].rechargePosition = Math.min(pos + 1, track.length - 1);
    await actor.update({ "system.pools": rawPools });

    // Post a chat message only when the shield actually gained points.
    if (amount > 0) {
      const newValue = rawPools[idx].value;
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<strong>${pool.name}</strong> recharged by <strong>+${amount}</strong> (${newValue} / ${pool.max})`,
      });
    }
  }
});

// ─── Reset recharge position when a shield pool takes damage ─────────────────
// preUpdateActor fires before the write; we mutate changes.system.pools in place
// so the reset travels in the same update, keeping things atomic.

Hooks.on("preUpdateActor", (actor, changes, _options, _userId) => {
  if (!game.user.isGM) return;
  if (!Array.isArray(changes.system?.pools)) return;

  const equippedShieldId = actor.system.equippedShieldId;
  if (!equippedShieldId) return;

  const currentPools = actor.system.toObject().pools;
  const shieldIdx    = currentPools.findIndex(p => p.sourceItemId === equippedShieldId);
  if (shieldIdx === -1) return;
  if (changes.system.pools[shieldIdx] === undefined) return;

  const oldValue = currentPools[shieldIdx].value;
  const newValue = changes.system.pools[shieldIdx].value;

  if (newValue !== undefined && newValue < oldValue) {
    changes.system.pools[shieldIdx].rechargePosition = 0;
  }
});

// ─── Dead condition ───────────────────────────────────────────────────────────
// Apply / remove Foundry's built-in "dead" status when Vitality hits 0.
// Only the GM runs this to avoid duplicate effect creation on multi-client games.

Hooks.on("updateActor", (actor, changes, _options, _userId) => {
  if (!game.user.isGM) return;

  const newVitality = changes.system?.vitality?.value;
  if (newVitality == null) return;                  // vitality wasn't part of this update

  actor.toggleStatusEffect("dead", { active: newVitality <= 0 });
});

// ─── Chat: Apply Damage button ────────────────────────────────────────────────
// Any chat message that has flags.myttrpg.weaponDamageTotal gets an
// "Apply N Damage" button injected below the roll.  Clicking it opens a
// dialog listing every health pool on the currently selected token.

Hooks.on("renderChatMessage", (message, html) => {
  const total = message.flags?.myttrpg?.weaponDamageTotal;
  if (total == null) return;

  // html may be a jQuery object (v12) or a plain Element (v13 AppV2 path).
  const rootEl = html?.jquery ? html[0] : html;
  const contentEl = rootEl?.querySelector?.(".message-content");
  if (!contentEl) return;

  const wrap = document.createElement("div");
  wrap.className = "myttrpg-apply-damage-wrap";
  wrap.innerHTML = `<button type="button" class="myttrpg-apply-damage">Apply ${total} Damage</button>`;
  contentEl.append(wrap);
  wrap.querySelector(".myttrpg-apply-damage")
      .addEventListener("click", () => myttrpgOpenApplyDialog(total));
});

// actor defaults to null on the first call; recursive re-opens pass the same
// actor reference so the token doesn't need to stay selected.
function myttrpgOpenApplyDialog(damage, actor = null) {
  if (damage <= 0) return;

  // First call: resolve actor from the selected token.
  if (!actor) {
    const tokens = canvas.tokens?.controlled ?? [];
    if (!tokens.length) {
      ui.notifications.warn("Select a token on the canvas first.");
      return;
    }
    actor = tokens[0].actor;
  }
  if (!actor?.system) return;

  const sys = actor.system;

  // Build a flat list of every pool the actor has (always include depleted ones
  // so the player can see the full picture).
  const pools = [
    { label: "Vitality", value: sys.vitality?.value ?? 0, max: sys.vitality?.max ?? 0, key: "vitality" },
    ...(sys.pools ?? []).map((p, i) => ({
      label: p.name,
      value: p.value,
      max:   p.max,
      key:   `pool:${i}`,
    })),
  ];

  // Bail out early if every pool is already empty.
  if (!pools.some(p => p.value > 0)) {
    ui.notifications.warn(`${damage} damage could not be fully absorbed — all pools are empty.`);
    return;
  }

  const rows = pools.map(p => {
    const depleted = p.value <= 0;
    return `
    <div class="myttrpg-damage-row${depleted ? " myttrpg-damage-row--depleted" : ""}">
      <span class="myttrpg-damage-pool-name">${p.label}</span>
      <span class="myttrpg-damage-pool-value">${p.value} / ${p.max}</span>
      <button type="button" class="myttrpg-apply-pool-btn" data-key="${p.key}"${depleted ? " disabled" : ""}>Apply</button>
    </div>`;
  }).join("");

  const d = new Dialog({
    title: `Apply ${damage} Damage — ${actor.name}`,
    content: `<form class="myttrpg-damage-dialog">${rows}</form>`,
    buttons: {
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
    },
    render: (html) => {
      html.find(".myttrpg-apply-pool-btn:not([disabled])").click(async (ev) => {
        const key = ev.currentTarget.dataset.key;
        let remaining = 0;

        if (key === "vitality") {
          const current  = actor.system.vitality?.value ?? 0;
          const absorbed = Math.min(current, damage);
          remaining = damage - absorbed;
          await actor.update({ "system.vitality.value": current - absorbed });

        } else if (key.startsWith("pool:")) {
          const idx      = parseInt(key.split(":")[1]);
          const rawPools = actor.system.toObject().pools;
          if (rawPools[idx]) {
            const current  = rawPools[idx].value;
            const absorbed = Math.min(current, damage);
            remaining = damage - absorbed;
            rawPools[idx].value = current - absorbed;

            // If this is the equipped shield pool and it actually absorbed damage,
            // reset the recharge track back to position 0.
            if (absorbed > 0
                && rawPools[idx].sourceItemId
                && rawPools[idx].sourceItemId === actor.system.equippedShieldId) {
              rawPools[idx].rechargePosition = 0;
            }

            await actor.update({ "system.pools": rawPools });
          }
        }

        d.close();
        // If the pool couldn't absorb everything, reopen for the remainder.
        if (remaining > 0) myttrpgOpenApplyDialog(remaining, actor);
      });
    },
    default: "cancel",
  });
  d.render(true);
}

// ─── Prototype world items ─────────────────────────────────────────────────────
// Create prototype items the first time the GM loads the world.
// Each entry is checked by name+type so it only gets created once.
Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;

  const prototypeItems = [
    { name: "Sword",                type: "weapon",          system: { damage: "4d6", range: "5ft"  } },
    { name: "Rifle",                type: "weapon",          system: { damage: "3d6", range: "30ft" } },
    { name: "Shield Generator Mk1", type: "shieldGenerator", system: { shieldMax: 20, rechargeTrack: [1, 2, 3, 4] } },
    { name: "Light Armor",          type: "armor",           system: { armorMax: 10 } },
    { name: "Medium Armor",         type: "armor",           system: { armorMax: 25 } },
    { name: "Heavy Armor",          type: "armor",           system: { armorMax: 40 } },
  ];

  for (const proto of prototypeItems) {
    const exists = game.items.find(i => i.name === proto.name && i.type === proto.type);
    if (!exists) {
      await Item.create(proto);
      console.log(`myttrpg | Created world item: ${proto.name}`);
    }
  }
});
