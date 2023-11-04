select
    c.*,
    a.application_name,
    a.logo
from
    sys_client c
    inner join sys_application a on a.id = c.application_id