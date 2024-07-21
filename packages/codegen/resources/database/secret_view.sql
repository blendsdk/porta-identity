select
	ss.id,
	ss.secret as client_secret,
	ss.description,
	ss.valid_from,
	ss.valid_to,
	ss.is_system,
	sa.client_id,
	((now() >= ss.valid_from) is true) and ((now() < ss.valid_to) is false) as is_expired    
from
	sys_secret ss
	inner join sys_application sa on sa.id = ss.application_id