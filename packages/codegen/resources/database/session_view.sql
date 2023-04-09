select
    se.*,
    cl.client_id as oidc_client_id,
    cl.post_logout_redirect_uris,
    us.id as oidc_sub_claim,
    row_to_json(cl) as client,
    row_to_json(us) as user
from
    sys_session se
    inner join sys_client cl on cl.id = se.client_id
    inner join sys_user us on us.id = se.user_id