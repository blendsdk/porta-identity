select
    sug.user_id,
    sgp.permission_id,
    sug.group_id,
    sp.code,
    sp.is_active,
    sg."name" as group_name,
    sg.description as group_description,
    sp.description as permission_description,
    sg.is_active as group_is_active
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id
    inner join sys_group_permission sgp on sgp.group_id = sg.id
    inner join sys_permission sp on sp.id = sgp.permission_id