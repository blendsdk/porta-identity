CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DROP TABLE IF EXISTS sys_tenant CASCADE;
DROP TABLE IF EXISTS sys_user CASCADE;
DROP TABLE IF EXISTS sys_user_profile CASCADE;
DROP TABLE IF EXISTS sys_group CASCADE;
DROP TABLE IF EXISTS sys_user_group CASCADE;
DROP TABLE IF EXISTS sys_permission CASCADE;
DROP TABLE IF EXISTS sys_group_permission CASCADE;
DROP TABLE IF EXISTS sys_client CASCADE;
DROP TABLE IF EXISTS sys_client_type CASCADE;
DROP TABLE IF EXISTS sys_redirect CASCADE;
DROP TABLE IF EXISTS sys_confidential_client CASCADE;
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
CREATE TABLE sys_group();
ALTER TABLE sys_group ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_group ADD COLUMN description varchar NOT NULL;
ALTER TABLE sys_group ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_group ADD PRIMARY KEY (id);
ALTER TABLE sys_group ADD UNIQUE (name);
CREATE TABLE sys_user_group();
ALTER TABLE sys_user_group ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_group ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_group ADD COLUMN group_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_group ADD PRIMARY KEY (id);
ALTER TABLE sys_user_group ADD UNIQUE (user_id,group_id);
CREATE TABLE sys_permission();
ALTER TABLE sys_permission ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_permission ADD COLUMN code varchar NOT NULL;
ALTER TABLE sys_permission ADD COLUMN description varchar NOT NULL;
ALTER TABLE sys_permission ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_permission ADD PRIMARY KEY (id);
ALTER TABLE sys_permission ADD UNIQUE (code);
CREATE TABLE sys_group_permission();
ALTER TABLE sys_group_permission ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group_permission ADD COLUMN group_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group_permission ADD COLUMN permission_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group_permission ADD PRIMARY KEY (id);
ALTER TABLE sys_group_permission ADD UNIQUE (group_id,permission_id);
CREATE TABLE sys_client();
ALTER TABLE sys_client ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client ADD COLUMN client_id varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN client_type_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client ADD COLUMN logo varchar;
ALTER TABLE sys_client ADD COLUMN fallback_uri varchar;
ALTER TABLE sys_client ADD COLUMN description varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN secret varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_client ADD COLUMN session_length integer;
ALTER TABLE sys_client ADD COLUMN valid_from timestamp without time zone;
ALTER TABLE sys_client ADD COLUMN valid_until timestamp without time zone;
ALTER TABLE sys_client ADD PRIMARY KEY (id);
ALTER TABLE sys_client ADD UNIQUE (client_id);
CREATE TABLE sys_client_type();
ALTER TABLE sys_client_type ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client_type ADD COLUMN client_type varchar NOT NULL;
ALTER TABLE sys_client_type ADD COLUMN description varchar;
ALTER TABLE sys_client_type ADD PRIMARY KEY (id);
CREATE TABLE sys_redirect();
ALTER TABLE sys_redirect ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_redirect ADD COLUMN client_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_redirect ADD COLUMN redirect_uri varchar;
ALTER TABLE sys_redirect ADD COLUMN logout_uri varchar;
ALTER TABLE sys_redirect ADD COLUMN ios_bundle_id varchar;
ALTER TABLE sys_redirect ADD COLUMN android_package_name varchar;
ALTER TABLE sys_redirect ADD COLUMN android_signature_hash varchar;
ALTER TABLE sys_redirect ADD PRIMARY KEY (id);
CREATE TABLE sys_confidential_client();
ALTER TABLE sys_confidential_client ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_confidential_client ADD COLUMN client_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_confidential_client ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_confidential_client ADD PRIMARY KEY (id);
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
ALTER TABLE sys_user_group ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_group ADD FOREIGN KEY (group_id) REFERENCES sys_group (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_group_permission ADD FOREIGN KEY (group_id) REFERENCES sys_group (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_group_permission ADD FOREIGN KEY (permission_id) REFERENCES sys_permission (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_client ADD FOREIGN KEY (client_type_id) REFERENCES sys_client_type (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_redirect ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_confidential_client ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_confidential_client ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (mfa_id) REFERENCES sys_mfa (id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP VIEW IF EXISTS sys_authorization_view CASCADE;
CREATE OR REPLACE VIEW sys_authorization_view AS select
    scc.user_id confidential_user_id,
    sc.client_id as client_id,
    sc.secret as client_secret,
    sc.session_length,
    ct.client_type,
    sr.redirect_uri,
    sr.logout_uri,
    sr.ios_bundle_id,
    sr.android_package_name,
    sr.android_signature_hash,
    sc.logo,
    sc.fallback_uri
from
    sys_client sc
    left join sys_redirect sr on sr.client_id = sc.id
    inner join sys_client_type ct on sc.client_type_id = ct.id
    left outer join sys_confidential_client scc on scc.client_id = sc.id;
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
DROP VIEW IF EXISTS sys_user_permission_view CASCADE;
CREATE OR REPLACE VIEW sys_user_permission_view AS select
    sug.user_id,
    sgp.permission_id,
    sp.code,
    sp.is_active
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id
    inner join sys_group_permission sgp on sgp.group_id = sg.id
    inner join sys_permission sp on sp.id = sgp.permission_id;
DROP VIEW IF EXISTS sys_groups_by_user_view CASCADE;
CREATE OR REPLACE VIEW sys_groups_by_user_view AS select
    sg.*,
    sug.user_id
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id;
DROP TABLE IF EXISTS sys_tenant CASCADE;
DROP TABLE IF EXISTS sys_user CASCADE;
DROP TABLE IF EXISTS sys_user_profile CASCADE;
DROP TABLE IF EXISTS sys_group CASCADE;
DROP TABLE IF EXISTS sys_user_group CASCADE;
DROP TABLE IF EXISTS sys_permission CASCADE;
DROP TABLE IF EXISTS sys_group_permission CASCADE;
DROP TABLE IF EXISTS sys_client CASCADE;
DROP TABLE IF EXISTS sys_client_type CASCADE;
DROP TABLE IF EXISTS sys_redirect CASCADE;
DROP TABLE IF EXISTS sys_confidential_client CASCADE;
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
CREATE TABLE sys_group();
ALTER TABLE sys_group ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_group ADD COLUMN description varchar NOT NULL;
ALTER TABLE sys_group ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_group ADD PRIMARY KEY (id);
ALTER TABLE sys_group ADD UNIQUE (name);
CREATE TABLE sys_user_group();
ALTER TABLE sys_user_group ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_group ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_group ADD COLUMN group_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_group ADD PRIMARY KEY (id);
ALTER TABLE sys_user_group ADD UNIQUE (user_id,group_id);
CREATE TABLE sys_permission();
ALTER TABLE sys_permission ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_permission ADD COLUMN code varchar NOT NULL;
ALTER TABLE sys_permission ADD COLUMN description varchar NOT NULL;
ALTER TABLE sys_permission ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_permission ADD PRIMARY KEY (id);
ALTER TABLE sys_permission ADD UNIQUE (code);
CREATE TABLE sys_group_permission();
ALTER TABLE sys_group_permission ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group_permission ADD COLUMN group_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group_permission ADD COLUMN permission_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_group_permission ADD PRIMARY KEY (id);
ALTER TABLE sys_group_permission ADD UNIQUE (group_id,permission_id);
CREATE TABLE sys_client();
ALTER TABLE sys_client ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client ADD COLUMN client_id varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN client_type_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client ADD COLUMN logo varchar;
ALTER TABLE sys_client ADD COLUMN fallback_uri varchar;
ALTER TABLE sys_client ADD COLUMN description varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN secret varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_client ADD COLUMN session_length integer;
ALTER TABLE sys_client ADD COLUMN valid_from timestamp without time zone;
ALTER TABLE sys_client ADD COLUMN valid_until timestamp without time zone;
ALTER TABLE sys_client ADD PRIMARY KEY (id);
ALTER TABLE sys_client ADD UNIQUE (client_id);
CREATE TABLE sys_client_type();
ALTER TABLE sys_client_type ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client_type ADD COLUMN client_type varchar NOT NULL;
ALTER TABLE sys_client_type ADD COLUMN description varchar;
ALTER TABLE sys_client_type ADD PRIMARY KEY (id);
CREATE TABLE sys_redirect();
ALTER TABLE sys_redirect ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_redirect ADD COLUMN client_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_redirect ADD COLUMN redirect_uri varchar;
ALTER TABLE sys_redirect ADD COLUMN logout_uri varchar;
ALTER TABLE sys_redirect ADD COLUMN ios_bundle_id varchar;
ALTER TABLE sys_redirect ADD COLUMN android_package_name varchar;
ALTER TABLE sys_redirect ADD COLUMN android_signature_hash varchar;
ALTER TABLE sys_redirect ADD PRIMARY KEY (id);
CREATE TABLE sys_confidential_client();
ALTER TABLE sys_confidential_client ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_confidential_client ADD COLUMN client_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_confidential_client ADD COLUMN user_id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_confidential_client ADD PRIMARY KEY (id);
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
ALTER TABLE sys_user_group ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_group ADD FOREIGN KEY (group_id) REFERENCES sys_group (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_group_permission ADD FOREIGN KEY (group_id) REFERENCES sys_group (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_group_permission ADD FOREIGN KEY (permission_id) REFERENCES sys_permission (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_client ADD FOREIGN KEY (client_type_id) REFERENCES sys_client_type (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_redirect ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_confidential_client ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_confidential_client ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (mfa_id) REFERENCES sys_mfa (id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP VIEW IF EXISTS sys_authorization_view CASCADE;
CREATE OR REPLACE VIEW sys_authorization_view AS select
    scc.user_id confidential_user_id,
    sc.client_id as client_id,
    sc.secret as client_secret,
    sc.session_length,
    ct.client_type,
    sr.redirect_uri,
    sr.logout_uri,
    sr.ios_bundle_id,
    sr.android_package_name,
    sr.android_signature_hash,
    sc.logo,
    sc.fallback_uri
from
    sys_client sc
    left join sys_redirect sr on sr.client_id = sc.id
    inner join sys_client_type ct on sc.client_type_id = ct.id
    left outer join sys_confidential_client scc on scc.client_id = sc.id;
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
DROP VIEW IF EXISTS sys_groups_by_user_view CASCADE;
CREATE OR REPLACE VIEW sys_groups_by_user_view AS select
    sg.*,
    sug.user_id
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id;
DROP VIEW IF EXISTS sys_user_permission_view CASCADE;
CREATE OR REPLACE VIEW sys_user_permission_view AS select
    sug.user_id,
    sgp.permission_id,
    sp.code,
    sp.is_active
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id
    inner join sys_group_permission sgp on sgp.group_id = sg.id
    inner join sys_permission sp on sp.id = sgp.permission_id