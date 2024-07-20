select
	srt.id,
	srt.refresh_token,
	row_to_json(sat.*) as access_token,
	row_to_json(ss.*) as session,
	row_to_json(su.*) as user,
	row_to_json(sp.*) as profile,
	row_to_json(sc.*) as client,
	row_to_json(st.*) as tenant, 
    row_to_json(ap.*) as application, 
	(now() > srt.date_expire) as is_expired
from 
    sys_refresh_token srt
	inner join sys_access_token sat on sat.id = srt.access_token_id
	inner join sys_session ss on ss.id = sat.session_id
	inner join sys_user su on su.id  = sat.user_id 
	inner join sys_client sc on sc.id = sat.client_id 
	inner join sys_tenant st on st.id = sat.tenant_id 
	inner join sys_profile sp on sp.user_id = su.id
    inner join sys_application ap on ap.id = sc.application_id
