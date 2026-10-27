import type { LocalizedText, TetherlessModule } from "../types/content";

export interface SpanishCoverageReport {
  translated: number;
  total: number;
  missing: string[];
  percent: number;
}

function addText(report: Omit<SpanishCoverageReport, "percent">, label: string, text: LocalizedText | undefined) {
  if (!text?.en.trim()) return;
  report.total += 1;
  if (text.es?.trim()) report.translated += 1;
  else report.missing.push(label);
}

export function getSpanishCoverage(module: TetherlessModule): SpanishCoverageReport {
  const report: Omit<SpanishCoverageReport, "percent"> = { translated: 0, total: 0, missing: [] };
  addText(report, "module title", module.title);
  addText(report, "module subtitle", module.subtitle);
  addText(report, "module mission brief", module.mission_brief);
  addText(report, "module level label", module.level_label);
  module.questions.forEach((question) => {
    addText(report, `question ${question.id} prompt`, question.prompt);
    addText(report, `question ${question.id} scenario`, question.scenario);
    addText(report, `question ${question.id} feedback`, question.feedback);
    question.choices.forEach((choice) => addText(report, `question ${question.id} choice ${choice.id}`, choice));
  });
  for (const sector of module.gamification?.sectors ?? []) addText(report, `sector ${sector.id} name`, sector.name);
  addText(report, "mission badge", module.gamification?.mission_badge);
  return { ...report, percent: report.total === 0 ? 100 : Number(((report.translated / report.total) * 100).toFixed(1)) };
}
