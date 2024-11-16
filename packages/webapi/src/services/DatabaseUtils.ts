import { dataSourceManager } from "@blendsdk/datakit";
import { expression } from "@blendsdk/expression";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { indexObject } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import {
    IAuthorizeRequest,
    IPortaAccount,
    ISysAccessToken,
    ISysAuthorizationView,
    ISysConsent,
    ISysPermission,
    ISysProfile,
    ISysRefreshTokenView,
    ISysRole,
    ISysSession,
    ISysTenant,
    ISysUser,
    ISysUserPermissionView,
    eSysAccessTokenView,
    eSysAuthorizationView,
    eSysRefreshTokenView,
    eSysSecretView,
    eSysSessionView,
    eSysUserPermissionView
} from "@porta/shared";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysApplicationDataService } from "../dataservices/SysApplicationDataService";
import { SysConsentDataService } from "../dataservices/SysConsentDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysProfileDataService } from "../dataservices/SysProfileDataService";
import { SysRefreshTokenDataService } from "../dataservices/SysRefreshTokenDataService";
import { SysSessionDataService } from "../dataservices/SysSessionDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { SysUserDataService } from "../dataservices/SysUserDataService";
import { eDatabaseType, eOAuthGrantType, eOAuthPrompt } from "../types";
import { commonUtils } from "./CommonUtils";
import { ServiceBase } from "./ServiceBase";

export interface INewAccessTokenResult {
    access_token_record: ISysAccessToken;
    date_expire: Date;
    date_created: Date;
}

export class DatabaseUtils extends ServiceBase {
    /**
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async deleteTenant(tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: eDatabaseType.registry });

        // delete the registry record
        await tenantDs.deleteSysTenantById({ id: tenantRecord.id });

        // clone all connection to the tenant database
        await tenantDs.terminateConnectionByDatabaseName({ name: tenantRecord.database });

        // rename the tenant database. We do not delete it for now
        const ds = dataSourceManager.getDataSource<PostgreSQLDataSource>();
        const ctx = await ds.createContext();
        await ctx.executeQuery(
            `ALTER DATABASE ${tenantRecord.database} RENAME TO ${tenantRecord.database}_DELETED_ON_${new Date().getTime()};`
        );
    }

    /**
     * @param {ISysConsent} consent
     * @param {ISysTenant} tenantRecord
     * @memberof DatabaseUtils
     */
    public async saveUserConsent(consent: ISysConsent, tenantRecord: ISysTenant) {
        const consentDs = new SysConsentDataService({ tenantId: tenantRecord.id });
        const consentRecord = await consentDs.findSysConsentByApplicationIdAndUserId({
            application_id: consent.application_id,
            user_id: consent.user_id
        });
        if (consentRecord) {
            await consentDs.updateSysConsentById(consent, { id: consentRecord.id });
        } else {
            await consentDs.insertIntoSysConsent(consent);
        }
    }

    /**
     * @param {string} client_id
     * @param {string} user_id
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async findSessionByClientIDAndLogoutHint(client_id: string, user_id: string, tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const result = await tenantDs.listSysSessionViewByExpression(
            e.createRenderer(
                e.And(e.Equal(eSysSessionView.CLIENT_ID, client_id), e.Equal(eSysSessionView.USER_ID, user_id))
            )
        );
        return result.length !== 0 ? result[0] : undefined;
    }

    /**
     * @param {string} session_id
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async findSessionBySessionId(session_id: string, tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const result = await tenantDs.listSysSessionViewByExpression(
            e.createRenderer(e.And(e.Equal(eSysSessionView.SESSION_ID, session_id)))
        );
        return result.length !== 0 ? result[0] : undefined;
    }

    /**
     * @param {string} user_id
     * @param {string} application_id
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public findConsentByUserAndApplication(user_id: string, application_id: string, tenantRecord: ISysTenant) {
        const consentDs = new SysConsentDataService({ tenantId: tenantRecord.id });
        return consentDs.findSysConsentByApplicationIdAndUserId({ application_id, user_id });
    }

    /**
     * @param {ISysTenant} tenantRecord
     * @memberof DatabaseUtils
     */
    public async cleanExpiredSessions(tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        await tenantDs.revokeExpiredAccessTokens();
        await tenantDs.revokeExpiredRefreshTokens();
        await tenantDs.revokeExpiredSessions();
    }

