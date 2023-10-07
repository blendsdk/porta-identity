import { IDictionaryOf } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import { eKeySignatureType, portaAuthUtils } from "@porta/shared";
import { commonUtils, databaseUtils } from "../../../utils";

export class KeySignatureProvider {
    /**
     * KeySignature cache (safe for multiple docker instances)
     *
     * @protected
     * @type {IDictionaryOf<{ tenant: string; sig: string; id: string }>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected tenantKeySignatures: IDictionaryOf<{ tenant: string; sig: string; id: string }>;

    /**
     * Creates an instance of KeySignatureProvider.
     * @memberof KeySignatureProvider
     */
    public constructor() {
        this.tenantKeySignatures = {};
    }

    /**
     * Create and cache signature to find the access_tokens from Cookies
     *
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    // public async getKeySignature(req: HttpRequest) {
    //     const tenant = commonUtils.getTenantFromRequest(req);
    //     if (tenant && !this.tenantKeySignatures[tenant]) {
    //         const tenantRecord = await databaseUtils.findTenant(tenant);
    //         if (tenantRecord) {
    //             const { client_id } = await databaseUtils.getOIDCClientConfig(tenant);
    //             this.tenantKeySignatures[tenant] = {
    //                 id: tenantRecord.id,
    //                 tenant: tenantRecord.name,
    //                 sig: portaAuthUtils.getKeySignature({
    //                     tenant: tenantRecord.name,
    //                     client: client_id,
    //                     system: req.context.getServerURL(),
    //                     type: eKeySignatureType.access_token
    //                 })
    //             };
    //         }
    //     }
    //     return tenant ? this.tenantKeySignatures[tenant] : (undefined as any);
    // }

    public async getKeySignature(req: HttpRequest) {
        const tenant = commonUtils.getTenantFromRequest(req);
        let sig = undefined;
        if (tenant) {
            const tenantRecord = await databaseUtils.findTenant(tenant);
            if (tenantRecord) {
                const { client_id } = req.context.getParameters<{ client_id: string }>();
                if (!client_id) {
                    req.context.getLogger().warn(`NO CLIENT_ID in getKeySignature for ${req.context.getRoute().url}`);
                }
                sig = {
                    id: tenantRecord.id,
                    tenant: tenantRecord.name,
                    sig: portaAuthUtils.getKeySignature({
                        tenant: tenantRecord.name,
                        client: client_id,
                        system: req.context.getServerURL(),
                        type: eKeySignatureType.access_token
                    })
                };
            }
            req.context.getLogger().debug("SIG", { sig });
        }
        return sig;
    }
}

export const keySignatureProvider = new KeySignatureProvider();
