import type { TetherlessModule } from "../types/content";

export function validateModule(module: TetherlessModule): string[] {
  const errors: string[] = [];
  if (!module.schema_version.trim()) errors.push("Schema version is required.");
  if (!module.module_id.trim()) errors.push("Module ID is required.");
  if (!Number.isSafeInteger(module.content_version) || module.content_version < 1) errors.push("Content version must be a positive integer.");
  if (module.note !== undefined && typeof module.note !== "string") errors.push("Staff note must be text.");
  if (module.activity_type !== undefined && typeof module.activity_type !== "string") errors.push("Activity type must be text.");
  if (!module.title.en.trim()) errors.push("Module title is missing an English value.");
  if (!module.questions.length) errors.push("At least one question is required.");
  if (module.settings.question_count !== module.questions.length) {
    errors.push(`Settings question count (${module.settings.question_count}) does not match the ${module.questions.length} supplied questions.`);
  }
  if (module.settings.passing_score_percent !== undefined && (module.settings.passing_score_percent < 0 || module.settings.passing_score_percent > 100)) {
    errors.push("Passing score percent must be between 0 and 100.");
  }
  const questionIds = new Set<string>();

  module.questions.forEach((question) => {
    if (!question.id.trim()) errors.push("A question ID is required.");
    if (questionIds.has(question.id)) errors.push(`Duplicate question ID: ${question.id}`);
    questionIds.add(question.id);
    if (!question.topic.trim()) errors.push(`Question ${question.id} is missing a topic.`);
    if (!question.prompt.en.trim()) errors.push(`Question ${question.id} is missing an English prompt.`);
    if (!question.feedback.en.trim()) errors.push(`Question ${question.id} is missing English feedback.`);
    if (question.choices.length < 2) errors.push(`Question ${question.id} must include at least two choices.`);
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
    if (!sector.name.en.trim()) errors.push(`Sector ${sector.id} is missing an English name.`);
    if (!sector.question_ids.length) errors.push(`Sector ${sector.id} must include at least one question.`);
    if (sectorIds.has(sector.id)) errors.push(`Duplicate sector ID: ${sector.id}`);
    sectorIds.add(sector.id);
    const sectorQuestionIds = new Set<string>();
    for (const questionId of sector.question_ids) {
      if (sectorQuestionIds.has(questionId)) errors.push(`Sector ${sector.id} repeats question: ${questionId}`);
      sectorQuestionIds.add(questionId);
      if (!questionIds.has(questionId)) errors.push(`Sector ${sector.id} references an unknown question: ${questionId}`);
    }
  }
  return errors;
}
