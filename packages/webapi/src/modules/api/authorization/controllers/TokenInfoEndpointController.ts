import { wrapInArray } from "@blendsdk/stdlib";
import { millisecondsToSeconds } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { ITokenInfo, ITokenInfoRequest, ITokenInfoResponse } from "@porta/shared";
import * as jose from "jose";
import { databaseUtils } from "../../../../utils";
import { EndpointController } from "./EndpointControllerBase";

/**
 * Handler for the token_info endpoint
 *
 * @export
 * @class UserInfoEndpointController
 * @extends {EndpointController}
 */
export class TokenInfoEndpointController extends EndpointController {
    /**
     * Helper method to extract JWT payload information
     *
     * @protected
     * @param {string} token
     * @param {jose.KeyLike} pKey
     * @returns
     * @memberof TokenInfoEndpointController
     */
    protected async getJWTInfo(token: string, pKey: jose.KeyLike) {
        const { payload } = (await jose.jwtVerify(token, pKey)) || {};
        const { sub, iat, exp, aud, iss, jti } = payload || {};
        return {
            exp,
            iat,
            sub,
            aud: wrapInArray<string>(aud || "")
                .join(" ")
                .trim(),
            iss,
            jti
        };
    }

    /**
     * @param {IUserInfoRequest} params
     * @returns {Promise<Response<IUserInfoResponse>>}
     * @memberof UserInfoEndpointController
     */
    public async handleRequest({ token, tenant }: ITokenInfoRequest): Promise<Response<ITokenInfoResponse>> {
        let resp: Partial<ITokenInfo> = {};
        let token_type: string = undefined;
        const errors: string[] = [];
        try {
            const tenantRecord = await this.getTenant(tenant);
            if (tenantRecord) {
                const { publicKey } = await this.getJWKKey(tenant);
                const pKey = await jose.importSPKI(publicKey, "ES256");

                // look for the access_token
                let accessTokenStorage = await databaseUtils.findAccessTokenByTenant({
                    tenant,
                    access_token: token,
                    check_validity: false
                });
                // if not found then maybe it is a refresh token
                if (!accessTokenStorage) {
                    const refreshToken = await databaseUtils.findRefreshTokenByTenant({
                        tenant,
                        refresh_token: token,
                        check_validity: false
                    });
                    // if this is a refresh token then find its corresponding access token
                    if (refreshToken) {
                        token_type = "refresh_token";
                        resp = await this.getJWTInfo(token, pKey);
                        accessTokenStorage = await databaseUtils.findAccessTokenByTenant({
                            tenant,
                            access_token: refreshToken.access_token,
                            check_validity: false
                        });
                    }
                } else {
                    token_type = "access_token";
                    resp = await this.getJWTInfo(token, pKey);
                }

                if (accessTokenStorage) {
                    const { client, auth_request_params, user, date_created } = accessTokenStorage;
                    resp = {
                        active: !accessTokenStorage.is_expired,
                        scope: auth_request_params.scope,
                        client_id: client.client_id,
                        username: user.username,
                        token_type,
                        nbf: millisecondsToSeconds(Date.parse(date_created)),
                        ...resp
                    };
                } else {
                    errors.push("access_token_not_found");
                }
            } else {
                errors.push("invalid_tenant");
            }
        } catch (err) {
            errors.push(err.message);
        }

        if (errors.length !== 0) {
            await this.getLogger().warn("Invalid Toten", { token, errors });
        }

        return new SuccessResponse({
            ...(resp || { active: false })
        });
    }
}
