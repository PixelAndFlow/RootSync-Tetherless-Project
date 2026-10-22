-- Tetherless API database, migration 2 (API and Integration Spec v1.10).
-- Applied automatically at startup after migration 1, inside one transaction.
--
--   * trainers become staff with a role (superadmin, admin, trainer);
--     permissions per role live in role_permissions
--   * learners: first and last name entered by staff, contact fields, a unique
--     learner_code; username is chosen by the learner and is NOT unique
--   * shared cohort codes and re-link codes are replaced by one-time setup
--     codes per learner, stored only as hashes
--   * modules are published into the database; assignments; settings
--   * archive instead of delete; one audited purge path for privacy requests

-- ---------------------------------------------------------------- staff
ALTER TABLE trainers RENAME TO staff;
ALTER TABLE staff RENAME COLUMN trainer_id TO staff_id;
ALTER TABLE staff RENAME COLUMN name TO display_name;
ALTER TABLE staff ADD COLUMN role text NOT NULL DEFAULT 'trainer' CHECK (role IN ('superadmin', 'admin', 'trainer'));
ALTER TABLE staff ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN created_by uuid REFERENCES staff (staff_id);

ALTER TABLE trainer_sessions RENAME TO staff_sessions;
ALTER TABLE staff_sessions RENAME COLUMN trainer_id TO staff_id;
CREATE INDEX staff_sessions_by_staff ON staff_sessions (staff_id);

CREATE TABLE role_permissions (
  role        text NOT NULL CHECK (role IN ('superadmin', 'admin', 'trainer')),
  permission  text NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES staff (staff_id)
);

-- ---------------------------------------------------------------- cohorts
ALTER TABLE cohorts ADD COLUMN archived_at timestamptz;
CREATE UNIQUE INDEX cohorts_name_unique ON cohorts (lower(name));

-- ---------------------------------------------------------------- learners
ALTER TABLE learners DROP CONSTRAINT learners_cohort_id_username_key;
ALTER TABLE learners ALTER COLUMN username DROP NOT NULL;
ALTER TABLE learners
  ADD COLUMN first_name      text,
  ADD COLUMN last_name       text,
  ADD COLUMN learner_code    text,
  ADD COLUMN phone           text,
  ADD COLUMN email           text,
  ADD COLUMN training_level  text,
  ADD COLUMN note_1          text,
  ADD COLUMN note_2          text,
  ADD COLUMN created_by      uuid REFERENCES staff (staff_id),
  ADD COLUMN archived_at     timestamptz;

-- Existing trial learners: split the single name; give each a learner code.
UPDATE learners SET
  first_name = split_part(name, ' ', 1),
  last_name = coalesce(nullif(btrim(substr(name, length(split_part(name, ' ', 1)) + 1)), ''), '-');
UPDATE learners l SET learner_code =
  regexp_replace(btrim(c.name), '\s+', '-', 'g') || '-' || upper(substr(md5(l.learner_id::text), 1, 4))
  FROM cohorts c WHERE c.cohort_id = l.cohort_id;

ALTER TABLE learners ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE learners ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE learners ALTER COLUMN learner_code SET NOT NULL;
ALTER TABLE learners ADD CONSTRAINT learners_learner_code_key UNIQUE (learner_code);
ALTER TABLE learners DROP COLUMN name;
CREATE INDEX learners_by_cohort ON learners (cohort_id);

-- ---------------------------------------------------------------- setup codes
DROP TABLE enrollment_codes;

CREATE TABLE setup_codes (
  code_hash    text PRIMARY KEY,
  learner_id   uuid NOT NULL REFERENCES learners (learner_id),
  created_by   uuid REFERENCES staff (staff_id),
  created_at   timestamptz NOT NULL,
  used_at      timestamptz,
  replaced_at  timestamptz
);
CREATE INDEX setup_codes_by_learner ON setup_codes (learner_id);

-- ---------------------------------------------------------------- content
CREATE TABLE modules (
  module_id      text PRIMARY KEY,
  activity_type  text NOT NULL,
  created_by     uuid REFERENCES staff (staff_id),
  created_at     timestamptz NOT NULL,
  archived_at    timestamptz
);

-- Published versions never change (spec D-7).
CREATE TABLE module_versions (
  module_id        text NOT NULL REFERENCES modules (module_id),
  content_version  integer NOT NULL CHECK (content_version > 0),
  body             jsonb NOT NULL,
  published_by     uuid REFERENCES staff (staff_id),
  published_at     timestamptz NOT NULL,
  PRIMARY KEY (module_id, content_version)
);

CREATE TABLE assignments (
  assignment_id    uuid PRIMARY KEY,
  module_id        text NOT NULL REFERENCES modules (module_id),
  content_version  integer CHECK (content_version IS NULL OR content_version > 0),
  cohort_id        uuid REFERENCES cohorts (cohort_id),
  learner_id       uuid REFERENCES learners (learner_id),
  created_by       uuid REFERENCES staff (staff_id),
  created_at       timestamptz NOT NULL,
  removed_at       timestamptz,
  CHECK ((cohort_id IS NULL) <> (learner_id IS NULL))
);
CREATE INDEX assignments_by_cohort ON assignments (cohort_id);
CREATE INDEX assignments_by_learner ON assignments (learner_id);

CREATE TABLE roster_imports (
  import_id   uuid PRIMARY KEY,
  cohort_id   uuid NOT NULL REFERENCES cohorts (cohort_id),
  valid       boolean NOT NULL,
  rows        jsonb NOT NULL,
  created_by  uuid REFERENCES staff (staff_id),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  staff_id  uuid REFERENCES staff (staff_id),
  action    text NOT NULL,
  target    text NOT NULL,
  detail    jsonb,
  at        timestamptz NOT NULL
);

-- ---------------------------------------------------------------- privacy purge
-- Events stay append-only. The one exception is a Superadmin purge for a
-- privacy request, which sets tetherless.purge = 'on' for its own transaction
-- only (SET LOCAL) and is recorded in audit_log.
CREATE OR REPLACE FUNCTION events_are_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('tetherless.purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'events are append-only';
END;
$$;

INSERT INTO schema_migrations (version) VALUES (2);
