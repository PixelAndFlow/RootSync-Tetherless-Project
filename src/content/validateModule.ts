import type { TetherlessModule } from "../types/content";

export function validateModule(module: TetherlessModule): string[] {
  const errors: string[] = [];
  if (!module.module_id.trim()) errors.push("Module ID is required.");
  if (!module.content_version.trim()) errors.push("Content version is required.");
  const questionIds = new Set<string>();

  module.questions.forEach((question) => {
    if (questionIds.has(question.id)) errors.push(`Duplicate question ID: ${question.id}`);
    questionIds.add(question.id);
    if (!question.prompt.en.trim()) errors.push(`Question ${question.id} is missing an English prompt.`);
    const choiceIds = new Set<string>();
    question.choices.forEach((choice) => {
      if (choiceIds.has(choice.id)) errors.push(`Question ${question.id} has duplicate choice ID: ${choice.id}`);
      choiceIds.add(choice.id);
    });
    if (!choiceIds.has(question.correct_choice)) errors.push(`Question ${question.id} references a missing correct choice.`);
  });
  return errors;
}
