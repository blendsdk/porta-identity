select
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
	inner join sys_application sa on sa.id  = sc.application_id