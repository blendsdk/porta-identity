import { expression } from "@blendsdk/expression";
import { indexObject } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IPortaAccount, ISysAccessToken, ISysPermission, ISysRefreshTokenView, ISysRole, ISysSession, ISysTenant, ISysUserPermissionView, eSysAccessTokenView, eSysAuthorizationView, eSysRefreshTokenView, eSysSecretView, eSysUserPermissionView } from "@porta/shared";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysApplicationDataService } from "../dataservices/SysApplicationDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysRefreshTokenDataService } from "../dataservices/SysRefreshTokenDataService";
import { SysSessionDataService } from "../dataservices/SysSessionDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { eOAuthPrompt } from "../types";
import { commonUtils } from "./CommonUtils";
import { ServiceBase } from "./ServiceBase";

export class DatabaseUtils extends ServiceBase {

    /**
     * Fins a refresh_token by tenant
     *
     * @param {string} tenant
     * @param {string} refresh_token
     * @returns {Promise<ISysRefreshTokenView>}
     * @memberof DatabaseUtils
     */
    public async findRefreshTokenByTenant(params: { tenantRecord: ISysTenant, check_validity: boolean, refresh_token; }): Promise<ISysRefreshTokenView> {
        let { tenantRecord, check_validity, refresh_token } = params;
        check_validity = check_validity === false ? false : true;
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });

        const e = expression();
        const records = await tenantDs.listSysRefreshTokenViewByExpression(e.createRenderer(
            e.Equal(eSysRefreshTokenView.REFRESH_TOKEN, refresh_token)
        ));

        if (records.length === 1) {
            const isValid = check_validity === true ? !records[0].is_expired : true;
            return isValid ? records[0] : undefined;
        } else {
            return undefined;
        }
    }

    /**
     * @param {ISysTenant} tenantRecord
     * @param {ISysRefreshTokenView} refreshTokenRecord
     * @memberof DatabaseUtils
     */
    public async revokeRefreshToken(tenantRecord: ISysTenant, refreshTokenRecord: ISysRefreshTokenView) {
        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });
        const refreshTokenDs = new SysRefreshTokenDataService({ tenantId: tenantRecord.id });
        await refreshTokenDs.deleteSysRefreshTokenById({ id: refreshTokenRecord.id });
        await accessTokenDs.deleteSysAccessTokenById({ id: refreshTokenRecord.access_token.id });
    }

    /**
     * @param {string} otaOrAccessToken
     * @param {ISysTenant} tenantRecord
     * @memberof DatabaseUtils
     */
    public async revokeAccessToken(otaOrAccessToken: string, tenantRecord: ISysTenant) {
        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });
        let accessTokenRecord = (await accessTokenDs.findSysAccessTokenByOta({ ota: otaOrAccessToken })) || (await accessTokenDs.findSysAccessTokenByAccessToken({ access_token: otaOrAccessToken }));
        if (accessTokenRecord) {
            await accessTokenDs.deleteSysAccessTokenById({ id: accessTokenRecord.id });
        }
    }

    /**
     * @param {string} access_token
     * @param {string} ota
     * @param {ISysTenant} tenantRecord
     * @memberof DatabaseUtils
     */
    public async linkAccessTokenToOTA(access_token: string, ota: string, tenantRecord: ISysTenant) {
        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });
        const accessTokenRecord = await accessTokenDs.findSysAccessTokenByAccessToken({ access_token });
        if (accessTokenRecord) {
            await accessTokenDs.updateSysAccessTokenById({
                ota
            }, {
                id: accessTokenRecord.id
            });
        }
    }

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
     * @param {{
     *         tenantRecord: ISysTenant,
     *         accessTokenRecord: ISysAccessToken;
     *         ttl: number;
     *     }} params
     * @return {*} 
     * @memberof DatabaseUtils
     */
    public async newRefreshToken(params: {
        tenantRecord: ISysTenant,
        accessTokenRecord: ISysAccessToken;
        ttl: number;
    }) {
        const { tenantRecord, accessTokenRecord, ttl } = params;
        const refreshTokenDs = new SysRefreshTokenDataService({ tenantId: tenantRecord.id });
        const date_expire = new Date(Date.now() + commonUtils.secondsToMilliseconds(ttl));
        const refresh_token_record = await refreshTokenDs.insertIntoSysRefreshToken({
            access_token_id: accessTokenRecord.id,
            date_expire: date_expire.toISOString()
        });
        return { refresh_token_record, refreshtoken_date_expire: date_expire };
    }

    /**
     * @param {ISysTenant} tenantRecord
     * @param {string} client_id
     * @return {*} 
     * @memberof DatabaseUtils
     */
    public findApplicationByClientID(tenantRecord: ISysTenant, client_id: string) {
        const appDs = new SysApplicationDataService({ tenantId: tenantRecord.id });
        return appDs.findSysApplicationByClientId({ client_id });
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
        session: ISysSession,
        ttl: number,
        client_record_id: string;
        authRequest: IAuthorizeRequest;
        tokenBuilder: (date_created: Date, date_expire: Date) => Promise<string>;
        token_reference: string;
    }) {

        const { tenantRecord, user_id, session, ttl, client_record_id, authRequest, tokenBuilder, token_reference } = params;

        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });
        const sessionDs = new SysSessionDataService({ tenantId: tenantRecord.id });

        const isNewSession = commonUtils.checkLoginRequired(session, authRequest.max_age);

        // OIDC conformance. When the prompt is none then we want to know the initial auth time.
        // This is when the session was created first and not when the token is created!
        const now = authRequest.prompt === eOAuthPrompt.none || (authRequest.max_age && !isNewSession) ? new Date(session.last_token_auth_time) : new Date();

        const date_expire = new Date(now.getTime() + commonUtils.secondsToMilliseconds(ttl));

        const access_token_record = await accessTokenDs.insertIntoSysAccessToken({
            access_token: await tokenBuilder(now, date_expire),
            tenant_id: tenantRecord.id,
            client_id: client_record_id,
            user_id,
            session_id: session.id,
            auth_time: now.toISOString(),
            date_expire: date_expire.toISOString(),
            auth_request_params: { ...authRequest },
            token_reference
        });

        await sessionDs.updateSysSessionById({ last_token_auth_time: now.toISOString() }, { id: session.id });

        return { access_token_record, date_expire, date_created: now };
    }

    /**
     * @param {IAuthorizeRequest} authRequest
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof DatabaseUtils
     */
    public findAuthorizationRecord(authRequest: IAuthorizeRequest, tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const { client_id, redirect_uri } = authRequest;
        const e = expression();
        return tenantDs.listSysAuthorizationViewByExpression(e.createRenderer(
            e.And(
                e.Equal(eSysAuthorizationView.CLIENT_ID, client_id),
                e.Equal(eSysAuthorizationView.REDIRECT_URI, redirect_uri),
                e.Equal(eSysAuthorizationView.TENANT_ID, tenantRecord.id),
            )
        ));
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
