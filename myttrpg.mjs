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

function myttrpgOpenApplyDialog(damage) {
  // Require exactly one selected token
  const tokens = canvas.tokens?.controlled ?? [];
  if (!tokens.length) {
    ui.notifications.warn("Select a token on the canvas first.");
    return;
  }

  const actor = tokens[0].actor;
  if (!actor?.system) return;

  const sys = actor.system;

  // Build a flat list of every pool the actor has
  const pools = [
    { label: "Vitality", value: sys.vitality?.value ?? 0, max: sys.vitality?.max ?? 0, key: "vitality" },
    ...(sys.pools ?? []).map((p, i) => ({
      label: p.name,
      value: p.value,
      max:   p.max,
      key:   `pool:${i}`,
    })),
  ];

  const rows = pools.map(p => `
    <div class="myttrpg-damage-row">
      <span class="myttrpg-damage-pool-name">${p.label}</span>
      <span class="myttrpg-damage-pool-value">${p.value} / ${p.max}</span>
      <button type="button" class="myttrpg-apply-pool-btn" data-key="${p.key}">Apply</button>
    </div>`).join("");

  const d = new Dialog({
    title: `Apply ${damage} Damage — ${actor.name}`,
    content: `<form class="myttrpg-damage-dialog">${rows}</form>`,
    buttons: {
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
    },
    render: (html) => {
      html.find(".myttrpg-apply-pool-btn").click(async (ev) => {
        const key = ev.currentTarget.dataset.key;

        if (key === "vitality") {
          const newVal = Math.max(0, (actor.system.vitality?.value ?? 0) - damage);
          await actor.update({ "system.vitality.value": newVal });

        } else if (key.startsWith("pool:")) {
          const idx = parseInt(key.split(":")[1]);
          const updatedPools = actor.system.toObject().pools;
          if (updatedPools[idx]) {
            updatedPools[idx].value = Math.max(0, updatedPools[idx].value - damage);
            await actor.update({ "system.pools": updatedPools });
          }
        }
        d.close();
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
    { name: "Shield Generator Mk1", type: "shieldGenerator", system: { shieldMax: 20 } },
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
