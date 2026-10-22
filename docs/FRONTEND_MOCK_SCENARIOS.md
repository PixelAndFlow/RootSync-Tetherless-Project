# Frontend mock scenarios

The current adapters remain mock-only. These controlled scenarios let the frontend exercise realistic states without deciding the final DDIL or API implementation.

| Scenario | Adapter control | Expected frontend behavior |
| --- | --- | --- |
| Demo setup | Code `DEMO-2026` and a valid username | Create synthetic profile; never redeem a real code or store tokens. |
| Invalid setup | Any code other than `DEMO-2026` | Show safe validation guidance; remain on setup. |
| Blocked authorization | `simulateBlockedAuthorization("revoked_device")` | Keep pending records; show paused authorization and disable sync retry, including offline. |
| Setup service unavailable | Omit optional `learnerSetup` from supplied gateways | Disable setup; never silently substitute a mock adapter. |
| Clipboard denied | Profile settings with clipboard unavailable | Keep learner code visible for manual copying. |
| Retryable sync failure | `simulateNextSyncFailure(reason)` | Show retry guidance; keep queued activity and the local record. |
| Rejected sync | `simulateNextSyncRejection(reason)` | Show review guidance; keep queued activity and never delete learning data. |
| Failed answer save | `simulateNextSaveFailure(reason)` | Do not reveal answer feedback; keep the question available and show a retry message. |
| Empty trainer cohort | `new MockTrainerDataGateway("empty_cohort")` | Show zero values and the trainer no-results state safely. |
| Trainer fixture failure | `new MockTrainerDataGateway("load_failure")` | Show the shared error state with a safe return route. |
| Unknown attempt | Existing mock gateway validation | Reject the operation rather than create or alter an unrelated attempt. |
| Malformed content | `validateModule(module)` | Block invalid fixture usage with clear author-facing errors. |

These controls are development/test helpers only. Do not add them to the production gateway contract or expose them in the production interface.
