select
    sug.user_id,
    sgp.permission_id,
    sp.code,
    sp.is_active
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id
    inner join sys_group_permission sgp on sgp.group_id = sg.id
    inner join sys_permission sp on sp.id = sgp.permission_id