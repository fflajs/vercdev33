-- reset.sql
-- ⚠️ WARNING: This will delete ALL data in your schema.
-- Run only in development/testing environment.

-- 1. Disable constraints temporarily
SET session_replication_role = replica;

-- 2. Truncate all tables in correct order (cascade ensures dependent rows are removed)
TRUNCATE TABLE person_roles CASCADE;
TRUNCATE TABLE organization_units CASCADE;
TRUNCATE TABLE iterations CASCADE;
TRUNCATE TABLE people CASCADE;

-- 3. Reset sequences (adjust names if your actual sequence names differ)
ALTER SEQUENCE people_id_seq RESTART WITH 1;
ALTER SEQUENCE iterations_id_seq RESTART WITH 1;
ALTER SEQUENCE organization_units_id_seq RESTART WITH 1;
ALTER SEQUENCE person_roles_id_seq RESTART WITH 1;

-- 4. Re-enable constraints
SET session_replication_role = DEFAULT;

-- ✅ Done. Your schema is clean and IDs will start again from 1.

