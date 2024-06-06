DROP VIEW IF EXISTS sys_client_view CASCADE;
CREATE OR REPLACE VIEW sys_client_view AS select
    c.*,
    a.application_name,
    a.logo
from
    sys_client c
    inner join sys_application a on a.id = c.application_id;
DROP VIEW IF EXISTS sys_authorization_view CASCADE;
CREATE OR REPLACE VIEW sys_authorization_view AS select
    sc.*,
    row_to_json(su) as client_credentials_user
from
    sys_client_view sc
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
DROP VIEW IF EXISTS sys_roles_by_user_view CASCADE;
CREATE OR REPLACE VIEW sys_roles_by_user_view AS select
    sg.*,
    sug.user_id
from
    sys_user_role sug
    inner join sys_role sg on sg.id = sug.role_id;
DROP VIEW IF EXISTS sys_user_permission_view CASCADE;
CREATE OR REPLACE VIEW sys_user_permission_view AS select
    a.id as application_id,
    c.id as client_id,
    c.client_id as oidc_client_id,
    ur.user_id,
    rp.permission_id,
    ur.role_id,
    p.permission,
    p.is_active,
    r.role,
    r.description as role_description,
    p.description as permission_description,
    r.is_active as role_is_active
from
    sys_user_role ur
    inner join sys_role r on r.id = ur.role_id
    inner join sys_role_permission rp on rp.role_id = r.id
    inner join sys_permission p on p.id = rp.permission_id
    inner join sys_application a on a.id = p.application_id
    inner join sys_client c on c.application_id = a.id;
DROP VIEW IF EXISTS sys_access_token_view CASCADE;
CREATE OR REPLACE VIEW sys_access_token_view AS select
	ttl as default_ttl,
	refresh_ttl as default_refresh_ttl,
	trunc(
		extract(
			'epoch'
			from
				sat.date_created + (ttl || ' seconds') :: interval - now()
		)
	) as ttl,
	trunc(
		extract(
			'epoch'
			from
				sat.date_created + (refresh_ttl || ' seconds') :: interval - now()
		)
	) as refresh_ttl,
	sat.id,
	sat.auth_time,
	sat.date_created,
	sat.auth_request_params,
	sat.access_token,
	sat.session_id,
	sat.user_id,
	sat.client_id,
	sat.tenant_id,
	extract(
		'epoch'
		from
			sat.date_created + (ttl || ' seconds') :: interval - now()
	) < 0 as is_expired,
	extract(
		'epoch'
		from
			sat.date_created + (refresh_ttl || ' seconds') :: interval - now()
	) < 0 as is_revoke,
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
	inner join sys_client_view sc on sc.id = sat.client_id
	inner join sys_tenant st on st.id = sat.tenant_id
	inner join sys_session se on se.id = sat.session_id
where
	st.is_active = true
	and sc.is_active = true
	and su.is_active = true;
DROP VIEW IF EXISTS sys_refresh_token_view CASCADE;
CREATE OR REPLACE VIEW sys_refresh_token_view AS select
    rt.id,
    trunc(extract('epoch' from rt.date_created + (rt.ttl || ' seconds') :: interval - now()))::bigint as ttl,
    rt.refresh_token,
    at.access_token,
    extract('epoch' from rt.date_created + (rt.ttl || ' seconds') :: interval - now()) < 0 as is_expired,
    rt.date_created + ( at.refresh_ttl || ' seconds')::interval as expire_at
from
    sys_refresh_token rt
    inner join sys_access_token at on at.id = rt.access_token_id;
DROP VIEW IF EXISTS sys_session_view CASCADE;
CREATE OR REPLACE VIEW sys_session_view AS select
    se.*,
    cl.client_id as oidc_client_id,
    cl.post_logout_redirect_uri,
    cl.is_back_channel_post_logout,
    us.id :: text as oidc_sub_claim,
    row_to_json(cl) as client,
    row_to_json(us) as user
from
    sys_session se
    inner join sys_client_view cl on cl.id = se.client_id
    inner join sys_user us on us.id = se.user_id