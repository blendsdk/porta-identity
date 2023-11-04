select
    sc.*,
    row_to_json(su) as client_credentials_user
from
    sys_client_view sc
    left outer join sys_user su on sc.client_credentials_user_id = su.id
where
    (
        valid_from is null
        or now() >= valid_from
    )
    and (
        valid_until is null
        or now() < valid_until
    )