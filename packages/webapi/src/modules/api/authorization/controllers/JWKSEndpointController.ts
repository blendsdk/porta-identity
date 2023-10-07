import { dataSourceManager } from "@blendsdk/datakit";
import { asyncForEach } from "@blendsdk/stdlib";
import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IOidcDiscoveryKeysRequest, IOidcDiscoveryKeysResponse, ISysKey } from "@porta/shared";
import * as jose from "jose";
import { SysKeyDataService } from "../../../../dataservices/SysKeyDataService";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { eOAuthSigningAlg } from "../../../../types";
import { databaseUtils } from "../../../../utils";
import { EndpointController } from "./EndpointControllerBase";
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
    public async handleRequest({ tenant }: IOidcDiscoveryKeysRequest): Promise<Response<IOidcDiscoveryKeysResponse>> {
        const tenantDs = new SysTenantDataService();
        const tenantRecord = await tenantDs.findSysTenantByName({ name: tenant });
        if (tenantRecord) {
            const cacheKey = `${tenantRecord.name}:jwks`;

            let jwks = (await this.getCache().getValue(cacheKey)) || undefined;
            jwks = null;
            if (!jwks) {
                const dataSource = dataSourceManager.getDataSource(databaseUtils.getTenantDataSourceID(tenantRecord));
                const keysDs = new SysKeyDataService({ dataSource });
                const sysKeys = await keysDs.findJwkKeys();
                jwks = [];
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
                this.getCache().setValue(cacheKey, jwks);
            }

            return new SuccessResponse({
                keys: jwks
            });
        } else {
            return new BadRequestResponse({
                message: "INVALID_REQUEST",
                cause: `Invalid tenant ${tenant}`
            });
        }
    }
}
