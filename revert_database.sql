-- ====================================================================
-- File: revert_database.sql
-- Description: Drops the current development database and recreates it
--              from the gaussdb_dev1 backup.
-- To be run by a PostgreSQL superuser (e.g., 'postgres').
-- ====================================================================

-- Step 1: Drop the existing development database.
-- The (FORCE) option is added to disconnect any active users.
DROP DATABASE IF EXISTS gaussdb_dev WITH (FORCE);

-- Step 2: Create a new development database using the backup as a template.
-- This copies all tables, data, and permissions from gaussdb_dev1.
CREATE DATABASE gaussdb_dev WITH TEMPLATE gaussdb_dev1 OWNER gaussadm;

-- Step 3: Inform the user of completion.
\echo 'Database gaussdb_dev has been successfully reverted from backup.'

-- 
-- ```
-- 
-- ### **How to Execute the Script**
-- 
-- After you have saved the file, please run the following single command in your server's terminal. This command will execute the script as the `postgres` superuser, which has the necessary permissions.
-- 
-- ```bash
-- sudo -u postgres psql -f /home/fla/REP/repodev33/revert_database.sql
-- 
