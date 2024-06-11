select
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
	sm.settings as mfa_settings
from
	sys_application sa
	inner join sys_client sc on sc.application_id = sa.id
	left outer join sys_mfa sm on sm.id = sc.mfa_id
where
	sa.is_active is true and
	sc.is_active is true