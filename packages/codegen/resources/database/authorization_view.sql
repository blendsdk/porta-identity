select
    scc.user_id confidential_user_id,
    sa.id as application_id,
    sa.logo,
    sa.name as application_name,
    sc.client_id as client_id,
    sc.secret as client_secret,
    sc.session_length,
    ct.client_type,
    sr.redirect_uri,
    sr.logout_uri,
    sr.ios_bundle_id,
    sr.android_package_name,
    sr.android_signature_hash
from
    sys_client sc
    left join sys_application sa on sa.id = sc.application_id
    left join sys_redirect sr on sr.client_id = sc.id
    inner join sys_client_type ct on sc.client_type_id = ct.id
    left outer join sys_confidential_client scc on scc.client_id = sc.id