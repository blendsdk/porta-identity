#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

    CREATE USER porta PASSWORD 'secret' SUPERUSER;
    CREATE DATABASE porta;
    GRANT ALL PRIVILEGES ON DATABASE porta TO porta;

    CREATE DATABASE porta_test;
    GRANT ALL PRIVILEGES ON DATABASE porta TO porta;
EOSQL