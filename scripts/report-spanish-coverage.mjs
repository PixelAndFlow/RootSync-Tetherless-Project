import { readFile } from "node:fs/promises";

const fixturePath = new URL("../src/content/fixtures/operation-cyber-squad.json", import.meta.url);
const module = JSON.parse(await readFile(fixturePath, "utf8"));
const missing = [];
let translated = 0;
let total = 0;

function check(label, value) {
  if (!value?.en?.trim()) return;
  total += 1;
  if (value.es?.trim()) translated += 1;
  else missing.push(label);
}

check("module title", module.title);
check("module subtitle", module.subtitle);
check("module mission brief", module.mission_brief);
check("module level label", module.level_label);
for (const question of module.questions) {
  check(`question ${question.id} prompt`, question.prompt);
  check(`question ${question.id} scenario`, question.scenario);
  check(`question ${question.id} feedback`, question.feedback);
  for (const choice of question.choices) check(`question ${question.id} choice ${choice.id}`, choice);
}
for (const sector of module.gamification?.sectors ?? []) check(`sector ${sector.id} name`, sector.name);
check("mission badge", module.gamification?.mission_badge);

const percent = total === 0 ? 100 : Number(((translated / total) * 100).toFixed(1));
console.log(`Spanish Assist coverage: ${translated}/${total} (${percent}%).`);
if (missing.length) console.log(`Needs translation: ${missing.join(", ")}`);
