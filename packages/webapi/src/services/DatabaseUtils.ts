import { expression } from "@blendsdk/expression";
import { IDictionaryOf } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import { IPortaAccount, ISysTenant, eSysSecretView } from "@porta/shared";
import * as jose from "jose";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { eOAuthSigningAlg } from "../types";
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
    public findTenant(tenantKeyOrName: string) {
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
        client_id: string,
        user_id: string,
        session_id: string,
        ttl: number,
        issuer: string,
        claims: IDictionaryOf<any>;
        client_record_id: string;
    }) {

        const { tenantRecord, client_id, user_id, session_id, ttl, issuer, claims, client_record_id } = params;

        const accessTokenDs = new SysAccessTokenDataService({ tenantId: tenantRecord.id });

        const { privateKey } = await this.getJWKSigningKeys(tenantRecord);
        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        const now = new Date(Math.trunc(new Date().getTime() / 1000) * 1000);
        const date_expire = new Date(now.getTime() + ttl);

        const access_token = await new jose.SignJWT({
            ten: tenantRecord.id,
            ...claims
        }) //
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256, typ: "at+JWT" })
            .setIssuer(issuer)
            .setExpirationTime(commonUtils.millisecondsToSeconds(date_expire.getTime()))
            .setAudience(client_id)
            .setSubject(user_id)
            .setJti(session_id)
            .setIssuedAt(commonUtils.millisecondsToSeconds(now.getTime()))
            .sign(pKey);

        const access_token_record = await accessTokenDs.insertIntoSysAccessToken({
            access_token,
            tenant_id: tenantRecord.id,
            client_id: client_record_id,
            user_id,
            session_id,
            auth_time: now.toDateString(),
            date_expire: date_expire.toISOString(),
        });

        return { access_token_record, date_expire, date_created: now };
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
