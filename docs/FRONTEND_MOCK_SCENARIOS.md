# Frontend mock scenarios

The current adapters remain mock-only. These controlled scenarios let the frontend exercise realistic states without deciding the final DDIL or API implementation.

| Scenario | Adapter control | Expected frontend behavior |
| --- | --- | --- |
| Retryable sync failure | `simulateNextSyncFailure(reason)` | Show retry guidance; keep queued activity and the local record. |
| Rejected sync | `simulateNextSyncRejection(reason)` | Show review guidance; keep queued activity and never delete learning data. |
| Empty trainer cohort | `new MockTrainerDataGateway("empty_cohort")` | Show zero values and the trainer no-results state safely. |
| Trainer fixture failure | `new MockTrainerDataGateway("load_failure")` | Show the shared error state with a safe return route. |
| Unknown attempt | Existing mock gateway validation | Reject the operation rather than create or alter an unrelated attempt. |
| Malformed content | `validateModule(module)` | Block invalid fixture usage with clear author-facing errors. |

These controls are development/test helpers only. Do not add them to the production gateway contract or expose them in the production interface.
