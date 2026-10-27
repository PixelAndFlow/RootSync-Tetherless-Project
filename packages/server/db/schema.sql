-- Tetherless API database, migration 1.
-- Applied automatically by the server at startup (PgStore.migrate) inside one transaction.
-- Rules enforced here as well as in code:
--   * events are inserted once by event_id and never updated or deleted
--   * a username is unique within its cohort
--   * device tokens are stored only as SHA-256 hashes

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     integer PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trainers (
  trainer_id     uuid PRIMARY KEY,
  username       text NOT NULL UNIQUE,
  name           text NOT NULL,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  disabled_at    timestamptz
);

CREATE TABLE trainer_sessions (
  token_hash  text PRIMARY KEY,
  trainer_id  uuid NOT NULL REFERENCES trainers (trainer_id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cohorts (
  cohort_id   uuid PRIMARY KEY,
  name        text NOT NULL,
  created_by  uuid REFERENCES trainers (trainer_id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learners (
  learner_id  uuid PRIMARY KEY,
  cohort_id   uuid NOT NULL REFERENCES cohorts (cohort_id),
  name        text NOT NULL,
  username    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, username)
);

CREATE TABLE enrollment_codes (
  code        text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('cohort', 'relink')),
  cohort_id   uuid NOT NULL REFERENCES cohorts (cohort_id),
  learner_id  uuid REFERENCES learners (learner_id),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  max_uses    integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'relink') = (learner_id IS NOT NULL))
);

CREATE TABLE devices (
  device_id   uuid PRIMARY KEY,
  learner_id  uuid NOT NULL REFERENCES learners (learner_id),
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

CREATE TABLE events (
  event_id      uuid PRIMARY KEY,
  learner_id    uuid NOT NULL REFERENCES learners (learner_id),
  device_id     uuid NOT NULL REFERENCES devices (device_id),
  device_seq    bigint NOT NULL CHECK (device_seq > 0),
  event_type    text NOT NULL,
  occurred_at   timestamptz NOT NULL,
  received_at   timestamptz NOT NULL,
  content_hash  text NOT NULL,
  body          jsonb NOT NULL
);
CREATE INDEX events_by_learner ON events (learner_id, device_id, device_seq);

CREATE TABLE rejected_events (
  id           bigserial PRIMARY KEY,
  raw_hash     text NOT NULL UNIQUE,
  event_id     text,
  learner_id   uuid NOT NULL REFERENCES learners (learner_id),
  device_id    uuid NOT NULL REFERENCES devices (device_id),
  code         text NOT NULL,
  message      text NOT NULL,
  raw          jsonb,
  received_at  timestamptz NOT NULL
);
CREATE INDEX rejected_by_learner ON rejected_events (learner_id);

-- Events are evidence: never edit or delete them.
CREATE FUNCTION events_are_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events are append-only';
END;
$$;
CREATE TRIGGER events_no_update BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_are_append_only();

INSERT INTO schema_migrations (version) VALUES (1);
