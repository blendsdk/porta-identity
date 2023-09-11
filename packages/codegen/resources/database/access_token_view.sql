select
	ttl as default_ttl,
	refresh_ttl as default_refresh_ttl,
	trunc(extract('epoch' from sat.date_created + (ttl || ' seconds') :: interval - now())) as ttl,
	trunc(extract('epoch' from sat.date_created + (refresh_ttl || ' seconds') :: interval - now())) as refresh_ttl,
	sat.id,
	sat.auth_time,
	sat.date_created,
	sat.auth_request_params,
	sat.access_token,
	sat.session_id,
	sat.user_id,
	sat.client_id,
	sat.tenant_id,
	extract('epoch' from sat.date_created + (ttl || ' seconds') :: interval - now()) < 0 as is_expired,
	extract('epoch' from sat.date_created + (refresh_ttl || ' seconds') :: interval - now()) < 0 as is_revoke,
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
	and su.is_active = true