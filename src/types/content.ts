export interface LocalizedText {
  en: string;
  es?: string;
}

export interface Choice {
  id: string;
  en: string;
  es?: string;
  icon?: string;
}

export type QuestionPresentation =
  | "kahoot_cards"
  | "mission_alert"
  | "security_alert"
  | "policy_card"
  | "code_card"
  | "evidence_diff"
  | "boss_question"
  | "image_choice";

export interface Question {
  id: string;
  topic: string;
  type: "multiple_choice" | "scenario_mc" | string;
  presentation: QuestionPresentation | string;
  prompt: LocalizedText;
  scenario?: LocalizedText;
  choices: Choice[];
  correct_choice: string;
  feedback: LocalizedText;
}

export interface ModuleSettings {
  question_count: number;
  timer_seconds: number | null;
  show_immediate_feedback: boolean;
  allow_retry: boolean;
  spanish_assist_default: boolean;
  passing_score_percent?: number;
  allow_full_retry?: boolean;
  allow_missed_practice?: boolean;
  allow_correct_review?: boolean;
  allow_all_review?: boolean;
  allow_missed_question_practice?: boolean;
  allow_correct_answer_review?: boolean;
  allow_incorrect_answer_review?: boolean;
  allow_full_review?: boolean;
}

export interface MissionSector {
  id: string;
  order: number;
  name: LocalizedText;
  icon?: string;
  question_ids: string[];
  mastery_bonus_xp?: number;
}

export interface GamificationConfig {
  mode?: string;
  mission_name?: LocalizedText;
  mission_badge?: Choice;
  sectors?: MissionSector[];
  xp?: Record<string, unknown>;
  streak?: Record<string, unknown>;
  cyber_shield?: Record<string, unknown>;
  excluded_mechanics?: Record<string, string>;
}

export interface TetherlessModule {
  schema_version: string;
  module_id: string;
  content_version: number;
  activity_type?: string;
  /** Staff-only metadata. Never render in learner screens. */
  note?: string;
  program?: string;
  level: string;
  level_label?: LocalizedText;
  title: LocalizedText;
  subtitle?: LocalizedText;
  mission_brief?: LocalizedText;
  settings: ModuleSettings;
  questions: Question[];
  brand?: Record<string, unknown>;
  tracking_policy?: Record<string, unknown>;
  gamification?: GamificationConfig;
  trainer_reporting?: Record<string, unknown>;
}
