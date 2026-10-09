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

export interface TetherlessModule {
  schema_version: string;
  module_id: string;
  content_version: string;
  program: string;
  level: string;
  level_label?: LocalizedText;
  title: LocalizedText;
  subtitle?: LocalizedText;
  mission_brief?: LocalizedText;
  settings: ModuleSettings;
  questions: Question[];
  brand?: Record<string, unknown>;
  tracking_policy?: Record<string, unknown>;
  gamification?: Record<string, unknown>;
  trainer_reporting?: Record<string, unknown>;
}
