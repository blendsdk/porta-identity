-- docker/init-test-db.sql
--
-- Creates the test database on first container startup.
-- The porta_test database is used exclusively by integration, E2E,
-- and penetration tests — never for development or production.
--
-- This script runs automatically via the PostgreSQL Docker entrypoint
-- when the container initializes. To re-run after the container already
-- exists, destroy volumes first: docker compose down -v && docker compose up -d
CREATE DATABASE porta_test;
GRANT ALL PRIVILEGES ON DATABASE porta_test TO porta;
