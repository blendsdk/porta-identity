select
    a.id as application_id,
    c.id as client_id,
    c.client_id as oidc_client_id,
    ur.user_id,
    rp.permission_id,
    ur.role_id,
    p.permission,
    p.is_active,
    r.role,
    r.description as role_description,
    p.description as permission_description,
    r.is_active as role_is_active
from
    sys_user_role ur
    inner join sys_role r on r.id = ur.role_id
    inner join sys_role_permission rp on rp.role_id = r.id
    inner join sys_permission p on p.id = rp.permission_id
    inner join sys_application a on a.id = p.application_id
    inner join sys_client c on c.application_id = a.id