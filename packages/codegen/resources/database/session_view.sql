select
	ss.id as session_id,
	sa.client_id,
	ss.user_id,
	row_to_json(ss.*) as session,	
	row_to_json(sa.*) as application,
	row_to_json(sc.*) as client
from
	sys_session ss
	inner join sys_application_session sas on sas.session_id = ss.id
	inner join sys_application sa on sa.id  = sas.application_id
	inner join sys_client sc on sc.application_id = sa.id