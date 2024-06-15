DROP VIEW IF EXISTS sys_secret_view CASCADE;
CREATE OR REPLACE VIEW sys_secret_view AS select
	ss.id,
	ss.secret as client_secret,
	ss.description,
	ss.valid_from,
	ss.valid_to,
	ss.is_system,
	ss.client_id as sys_client_id,
	sa.client_id,
	((now() >= ss.valid_from) is true) and ((now() < ss.valid_to) is false) as is_expired    
from
	sys_secret ss
	inner join sys_client sc on sc.id  = ss.client_id
	inner join sys_application sa on sa.id  = sc.application_id;
DROP VIEW IF EXISTS sys_authorization_view CASCADE;
CREATE OR REPLACE VIEW sys_authorization_view AS select
	sc.application_id,
	sa.logo,
	sa.application_name,
	sa.client_id,
	sc.client_type,
	sc.redirect_uri,
	sc.post_logout_redirect_uri,
	sc.is_back_channel_post_logout,
	sc.access_token_length,
	sc.refresh_token_length,
	sc.client_credentials_user_id,
	sm."name" as mfa,
	sm.settings as mfa_settings,
	sc.mfa_bypass_days,
	st.auth_session_length_hours,
	st.id as tenant_id,
	sc.id as sys_client_id
from
	sys_application sa
	inner join sys_client sc on sc.application_id = sa.id
	inner join sys_tenant st on st.id = sa.tenant_id
	left outer join sys_mfa sm on sm.id = sc.mfa_id
where
	sa.is_active is true and
	sc.is_active is true