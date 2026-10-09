import operationCyberSquadJson from "./fixtures/operation-cyber-squad.json";
import type { TetherlessModule } from "../types/content";

export const operationCyberSquad = operationCyberSquadJson as TetherlessModule;

export const moduleLibrary: TetherlessModule[] = [operationCyberSquad];
