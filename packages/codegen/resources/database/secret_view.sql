select
	ss.id,
	ss.secret as client_secret,
	ss.description,
	ss.valid_from,
	ss.valid_to,
	ss.is_system,
	sa.client_id,
	ss.application_id,
	su.id as client_credential_user_id,
	((now() >= ss.valid_from) is true) and ((now() < ss.valid_to) is false) as is_expired    
from
	sys_secret ss
	inner join sys_application sa on sa.id = ss.application_id
	left outer join sys_user su on su.service_application_id = ss.application_id