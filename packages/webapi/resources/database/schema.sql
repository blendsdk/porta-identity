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
DROP TABLE IF EXISTS sys_session CASCADE;
DROP TABLE IF EXISTS sys_access_token CASCADE;
DROP TABLE IF EXISTS sys_refresh_token CASCADE;
DROP TABLE IF EXISTS sys_mfa CASCADE;
DROP TABLE IF EXISTS sys_user_mfa CASCADE;
DROP TABLE IF EXISTS sys_key CASCADE;
CREATE TABLE sys_tenant();
ALTER TABLE sys_tenant ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_tenant ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_tenant ADD COLUMN database varchar NOT NULL;
ALTER TABLE sys_tenant ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_tenant ADD COLUMN allow_reset_password boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN allow_registration boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN organization varchar NOT NULL;
ALTER TABLE sys_tenant ADD PRIMARY KEY (id);
ALTER TABLE sys_tenant ADD UNIQUE (name);
ALTER TABLE sys_tenant ADD UNIQUE (database);
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
ALTER TABLE sys_user_profile ADD COLUMN email varchar;
ALTER TABLE sys_user_profile ADD COLUMN firstname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN lastname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN avatar varchar;
ALTER TABLE sys_user_profile ADD COLUMN user_id uuid NOT NULL;
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
ALTER TABLE sys_user_group ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_user_group ADD COLUMN group_id uuid NOT NULL;
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
ALTER TABLE sys_group_permission ADD COLUMN group_id uuid NOT NULL;
ALTER TABLE sys_group_permission ADD COLUMN permission_id uuid NOT NULL;
ALTER TABLE sys_group_permission ADD PRIMARY KEY (id);
ALTER TABLE sys_group_permission ADD UNIQUE (group_id,permission_id);
CREATE TABLE sys_client();
ALTER TABLE sys_client ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client ADD COLUMN client_id varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN client_type varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN logo varchar;
ALTER TABLE sys_client ADD COLUMN application_name varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_client ADD COLUMN description varchar;
ALTER TABLE sys_client ADD COLUMN secret varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_client ADD COLUMN access_token_ttl integer;
ALTER TABLE sys_client ADD COLUMN refresh_token_ttl integer;
ALTER TABLE sys_client ADD COLUMN valid_from timestamp without time zone  DEFAULT now();
ALTER TABLE sys_client ADD COLUMN valid_until timestamp without time zone;
ALTER TABLE sys_client ADD COLUMN redirect_uri varchar;
ALTER TABLE sys_client ADD COLUMN client_credentials_user_id uuid;
ALTER TABLE sys_client ADD COLUMN post_logout_redirect_uri varchar;
ALTER TABLE sys_client ADD COLUMN is_back_channel_post_logout boolean  DEFAULT false;
ALTER TABLE sys_client ADD PRIMARY KEY (id);
ALTER TABLE sys_client ADD UNIQUE (client_id);
CREATE TABLE sys_session();
ALTER TABLE sys_session ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_session ADD COLUMN session_id varchar NOT NULL;
ALTER TABLE sys_session ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_session ADD COLUMN client_id uuid NOT NULL;
ALTER TABLE sys_session ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_session ADD PRIMARY KEY (id);
ALTER TABLE sys_session ADD UNIQUE (user_id,client_id);
CREATE TABLE sys_access_token();
ALTER TABLE sys_access_token ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_access_token ADD COLUMN ttl integer NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN refresh_ttl integer NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN auth_time integer NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_access_token ADD COLUMN auth_request_params jsonb;
ALTER TABLE sys_access_token ADD COLUMN access_token varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_access_token ADD COLUMN session_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN client_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN tenant_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD PRIMARY KEY (id);
ALTER TABLE sys_access_token ADD UNIQUE (access_token);
CREATE TABLE sys_refresh_token();
ALTER TABLE sys_refresh_token ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_refresh_token ADD COLUMN ttl integer NOT NULL;
ALTER TABLE sys_refresh_token ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_refresh_token ADD COLUMN refresh_token varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_refresh_token ADD COLUMN access_token_id uuid NOT NULL;
ALTER TABLE sys_refresh_token ADD PRIMARY KEY (id);
ALTER TABLE sys_refresh_token ADD UNIQUE (refresh_token);
CREATE TABLE sys_mfa();
ALTER TABLE sys_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_mfa ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_mfa ADD COLUMN settings jsonb;
ALTER TABLE sys_mfa ADD PRIMARY KEY (id);
CREATE TABLE sys_user_mfa();
ALTER TABLE sys_user_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_user_mfa ADD COLUMN mfa_id uuid NOT NULL;
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
ALTER TABLE sys_client ADD FOREIGN KEY (client_credentials_user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_session ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_session ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (session_id) REFERENCES sys_session (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (tenant_id) REFERENCES sys_tenant (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_refresh_token ADD FOREIGN KEY (access_token_id) REFERENCES sys_access_token (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (mfa_id) REFERENCES sys_mfa (id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP VIEW IF EXISTS sys_authorization_view CASCADE;
CREATE OR REPLACE VIEW sys_authorization_view AS select
    sc.*,
    row_to_json(su) as client_credentials_user
from
    sys_client sc
    left outer join sys_user su on sc.client_credentials_user_id = su.id
where
    (
        valid_from is null
        or now() >= valid_from
    )
    and (
        valid_until is null
        or now() < valid_until
    );
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
DROP VIEW IF EXISTS sys_refresh_token_view CASCADE;
CREATE OR REPLACE VIEW sys_refresh_token_view AS select
    rt.id,
    rt.ttl,
    rt.refresh_token,
    at.access_token,
    rt.date_created + ( rt.ttl || ' seconds')::interval < now() as is_expire,
    rt.date_created + ( rt.ttl || ' seconds')::interval expire_at
from
    sys_refresh_token rt
    inner join sys_access_token at on at.id = rt.access_token_id;
DROP VIEW IF EXISTS sys_access_token_view CASCADE;
CREATE OR REPLACE VIEW sys_access_token_view AS select
	sat.*,
	sat.date_created + (ttl || ' seconds') :: interval < now() as is_expired,
	sat.date_created + (refresh_ttl || ' seconds') :: interval < now() as is_revoke,
	sat.date_created + (ttl || ' seconds') :: interval as expire_at,
	sat.date_created + (refresh_ttl || ' seconds') :: interval as revoke_at,
	row_to_json(su) as user,
	row_to_json(sup) as profile,
	row_to_json(sc) as client,
	row_to_json(st) as tenant,
	row_to_json(se) as session
from
	sys_access_token sat
	inner join sys_user su on sat.user_id = su.id
	inner join sys_user_profile sup on sup.user_id = su.id
	inner join sys_client sc on sc.id = sat.client_id
	inner join sys_tenant st on st.id = sat.tenant_id
	inner join sys_session se on se.id = sat.session_id
where
	st.is_active = true
	and sc.is_active = true
	and su.is_active = true;
DROP VIEW IF EXISTS sys_session_view CASCADE;
CREATE OR REPLACE VIEW sys_session_view AS select
    se.*,
    cl.client_id as oidc_client_id,
    cl.post_logout_redirect_uri,
    cl.is_back_channel_post_logout,
    us.id as oidc_sub_claim,
    row_to_json(cl) as client,
    row_to_json(us) as user
from
    sys_session se
    inner join sys_client cl on cl.id = se.client_id
    inner join sys_user us on us.id = se.user_id;
DROP TABLE IF EXISTS sys_tenant CASCADE;
DROP TABLE IF EXISTS sys_user CASCADE;
DROP TABLE IF EXISTS sys_user_profile CASCADE;
DROP TABLE IF EXISTS sys_group CASCADE;
DROP TABLE IF EXISTS sys_user_group CASCADE;
DROP TABLE IF EXISTS sys_permission CASCADE;
DROP TABLE IF EXISTS sys_group_permission CASCADE;
DROP TABLE IF EXISTS sys_client CASCADE;
DROP TABLE IF EXISTS sys_session CASCADE;
DROP TABLE IF EXISTS sys_access_token CASCADE;
DROP TABLE IF EXISTS sys_refresh_token CASCADE;
DROP TABLE IF EXISTS sys_mfa CASCADE;
DROP TABLE IF EXISTS sys_user_mfa CASCADE;
DROP TABLE IF EXISTS sys_key CASCADE;
CREATE TABLE sys_tenant();
ALTER TABLE sys_tenant ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_tenant ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_tenant ADD COLUMN database varchar NOT NULL;
ALTER TABLE sys_tenant ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_tenant ADD COLUMN allow_reset_password boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN allow_registration boolean  DEFAULT false;
ALTER TABLE sys_tenant ADD COLUMN organization varchar NOT NULL;
ALTER TABLE sys_tenant ADD PRIMARY KEY (id);
ALTER TABLE sys_tenant ADD UNIQUE (name);
ALTER TABLE sys_tenant ADD UNIQUE (database);
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
ALTER TABLE sys_user_profile ADD COLUMN email varchar;
ALTER TABLE sys_user_profile ADD COLUMN firstname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN lastname varchar NOT NULL;
ALTER TABLE sys_user_profile ADD COLUMN avatar varchar;
ALTER TABLE sys_user_profile ADD COLUMN user_id uuid NOT NULL;
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
ALTER TABLE sys_user_group ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_user_group ADD COLUMN group_id uuid NOT NULL;
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
ALTER TABLE sys_group_permission ADD COLUMN group_id uuid NOT NULL;
ALTER TABLE sys_group_permission ADD COLUMN permission_id uuid NOT NULL;
ALTER TABLE sys_group_permission ADD PRIMARY KEY (id);
ALTER TABLE sys_group_permission ADD UNIQUE (group_id,permission_id);
CREATE TABLE sys_client();
ALTER TABLE sys_client ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_client ADD COLUMN client_id varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN client_type varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN logo varchar;
ALTER TABLE sys_client ADD COLUMN application_name varchar NOT NULL;
ALTER TABLE sys_client ADD COLUMN is_active boolean  DEFAULT true;
ALTER TABLE sys_client ADD COLUMN description varchar;
ALTER TABLE sys_client ADD COLUMN secret varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_client ADD COLUMN access_token_ttl integer;
ALTER TABLE sys_client ADD COLUMN refresh_token_ttl integer;
ALTER TABLE sys_client ADD COLUMN valid_from timestamp without time zone  DEFAULT now();
ALTER TABLE sys_client ADD COLUMN valid_until timestamp without time zone;
ALTER TABLE sys_client ADD COLUMN redirect_uri varchar;
ALTER TABLE sys_client ADD COLUMN client_credentials_user_id uuid;
ALTER TABLE sys_client ADD COLUMN post_logout_redirect_uri varchar;
ALTER TABLE sys_client ADD COLUMN is_back_channel_post_logout boolean  DEFAULT false;
ALTER TABLE sys_client ADD PRIMARY KEY (id);
ALTER TABLE sys_client ADD UNIQUE (client_id);
CREATE TABLE sys_session();
ALTER TABLE sys_session ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_session ADD COLUMN session_id varchar NOT NULL;
ALTER TABLE sys_session ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_session ADD COLUMN client_id uuid NOT NULL;
ALTER TABLE sys_session ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_session ADD PRIMARY KEY (id);
ALTER TABLE sys_session ADD UNIQUE (user_id,client_id);
CREATE TABLE sys_access_token();
ALTER TABLE sys_access_token ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_access_token ADD COLUMN ttl integer NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN refresh_ttl integer NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN auth_time integer NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_access_token ADD COLUMN auth_request_params jsonb;
ALTER TABLE sys_access_token ADD COLUMN access_token varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_access_token ADD COLUMN session_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN client_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD COLUMN tenant_id uuid NOT NULL;
ALTER TABLE sys_access_token ADD PRIMARY KEY (id);
ALTER TABLE sys_access_token ADD UNIQUE (access_token);
CREATE TABLE sys_refresh_token();
ALTER TABLE sys_refresh_token ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_refresh_token ADD COLUMN ttl integer NOT NULL;
ALTER TABLE sys_refresh_token ADD COLUMN date_created timestamp without time zone  DEFAULT now();
ALTER TABLE sys_refresh_token ADD COLUMN refresh_token varchar  DEFAULT encode(digest(md5(random()::text), 'sha1'::text),'hex');
ALTER TABLE sys_refresh_token ADD COLUMN access_token_id uuid NOT NULL;
ALTER TABLE sys_refresh_token ADD PRIMARY KEY (id);
ALTER TABLE sys_refresh_token ADD UNIQUE (refresh_token);
CREATE TABLE sys_mfa();
ALTER TABLE sys_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_mfa ADD COLUMN name varchar NOT NULL;
ALTER TABLE sys_mfa ADD COLUMN settings jsonb;
ALTER TABLE sys_mfa ADD PRIMARY KEY (id);
CREATE TABLE sys_user_mfa();
ALTER TABLE sys_user_mfa ADD COLUMN id uuid NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE sys_user_mfa ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE sys_user_mfa ADD COLUMN mfa_id uuid NOT NULL;
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
ALTER TABLE sys_client ADD FOREIGN KEY (client_credentials_user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_session ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_session ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (session_id) REFERENCES sys_session (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (client_id) REFERENCES sys_client (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_access_token ADD FOREIGN KEY (tenant_id) REFERENCES sys_tenant (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_refresh_token ADD FOREIGN KEY (access_token_id) REFERENCES sys_access_token (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (user_id) REFERENCES sys_user (id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE sys_user_mfa ADD FOREIGN KEY (mfa_id) REFERENCES sys_mfa (id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP VIEW IF EXISTS sys_authorization_view CASCADE;
CREATE OR REPLACE VIEW sys_authorization_view AS select
    sc.*,
    row_to_json(su) as client_credentials_user
from
    sys_client sc
    left outer join sys_user su on sc.client_credentials_user_id = su.id
where
    (
        valid_from is null
        or now() >= valid_from
    )
    and (
        valid_until is null
        or now() < valid_until
    );
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
    inner join sys_permission sp on sp.id = sgp.permission_id;
DROP VIEW IF EXISTS sys_access_token_view CASCADE;
CREATE OR REPLACE VIEW sys_access_token_view AS select
	sat.*,
	sat.date_created + (ttl || ' seconds') :: interval < now() as is_expired,
	sat.date_created + (refresh_ttl || ' seconds') :: interval < now() as is_revoke,
	sat.date_created + (ttl || ' seconds') :: interval as expire_at,
	sat.date_created + (refresh_ttl || ' seconds') :: interval as revoke_at,
	row_to_json(su) as user,
	row_to_json(sup) as profile,
	row_to_json(sc) as client,
	row_to_json(st) as tenant,
	row_to_json(se) as session
from
	sys_access_token sat
	inner join sys_user su on sat.user_id = su.id
	inner join sys_user_profile sup on sup.user_id = su.id
	inner join sys_client sc on sc.id = sat.client_id
	inner join sys_tenant st on st.id = sat.tenant_id
	inner join sys_session se on se.id = sat.session_id
where
	st.is_active = true
	and sc.is_active = true
	and su.is_active = true;
DROP VIEW IF EXISTS sys_refresh_token_view CASCADE;
CREATE OR REPLACE VIEW sys_refresh_token_view AS select
    rt.id,
    rt.ttl,
    rt.refresh_token,
    at.access_token,
    rt.date_created + ( rt.ttl || ' seconds')::interval < now() as is_expire,
    rt.date_created + ( rt.ttl || ' seconds')::interval expire_at
from
    sys_refresh_token rt
    inner join sys_access_token at on at.id = rt.access_token_id;
DROP VIEW IF EXISTS sys_session_view CASCADE;
CREATE OR REPLACE VIEW sys_session_view AS select
    se.*,
    cl.client_id as oidc_client_id,
    cl.post_logout_redirect_uri,
    cl.is_back_channel_post_logout,
    us.id as oidc_sub_claim,
    row_to_json(cl) as client,
    row_to_json(us) as user
from
    sys_session se
    inner join sys_client cl on cl.id = se.client_id
    inner join sys_user us on us.id = se.user_id