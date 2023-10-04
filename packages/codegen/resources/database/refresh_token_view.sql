select
    rt.id,
    trunc(extract('epoch' from rt.date_created + (rt.ttl || ' seconds') :: interval - now()))::bigint as ttl,
    rt.refresh_token,
    at.access_token,
    extract('epoch' from rt.date_created + (rt.ttl || ' seconds') :: interval - now()) < 0 as is_expired,
    rt.date_created + ( at.refresh_ttl || ' seconds')::interval as expire_at
from
    sys_refresh_token rt
    inner join sys_access_token at on at.id = rt.access_token_id