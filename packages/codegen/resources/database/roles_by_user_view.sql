select
    sg.*,
    sug.user_id
from
    sys_user_role sug
    inner join sys_role sg on sg.id = sug.role_id