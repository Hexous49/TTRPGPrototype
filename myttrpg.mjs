import { MyTTRPGActor } from "./module/documents.mjs";
import {
  MyTTRPGCharacterData,
  MyTTRPGNPCData,
  MyTTRPGWeaponData,
  MyTTRPGSkillData,
} from "./module/data-models.mjs";

Hooks.once("init", () => {
  console.log("myttrpg | Initializing My TTRPG System");

  // Register custom document classes
  CONFIG.Actor.documentClass = MyTTRPGActor;

  // Register data models
  CONFIG.Actor.dataModels = {
    character: MyTTRPGCharacterData,
    npc: MyTTRPGNPCData,
  };

  CONFIG.Item.dataModels = {
    weapon: MyTTRPGWeaponData,
    skill: MyTTRPGSkillData,
  };
});
