-- Tetherless API database, migration 3.
-- Applied automatically at startup after migration 2, inside one transaction.
--
-- events.event_type was plain text, so the API's validation was the only thing
-- keeping unknown event types out. The database now refuses them too. The list
-- must equal EVENT_TYPES in packages/contract/src/index.ts; a test fails if the
-- two drift (packages/server/test/event-type-constraint.test.ts).
--
-- Adding a constraint does not fire the append-only trigger (that is a row
-- trigger on UPDATE and DELETE), and every stored event already passed the
-- contract's validator, so existing rows satisfy it.

ALTER TABLE events ADD CONSTRAINT events_event_type_known CHECK (event_type IN (
  'session_started',
  'visibility_changed',
  'heartbeat',
  'session_ended',
  'attempt_started',
  'answer_submitted',
  'attempt_completed',
  'attempt_abandoned'
));
