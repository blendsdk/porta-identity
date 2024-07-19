import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { expression } from "@blendsdk/expression";
import { indexObject } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IPortaAccount, ISysPermission, ISysRole, ISysTenant, ISysUserPermissionView, eSysAccessTokenView, eSysSecretView, eSysUserPermissionView } from "@porta/shared";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysApplicationDataService } from "../dataservices/SysApplicationDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { commonUtils } from "./CommonUtils";
import { ServiceBase } from "./ServiceBase";

export class DatabaseUtils extends ServiceBase {
    /**
     * Find the tenant by Key
     *
     * @param {string} tenantKeyOrName
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async findTenant(tenantKeyOrName: string) {
        const tenantDs = new SysTenantDataService(); // Query on master db
        return tenantDs.findByNameOrId({ name: tenantKeyOrName });
    }

    /**
     * Get the list of current tenants
     *
     * @return {*}
     * @memberof DatabaseUtils
     */
    public listTenants() {
        const tenantDs = new SysTenantDataService(); // Query on master db;
        const e = expression();
        return tenantDs.listSysTenantByExpression(e.createRenderer());
    }

    /**
     * @param {ISysTenant} tenantRecord
     * @param {string} client_id
     * @param {string} secret
     * @return {*} 
     * @memberof DatabaseUtils
     */
    public async validateClientSecret(tenantRecord: ISysTenant, client_id: string, secret: string) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const secrets = await tenantDs.listSysSecretViewByExpression(e.createRenderer(
            e.And(
                e.Equal(eSysSecretView.CLIENT_ID, client_id),
                e.Equal(eSysSecretView.CLIENT_SECRET, secret),
                e.Equal(eSysSecretView.IS_EXPIRED, false)
            )
        ));
        return secrets.length === 1;
    }


    /**
     * Assets the tenant with the session tenant
     *
     * @param {string} tenant
     * @param {HttpRequest} req
     * @memberof DatabaseUtils
     */
    public assertTenant(tenant: string, req: HttpRequest) {
        const { tenant: sessionTenant } = req.context.getUser<IPortaAccount>();
        if (tenant !== sessionTenant.id) {
            throw new Error("Invalid or mismatch tenant");
        }
    }

    /**
     * Creates new JWT access token
     *
     * @param {string} tenant_id
     * @param {string} client_id
     * @param {string} user_id
     * @param {string} session_id
     * @param {number} ttl
     * @param {number} refresh_ttl
     * @param {IAuthRequestParams} auth_request_params
     * @returns
     * @memberof DatabaseUtils
     */
    public async newAccessToken(params: {
        tenantRecord: ISysTenant,
        user_id: string,
        session_id: string,
        ttl: number,
        client_record_id: string;
        authRequest: IAuthorizeRequest;
    }) {

        const { tenantRecord, user_id, session_id, ttl, client_record_id, authRequest } = params;

        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });

        const now = new Date(Math.trunc(new Date().getTime() / 1000) * 1000);
        const date_expire = new Date(now.getTime() + commonUtils.secondsToMilliseconds(ttl));


        const access_token_record = await accessTokenDs.insertIntoSysAccessToken({
            access_token: await sha256Hash(generateRandomUUID()),
            tenant_id: tenantRecord.id,
            client_id: client_record_id,
            user_id,
            session_id,
            auth_time: now.toDateString(),
            date_expire: date_expire.toISOString(),
            auth_request_params: { claims: authRequest.claims, scope: authRequest.scope } // for security only include these two and nothing more!
        });

        return { access_token_record, date_expire, date_created: now };
    }

    /**
     * @param {string} token
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof DatabaseUtils
     */
    public async findAccessTokenByTenantAndToken(token: string, tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const result = await tenantDs.listSysAccessTokenViewByExpression(e.createRenderer(
            e.And(
                e.Equal(eSysAccessTokenView.ACCESS_TOKEN, token),
                e.Equal(eSysAccessTokenView.IS_EXPIRED, false)
            )
        ));
        const record = result[0];
        if (record) {
            const { client, user } = record;
            const e = expression();
            const userPermissionRecords = await tenantDs.listSysUserPermissionViewByExpression(e.createRenderer(
                e.And(
                    e.Equal(eSysUserPermissionView.USER_ID, user.id),
                    e.Or(
                        e.Equal(eSysUserPermissionView.APPLICATION_ID, client.application_id),
                        e.IsNull(eSysUserPermissionView.APPLICATION_ID)
                    )
                )
            ));

            const roles: ISysRole[] = Object.values(indexObject<ISysUserPermissionView>(userPermissionRecords, "role_id")).map((r: ISysUserPermissionView) => {
                return {
                    role: r.role,
                    id: r.role_id
                };
            });

            // We don't want the default permission since it was only
            // introduced to include the roles
            const permissions: ISysPermission[] = Object.values(indexObject<ISysUserPermissionView>(userPermissionRecords, "permission_id"))
                .filter((r: ISysPermission) => (r.permission !== "DEFAULT"))
                .map((r: ISysUserPermissionView) => {
                    return {
                        permission: r.permission,
                        id: r.permission_id,
                    };
                });

            const applicationDs = new SysApplicationDataService();
            const application = await applicationDs.findSysApplicationById({ id: client.application_id });

            return {
                roles,
                permissions,
                accessToken: record,
                application
            };
        } else {
            return undefined;
        }
    }

    /**
     * Returns the JWK keys from the keystore
     *
     * @protected
     * @param {ISysTenant} tenant
     * @returns {Promise<{ privateKey: string; publicKey: string }>}
     * @memberof DatabaseUtils
     */
    public async getJWKSigningKeys(tenantRecord: ISysTenant): Promise<{ privateKey: string; publicKey: string; }> {
        const keyDs = new SysKeyDataService({ tenantId: tenantRecord.id });
        const { data } = (await keyDs.findJwkKeys())[0];
        return JSON.parse(data);
    }
}

export const databaseUtils = new DatabaseUtils();
