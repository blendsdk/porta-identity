select
    sc.*
from
    sys_client sc
    left outer join sys_user su on sc.client_credentials_user_id = su.id