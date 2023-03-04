CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DROP TABLE IF EXISTS sys_tenant CASCADE;
DROP TABLE IF EXISTS sys_user CASCADE;
DROP TABLE IF EXISTS sys_user_profile CASCADE;
DROP TABLE IF EXISTS sys_mfa CASCADE;
DROP TABLE IF EXISTS sys_user_mfa CASCADE;
DROP TABLE IF EXISTS sys_key CASCADE;
CREATE TABLE sys_tenant();
ALTER TABLE sys_tenant ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_tenant ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_tenant ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_tenant ADD COLUMN allow_reset_password boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN allow_registration boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN organization varchar NOT NULL;
ALTER TABLE sys_tenant ADD PRIMARY KEY (id);
ALTER TABLE sys_tenant ADD UNIQUE (name);
CREATE TABLE sys_user();
ALTER TABLE sys_user ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user ADD COLUMN username varchar NOT NULL;
ALTER TABLE sys_user ADD COLUMN password varchar NOT NULL;
ALTER TABLE sys_user ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_user ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_user ADD PRIMARY KEY (id);
ALTER TABLE sys_user ADD UNIQUE (username);
CREATE TABLE sys_user_profile();
ALTER TABLE sys_user_profile ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_profile ADD COLUMN firstname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN lastname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN avatar varchar;
ALTER TABLE sys_user_profile ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_profile ADD COLUMN date_created date  DEFAULT now();
ALTER TABLE sys_user_profile ADD COLUMN date_changed date  DEFAULT now();
ALTER TABLE sys_user_profile ADD PRIMARY KEY (id);
CREATE TABLE sys_mfa();
ALTER TABLE sys_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_mfa ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_mfa ADD COLUMN settings jsonb;
ALTER TABLE sys_mfa ADD PRIMARY KEY (id);
CREATE TABLE sys_user_mfa();
ALTER TABLE sys_user_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD COLUMN mfa_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD PRIMARY KEY (id);
CREATE TABLE sys_key();
ALTER TABLE sys_key ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_key ADD COLUMN key_type varchar NOT NULL;
ALTER TABLE sys_key ADD COLUMN key_id varchar NOT NULL;
ALTER TABLE sys_key ADD COLUMN data varchar NOT NULL;
ALTER TABLE sys_key ADD PRIMARY KEY (id);
ALTER TABLE sys_key ADD UNIQUE (key_id);
ALTER TABLE sys_user_profile ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (mfa_id) REFERENCES sys_mfa (id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP VIEW IF EXISTS sys_user_mfa_view CASCADE;
CREATE OR REPLACE VIEW sys_user_mfa_view AS select
    su.id as user_id,
    sm.id as mfa_id,
    sm.name as mfa_name,
    sm.settings as mfa_settings
from
    sys_user_mfa um
    inner join sys_mfa sm on sm.id = um.mfa_id
    inner join sys_user su on su.id = um.user_id;
DROP TABLE IF EXISTS sys_tenant CASCADE;
DROP TABLE IF EXISTS sys_user CASCADE;
DROP TABLE IF EXISTS sys_user_profile CASCADE;
DROP TABLE IF EXISTS sys_mfa CASCADE;
DROP TABLE IF EXISTS sys_user_mfa CASCADE;
DROP TABLE IF EXISTS sys_key CASCADE;
CREATE TABLE sys_tenant();
ALTER TABLE sys_tenant ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_tenant ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_tenant ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_tenant ADD COLUMN allow_reset_password boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN allow_registration boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN organization varchar NOT NULL;
ALTER TABLE sys_tenant ADD PRIMARY KEY (id);
ALTER TABLE sys_tenant ADD UNIQUE (name);
CREATE TABLE sys_user();
ALTER TABLE sys_user ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user ADD COLUMN username varchar NOT NULL;
ALTER TABLE sys_user ADD COLUMN password varchar NOT NULL;
ALTER TABLE sys_user ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_user ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_user ADD PRIMARY KEY (id);
ALTER TABLE sys_user ADD UNIQUE (username);
CREATE TABLE sys_user_profile();
ALTER TABLE sys_user_profile ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_profile ADD COLUMN firstname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN lastname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN avatar varchar;
ALTER TABLE sys_user_profile ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_profile ADD COLUMN date_created date  DEFAULT now();
ALTER TABLE sys_user_profile ADD COLUMN date_changed date  DEFAULT now();
ALTER TABLE sys_user_profile ADD PRIMARY KEY (id);
CREATE TABLE sys_mfa();
ALTER TABLE sys_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_mfa ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_mfa ADD COLUMN settings jsonb;
ALTER TABLE sys_mfa ADD PRIMARY KEY (id);
CREATE TABLE sys_user_mfa();
ALTER TABLE sys_user_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD COLUMN mfa_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD PRIMARY KEY (id);
CREATE TABLE sys_key();
ALTER TABLE sys_key ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_key ADD COLUMN key_type varchar NOT NULL;
ALTER TABLE sys_key ADD COLUMN key_id varchar NOT NULL;
ALTER TABLE sys_key ADD COLUMN data varchar NOT NULL;
ALTER TABLE sys_key ADD PRIMARY KEY (id);
ALTER TABLE sys_key ADD UNIQUE (key_id);
ALTER TABLE sys_user_profile ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (mfa_id) REFERENCES sys_mfa (id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP VIEW IF EXISTS sys_user_mfa_view CASCADE;
CREATE OR REPLACE VIEW sys_user_mfa_view AS select
    su.id as user_id,
    sm.id as mfa_id,
    sm.name as mfa_name,
    sm.settings as mfa_settings
from
    sys_user_mfa um
    inner join sys_mfa sm on sm.id = um.mfa_id
    inner join sys_user su on su.id = um.user_id