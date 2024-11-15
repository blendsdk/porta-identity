import { asyncForEach } from "@blendsdk/stdlib";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IDiscoveryKeysRequest, IDiscoveryKeysResponse, ISysKey } from "@porta/shared";
import * as jose from "jose";
import { DataServices } from "../../../../dataservices/DataServices";
import { commonUtils, EndpointController } from "../../../../services";
import { eErrorType, eOAuthSigningAlg } from "../../../../types";
interface IJwkKey {
    privateKey: string;
    publicKey: string;
    certificate: string;
}

/**
 * Handler for the JWKS keys endpoint
 *
 * @export
 * @class JWKSEndpointController
 * @extends {EndpointController}
 */
export class JWKSEndpointController extends EndpointController {
    /**
     * @param {IOidcDiscoveryKeysRequest} { tenant }
     * @returns {Promise<Response<IOidcDiscoveryKeysResponse>>}
     * @memberof JWKSEndpointController
     */
    public async handleRequest({ tenant }: IDiscoveryKeysRequest): Promise<Response<IDiscoveryKeysResponse>> {
        const tenantRecord = await commonUtils.getTenantRecord(tenant, this.request);

        if (!tenantRecord) {
            return this.responseWithError(
                {
                    error: eErrorType.invalid_tenant,
                    error_description: tenant
                },
                true
            );
        }

        const ds = new DataServices(tenant, this.request, true); // no user no assertion
        return ds.withTransaction(async () => {
            const sysKeys = await ds.sysKeyDataService().findJwkKeys();
            const jwks = [];
            await asyncForEach<ISysKey>(sysKeys, async (record) => {
                const { certificate, publicKey } = JSON.parse(record.data) as IJwkKey;

                const pubKey = await jose.importSPKI(publicKey, "ES256");
                const jwk = await jose.exportJWK(pubKey);
                jwk.use = "sig";
                jwk.alg = eOAuthSigningAlg.RS256;
                jwk.kid = record.key_id;
                jwk.x5t = await jose.calculateJwkThumbprint(jwk, "sha256");
                jwk.x5c = [certificate.replace(/(?:-----(?:BEGIN|END) CERTIFICATE-----|\s|=)/g, "")];
                (jwk as any).issuer = `${this.getServerURL()}/${tenant}/oauth2`;
                (jwks as any[]).push(jwk);
            });
            return new SuccessResponse({
                keys: jwks
            });
        });
    }
}