    /**
     * @param {string} user_id
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async finUserAndProfile(user_id: string, tenantRecord: ISysTenant) {
        const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
        const profileDs = new SysProfileDataService({ tenantId: tenantRecord.id });
        let user: ISysUser;
        let profile: ISysProfile;

        user = await userDs.findSysUserById({ id: user_id });
        if (user) {
            profile = await profileDs.findProfileByUserId({ user_id: user.id });
        }
        return { user, profile };
    }

    /**
     * Fins a refresh_token by tenant
     *
     * @param {string} tenant
     * @param {string} refresh_token
     * @returns {Promise<ISysRefreshTokenView>}
     * @memberof DatabaseUtils
     */
    public async findRefreshTokenByTenant(params: {
        tenantRecord: ISysTenant;
        check_validity: boolean;
        refresh_token;
    }): Promise<ISysRefreshTokenView> {
        let { tenantRecord, check_validity, refresh_token } = params;
        check_validity = check_validity === false ? false : true;
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });

        const e = expression();
        const records = await tenantDs.listSysRefreshTokenViewByExpression(
            e.createRenderer(e.Equal(eSysRefreshTokenView.REFRESH_TOKEN, refresh_token))
        );

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
        let accessTokenRecord =
            (await accessTokenDs.findSysAccessTokenByOta({ ota: otaOrAccessToken })) ||
            (await accessTokenDs.findSysAccessTokenByAccessToken({ access_token: otaOrAccessToken }));
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
            await accessTokenDs.updateSysAccessTokenById(
                {
                    ota
                },
                {
                    id: accessTokenRecord.id
                }
            );
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
        const secrets = await tenantDs.listSysSecretViewByExpression(
            e.createRenderer(
                e.And(
                    e.Equal(eSysSecretView.CLIENT_ID, client_id),
                    e.Equal(eSysSecretView.CLIENT_SECRET, secret),
                    e.Equal(eSysSecretView.IS_EXPIRED, false)
                )
            )
        );
        return secrets.length === 1;
    }

    public async findClientSecretForServiceAccount(tenantRecord: ISysTenant, client_id: string, secret: string) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const secrets = await tenantDs.listSysSecretViewByExpression(
            e.createRenderer(
                e.And(
                    e.Equal(eSysSecretView.CLIENT_ID, client_id),
                    e.Equal(eSysSecretView.CLIENT_SECRET, secret),
                    e.Equal(eSysSecretView.IS_EXPIRED, false),
                    e.IsNotNull(eSysSecretView.CLIENT_CREDENTIAL_USER_ID)
                )
            )
        );
        return secrets.length !== 0 ? secrets[0] : undefined;
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
        tenantRecord: ISysTenant;
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
        tenantRecord: ISysTenant;
        user_id: string;
        session: ISysSession;
        ttl: number;
        client_record_id: string;
        authRequest: IAuthorizeRequest;
        tokenBuilder: (date_created: Date, date_expire: Date) => Promise<string>;
        token_reference: string;
    }): Promise<INewAccessTokenResult> {
        const { tenantRecord, user_id, session, ttl, client_record_id, authRequest, tokenBuilder, token_reference } =
            params;

        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });

        const isNewSession = commonUtils.checkLoginRequired(session, authRequest.max_age);

        // OIDC conformance. When the prompt is none then we want to know the initial auth time.
        // This is when the session was created first and not when the token is created!
        const now =
            authRequest.prompt === eOAuthPrompt.none || (authRequest.max_age && !isNewSession)
                ? new Date(session.last_token_auth_time)
                : new Date();

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

        await this.updateSessionLastTokenAuthTime(now, session, tenantRecord);

        return { access_token_record, date_expire, date_created: now };
    }

    /**
     * @param {Date} when
     * @param {ISysSession} session
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public updateSessionLastTokenAuthTime(when: Date, session: ISysSession, tenantRecord: ISysTenant) {
        const sessionDs = new SysSessionDataService({ tenantId: tenantRecord.id });
        return sessionDs.updateSysSessionById({ last_token_auth_time: when.toISOString() }, { id: session.id });
    }

    /**
     * @param {{ client_id: string, redirect_uri: string; }} params
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async findAuthorizationRecord(
        params: { client_id: string; redirect_uri: string },
        tenantRecord: ISysTenant
    ) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const { client_id, redirect_uri } = params;
        const e = expression();
        let result: ISysAuthorizationView[] = [];
        if (redirect_uri === eOAuthGrantType.client_credentials) {
            result = await tenantDs.listSysAuthorizationViewByExpression(
                e.createRenderer(
                    e.And(
                        e.Equal(eSysAuthorizationView.CLIENT_ID, client_id),
                        e.Equal(eSysAuthorizationView.TENANT_ID, tenantRecord.id)
                    )
                )
            );
        } else {
            result = await tenantDs.listSysAuthorizationViewByExpression(
                e.createRenderer(
                    e.And(
                        e.Equal(eSysAuthorizationView.CLIENT_ID, client_id),
                        e.Equal(eSysAuthorizationView.REDIRECT_URI, redirect_uri),
                        e.Equal(eSysAuthorizationView.TENANT_ID, tenantRecord.id)
                    )
                )
            );
        }
        return result.length !== 0 ? result[0] : undefined;
    }

    /**
     * @param {string} user_id
     * @param {string} application_id
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async getUserRolesAndPermissions(user_id: string, application_id: string, tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const userPermissionRecords = await tenantDs.listSysUserPermissionViewByExpression(
            e.createRenderer(
                e.And(
                    e.Equal(eSysUserPermissionView.USER_ID, user_id),
                    e.Or(
                        e.Equal(eSysUserPermissionView.APPLICATION_ID, application_id),
                        e.IsNull(eSysUserPermissionView.APPLICATION_ID)
                    )
                )
            )
        );

        const roles: ISysRole[] = Object.values(
            indexObject<ISysUserPermissionView>(userPermissionRecords, "role_id")
        ).map((r: ISysUserPermissionView) => {
            return {
                role: r.role,
                id: r.role_id
            };
        });

        // We don't want the default permission since it was only
        // introduced to include the roles
        const permissions: ISysPermission[] = Object.values(
            indexObject<ISysUserPermissionView>(userPermissionRecords, "permission_id")
        )
            .filter((r: ISysPermission) => r.permission !== "DEFAULT")
            .map((r: ISysUserPermissionView) => {
                return {
                    permission: r.permission,
                    id: r.permission_id
                };
            });

        const applicationDs = new SysApplicationDataService();
        const application = await applicationDs.findSysApplicationById({ id: application_id });

        return {
            roles,
            permissions,
            application
        };
    }

    /**
     * @param {string} token
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof DatabaseUtils
     */
    public async findAccessTokenByTenantAndToken(token: string, tenantRecord: ISysTenant, use_reference: boolean) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const e = expression();
        const result = await tenantDs.listSysAccessTokenViewByExpression(
            e.createRenderer(
                e.And(
                    e.Equal(
                        use_reference ? eSysAccessTokenView.TOKEN_REFERENCE : eSysAccessTokenView.ACCESS_TOKEN,
                        token
                    ),
                    e.Equal(eSysAccessTokenView.IS_EXPIRED, false)
                )
            )
        );
        const record = result[0];
        if (record) {
            const { client, user } = record;
            const { application, permissions, roles } = await this.getUserRolesAndPermissions(
                user.id,
                client.application_id,
                tenantRecord
            );
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
    public async getJWKSigningKeys(tenantRecord: ISysTenant): Promise<{ privateKey: string; publicKey: string }> {
        const keyDs = new SysKeyDataService({ tenantId: tenantRecord.id });
        const { data } = (await keyDs.findJwkKeys())[0];
        return JSON.parse(data);
    }
}

export const databaseUtils = new DatabaseUtils();
