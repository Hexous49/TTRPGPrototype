import { MyTTRPGActor } from "./module/documents.mjs";
import {
  MyTTRPGCharacterData,
  MyTTRPGNPCData,
  MyTTRPGWeaponData,
  MyTTRPGSkillData,
  MyTTRPGShieldGeneratorData,
} from "./module/data-models.mjs";
import { MyTTRPGActorSheet } from "./module/sheets/actor-sheet.mjs";

Hooks.once("init", () => {
  console.log("myttrpg | Initializing My TTRPG System");

  // Register custom document classes
  CONFIG.Actor.documentClass = MyTTRPGActor;

  // Register data models
  CONFIG.Actor.dataModels = {
    character: MyTTRPGCharacterData,
    npc:       MyTTRPGNPCData,
  };

  CONFIG.Item.dataModels = {
    weapon:         MyTTRPGWeaponData,
    skill:          MyTTRPGSkillData,
    shieldGenerator: MyTTRPGShieldGeneratorData,
  };

  // Register sheets
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("myttrpg", MyTTRPGActorSheet, {
    makeDefault: true,
    label: "MYTTRPG.SheetLabel.actor",
  });
});

// Create the Shield Generator Mk1 prototype item the first time the GM loads
// the world.  Checks by name so it only runs once and survives reloads.
Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  const exists = game.items.find(
    i => i.name === "Shield Generator Mk1" && i.type === "shieldGenerator"
  );
  if (!exists) {
    await Item.create({
      name: "Shield Generator Mk1",
      type: "shieldGenerator",
      system: { shieldMax: 20 },
    });
    console.log("myttrpg | Created world item: Shield Generator Mk1");
  }
});
