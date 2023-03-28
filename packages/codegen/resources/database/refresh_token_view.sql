select
    rt.id,
    rt.ttl,
    rt.refresh_token,
    at.access_token,
    rt.date_created + ( rt.ttl || ' seconds')::interval < now() as is_expire,
    rt.date_created + ( rt.ttl || ' seconds')::interval expire_at
from
    sys_refresh_token rt
    inner join sys_access_token at on at.id = rt.access_token_id