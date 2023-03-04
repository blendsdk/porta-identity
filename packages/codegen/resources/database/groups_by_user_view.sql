select
    sg.*,
    sug.user_id
from
    sys_user_group sug
    inner join sys_group sg on sg.id = sug.group_id