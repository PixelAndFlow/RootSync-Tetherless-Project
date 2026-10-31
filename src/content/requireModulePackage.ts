import { TETHERLESS_SCHEMA, validateTetherlessModule } from "../../packages/content/src/tetherless-module.ts";
import type { TetherlessModule } from "../types/content";

/** Apply the shared publishing schema before untrusted content enters the cache/UI. */
export function requireModulePackage(input: unknown, moduleId: string, version: number): TetherlessModule {
  const errors = validateTetherlessModule(input).filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(`Invalid module package: ${errors.map((issue) => issue.message).join(" ")}`);
  const module = input as TetherlessModule;
  if (module.schema_version !== TETHERLESS_SCHEMA) throw new Error("Unsupported module schema version.");
  if (module.module_id !== moduleId || module.content_version !== version) throw new Error("Module package does not match the requested ID and version.");
  if (module.activity_type && module.activity_type !== "multiple_choice") throw new Error("This module activity is not supported by this app yet.");
  if (module.gamification?.sectors !== undefined && !Array.isArray(module.gamification.sectors)) throw new Error("Invalid module package: sectors must be a list.");
  // The shared schema treats choice IDs case-insensitively. Render the exact
  // supplied choice ID so local correctness agrees with server scoring.
  if (module.questions.some((question) => !question.choices.some((choice) => choice.id === question.correct_choice))) {
    return { ...module, questions: module.questions.map((question) => ({ ...question, correct_choice: question.choices.find((choice) => choice.id.toLowerCase() === question.correct_choice.toLowerCase())!.id })) };
  }
  return module;
}
