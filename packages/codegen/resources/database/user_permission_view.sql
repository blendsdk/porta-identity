select
	sur.user_id,
	ap.id as application_id,
	sp."permission",
	sp.id as permission_id,
	sr."role",
	sr.id as role_id
	--,*
from 
	sys_user_role sur 
	inner join sys_role sr on sr.id  = sur.role_id 
	inner join sys_role_permission srp on srp.role_id = sur.role_id
	inner join sys_permission sp on sp.id = srp.permission_id
	left outer join sys_application ap on ap.id = sp.application_id