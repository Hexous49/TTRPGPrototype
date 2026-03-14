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
