select
	*,
	((now() >= valid_from) is true) and ((now() < valid_to) is false) as is_expired    
from
	sys_secret