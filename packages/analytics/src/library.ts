import type { ContentModule, Question } from "../../content/src/schema.ts";

/**
 * Every published version of every module, for scoring.
 *
 * Answer-key corrections: when a later version of a module contains the same
 * question_id with a different correct answer, answers given on earlier
 * versions are scored with the corrected key. Raw answers never change; only
 * the score derived from them does.
 */
export class ContentLibrary {
  private readonly byModule = new Map<string, Map<number, ContentModule>>();

  constructor(modules: ContentModule[]) {
    for (const m of modules) {
      if (!this.byModule.has(m.module_id)) this.byModule.set(m.module_id, new Map());
      this.byModule.get(m.module_id)!.set(m.content_version, m);
    }
  }

  moduleIds(): string[] {
    return [...this.byModule.keys()].sort();
  }

  get(moduleId: string, version: number): ContentModule | undefined {
    return this.byModule.get(moduleId)?.get(version);
  }

  latest(moduleId: string): ContentModule | undefined {
    const versions = this.byModule.get(moduleId);
    if (!versions) return undefined;
    return versions.get(Math.max(...versions.keys()));
  }

  /** The question as it appears in the newest version that still contains it. */
  authoritativeQuestion(moduleId: string, questionId: string): Question | undefined {
    const versions = this.byModule.get(moduleId);
    if (!versions) return undefined;
    for (const v of [...versions.keys()].sort((a, b) => b - a)) {
      const m = versions.get(v)!;
      const q =
        m.questions.find((x) => x.question_id === questionId) ??
        (m.boss_missions ?? []).flatMap((b) => b.questions).find((x) => x.question_id === questionId);
      if (q) return q;
    }
    return undefined;
  }

  /** True when the question is a regular (non-Boss-Mission) question in that version. */
  isRegularQuestion(moduleId: string, version: number, questionId: string): boolean {
    return !!this.get(moduleId, version)?.questions.some((q) => q.question_id === questionId);
  }

  questionInVersion(moduleId: string, version: number, questionId: string): Question | undefined {
    const m = this.get(moduleId, version);
    if (!m) return undefined;
    return m.questions.find((q) => q.question_id === questionId) ?? (m.boss_missions ?? []).flatMap((b) => b.questions).find((q) => q.question_id === questionId);
  }
}
