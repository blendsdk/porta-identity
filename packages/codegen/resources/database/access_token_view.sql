select
	sat.*,
	sat.date_created + (ttl || ' seconds') :: interval < now() as is_expired,
	sat.date_created + (refresh_ttl || ' seconds') :: interval < now() as is_revoke,
	sat.date_created + (ttl || ' seconds') :: interval as expire_at,
	sat.date_created + (refresh_ttl || ' seconds') :: interval as revoke_at,
	row_to_json(su) as user,
	row_to_json(sup) as profile,
	row_to_json(sc) as client,
	row_to_json(st) as tenant
from
	sys_access_token sat
	inner join sys_user su on sat.user_id = su.id
	inner join sys_user_profile sup on sup.user_id = su.id
	inner join sys_client sc on sc.id = sat.client_id
	inner join sys_tenant st on st.id = sat.tenant_id
where
	st.is_active = true
	and sc.is_active = true
	and su.is_active = true