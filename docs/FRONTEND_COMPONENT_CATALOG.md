# Frontend component catalog

This catalog documents the reusable frontend pieces that future screens should use rather than recreate.

| Component or token | Purpose | Required states / accessibility |
| --- | --- | --- |
| `ui-panel` | Standard contained surface | Visible boundary, theme-aware VS Code-style panel background, shared elevation. |
| `ui-action` / `ui-action-secondary` | Primary and secondary actions | Minimum 44 px interaction height and visible keyboard focus. |
| `ui-eyebrow` | Small section label | Decorative context only; pair it with a meaningful heading. |
| `PageState` | Loading, empty, and error states | Loading uses polite status; error uses assertive status and safe return action. |
| `StatusChip` | Learner-friendly sync state | Uses a live status region; never expose queue IDs or backend internals. |
| `AnswerCard` | Learner answer choice | Kahoot-format questions retain their red/blue/amber/teal cards before and after feedback. Correct and incorrect states add non-colour indicators and accessible labels; other question types use neutral themed cards. Supports a disabled saving state to prevent duplicate submissions. |
| `DisplayPreferences` | High contrast, reduced motion, dark mode, and light mode | Persists only in the local learner profile, follows no system setting, and never affects scores. |
| `EngagementStrip` | XP, streak, and best-streak summary | Uses a neutral app-background fill, RCO-purple outline, and primary-title text colour in both themes. XP is engagement-only. |
| `SpanishAssistToggle` | Learner-controlled bilingual aid | Uses the shared outlined mission-control treatment with RCO-magenta text; its state is communicated through its accessible pressed value and label. |
| `SectorIcon` | Shared sector symbol | Supplies the same purple line icon for each sector on the mission map and in-mission checkpoints. Decorative icons are hidden from assistive technology because adjacent text provides the meaning. |
| `StorageStatusCard` | Browser storage estimate | Must not promise durable offline persistence before DDIL storage is implemented. |

## Shared design rules

- Use the design tokens in `src/styles.css` for shared panels and actions. The default palette is VS Code-style black/gray with RCO purple (`#5A1EE4`) and magenta (`#C143C0`) accents; do not introduce cyan or unrelated decorative colours outside the scoped Kahoot cards.
- Keep status meaning in text, not color alone.
- Verify both explicit themes when adding a new surface, text treatment, or status state; pale dark-mode accent text is not automatically safe on light surfaces.
- Preserve 44 px minimum touch targets and visible focus indicators.
- Add a component test whenever behavior, a state change, or an accessible name is introduced.
- Keep production UI free of developer-only controls. The local reset tool is guarded by `import.meta.env.DEV`.
