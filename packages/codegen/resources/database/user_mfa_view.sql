select
    su.id as user_id,
    sm.id as mfa_id,
    sm.name as mfa_name,
    sm.settings as mfa_settings
from
    sys_user_mfa um
    inner join sys_mfa sm on sm.id = um.mfa_id
    inner join sys_user su on su.id = um.user_id