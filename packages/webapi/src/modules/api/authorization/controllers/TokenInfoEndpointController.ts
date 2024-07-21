import { wrapInArray } from "@blendsdk/stdlib";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, ITokenInfo, ITokenInfoRequest, ITokenInfoResponse } from "@porta/shared";
import * as jose from "jose";
import { commonUtils, databaseUtils, EndpointController } from "../../../../services";
import { eErrorType } from "../../../../types";

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
            const tenantRecord = await commonUtils.getTenantRecord(tenant, this.request, true);

            if (tenantRecord) {
                const { publicKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);
                const pKey = await jose.importSPKI(publicKey, "ES256");

                // look for the access_token
                let accessTokenStorage = await databaseUtils.findAccessTokenByTenantAndToken(token, tenantRecord, false);

                // if not found then maybe it is a refresh token
                if (!accessTokenStorage) {
                    const refreshToken = await databaseUtils.findRefreshTokenByTenant({ refresh_token: token, check_validity: true, tenantRecord });

                    // if this is a refresh token then find its corresponding access token
                    if (refreshToken) {
                        token_type = "refresh_token";
                        resp = await this.getJWTInfo(token, pKey);
                        accessTokenStorage = await databaseUtils.findAccessTokenByTenantAndToken(refreshToken.access_token.access_token, tenantRecord, false);
                    }
                } else {
                    token_type = "access_token";
                    resp = await this.getJWTInfo(token, pKey);
                }

                if (accessTokenStorage) {
                    const { accessToken } = accessTokenStorage;
                    const { scope, client_id } = accessToken.auth_request_params as any as IAuthorizeRequest;
                    resp = {
                        active: !accessToken.is_expired,
                        scope: scope,
                        client_id: client_id,
                        username: accessToken.user.id,
                        token_type,
                        nbf: commonUtils.millisecondsToSeconds(new Date(accessToken.auth_time).getTime()),
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
            return this.responseWithError({
                error: eErrorType.invalid_request,
                error_description: errors.join(", "),
            }, true);
        } else {

            return new SuccessResponse({
                ...(resp || { active: false })
            });
        }
    }
}
