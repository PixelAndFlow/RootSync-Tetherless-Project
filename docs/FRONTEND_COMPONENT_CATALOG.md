# Frontend component catalog

This catalog documents the reusable frontend pieces that future screens should use rather than recreate.

| Component or token | Purpose | Required states / accessibility |
| --- | --- | --- |
| `ui-panel` | Standard contained surface | Visible boundary, dark panel background, shared elevation. |
| `ui-action` / `ui-action-secondary` | Primary and secondary actions | Minimum 44 px interaction height and visible keyboard focus. |
| `ui-eyebrow` | Small section label | Decorative context only; pair it with a meaningful heading. |
| `PageState` | Loading, empty, and error states | Loading uses polite status; error uses assertive status and safe return action. |
| `StatusChip` | Learner-friendly sync state | Uses a live status region; never expose queue IDs or backend internals. |
| `AnswerCard` | Learner answer choice | Color plus text/state; exposes selected, correct, and incorrect state to assistive technology. |
| `DisplayPreferences` | High contrast and reduced motion | Persists only in the local learner profile and never affects scores. |
| `StorageStatusCard` | Browser storage estimate | Must not promise durable offline persistence before DDIL storage is implemented. |

## Shared design rules

- Use the design tokens in `src/styles.css` for shared panels and actions.
- Keep status meaning in text, not color alone.
- Preserve 44 px minimum touch targets and visible focus indicators.
- Add a component test whenever behavior, a state change, or an accessible name is introduced.
- Keep production UI free of developer-only controls. The local reset tool is guarded by `import.meta.env.DEV`.
