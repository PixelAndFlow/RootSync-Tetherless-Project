import type { TetherlessModule } from "../types/content";

export function validateModule(module: TetherlessModule): string[] {
  const errors: string[] = [];
  if (!module.module_id.trim()) errors.push("Module ID is required.");
  if (!module.content_version.trim()) errors.push("Content version is required.");
  if (!module.questions.length) errors.push("At least one question is required.");
  if (module.settings.question_count !== module.questions.length) {
    errors.push(`Settings question count (${module.settings.question_count}) does not match the ${module.questions.length} supplied questions.`);
  }
  const questionIds = new Set<string>();

  module.questions.forEach((question) => {
    if (questionIds.has(question.id)) errors.push(`Duplicate question ID: ${question.id}`);
    questionIds.add(question.id);
    if (!question.prompt.en.trim()) errors.push(`Question ${question.id} is missing an English prompt.`);
    const choiceIds = new Set<string>();
    question.choices.forEach((choice) => {
      if (choiceIds.has(choice.id)) errors.push(`Question ${question.id} has duplicate choice ID: ${choice.id}`);
      choiceIds.add(choice.id);
      if (!choice.en.trim()) errors.push(`Question ${question.id}, choice ${choice.id} is missing English text.`);
    });
    if (!choiceIds.has(question.correct_choice)) errors.push(`Question ${question.id} references a missing correct choice.`);
  });
  const sectorIds = new Set<string>();
  for (const sector of module.gamification?.sectors ?? []) {
    if (sectorIds.has(sector.id)) errors.push(`Duplicate sector ID: ${sector.id}`);
    sectorIds.add(sector.id);
    for (const questionId of sector.question_ids) {
      if (!questionIds.has(questionId)) errors.push(`Sector ${sector.id} references an unknown question: ${questionId}`);
    }
  }
  return errors;
}
