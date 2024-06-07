import { asyncForEach } from "@blendsdk/stdlib";
import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IDiscoveryKeysRequest, IDiscoveryKeysResponse, ISysKey } from "@porta/shared";
import * as jose from "jose";
import { DataServices } from "../../../../dataservices/DataServices";
import { EndpointController } from "../../../../services";
import { eOAuthSigningAlg } from "../../../../types";
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
    public handleRequest({ tenant }: IDiscoveryKeysRequest): Promise<Response<IDiscoveryKeysResponse>> {
        const ds = new DataServices(tenant, this.request, true); // no user no assertion
        return ds.withTransaction(async () => {
            const tenantRecord = await ds.getTenant(tenant);
            if (tenantRecord) {
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
                    jwk.issuer = `${this.getServerURL()}/${tenant}/oauth2`;
                    (jwks as any[]).push(jwk);
                });
                return new SuccessResponse({
                    keys: jwks
                });
            } else {
                return new BadRequestResponse({
                    message: "INVALID_REQUEST",
                    cause: `Invalid tenant ${tenant}`
                });
            }
        });
    }
}
