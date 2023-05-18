import { eJsonSchemaType, eParameterLocation } from "@blendsdk/jsonschema";
import { IDatabaseAppSettings, IRouter } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import { databaseUtils } from "../../utils";
import { IDictionaryOf, MD5 } from "@blendsdk/stdlib";
import { BaseClient, Issuer, generators } from "openid-client";
import { IPortaApplicationSetting, eOAuthPKCECodeChallengeMethod } from "../../types";
import { SysClientDataService } from "../../dataservices/SysClientDataService";
import { renderGetRedirect } from "./utils";
import { expireSecondsFromNow } from "./utils";
import { OTA_TTL } from "../api/authorization/controllers/constants";

interface ITenantRequestParams {
    tenant: string;
    state?: string;
    code?: string;
}

// global
const oidcIssuer: IDictionaryOf<Issuer<BaseClient>> = {};
// global
const oidcClient: IDictionaryOf<BaseClient> = {};

async function getOIDCIssuer(tenant: string, req: HttpRequest): Promise<Issuer<BaseClient>> {
    if (!oidcIssuer[tenant]) {
        oidcIssuer[tenant] = await Issuer.discover(`${req.context.getServerURL()}/porta/oauth2`);
    }
    return oidcIssuer[tenant];
}

async function getOIDCClient(tenant: string, req: HttpRequest): Promise<BaseClient> {
    if (!oidcIssuer[tenant]) {
        const { PORTA_ADMIN, PORTA_PASSWORD } = req.context.getSettings<
            IPortaApplicationSetting & IDatabaseAppSettings
        >();

        const client_id = MD5([PORTA_ADMIN, PORTA_PASSWORD].join(""));
        const clientDs = new SysClientDataService();
        const clientRecord = await clientDs.findSysClientByClientId({
            client_id
        });

        const oidcIssuer = await getOIDCIssuer(tenant, req);
        oidcClient[tenant] = new oidcIssuer.Client({
            client_id: clientRecord.client_id,
            client_secret: clientRecord.secret,
            redirect_uris: [clientRecord.redirect_uri],
            response_types: ["code"]
        });
    }
    return oidcClient[tenant];
}

export const LocalAuthRoutes = (): IRouter => {
    return {
        routes: [
            {
                method: "get",
                url: "/:tenant/local/signin/callback",
                public: true,
                request: {
                    properties: {
                        tenant: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.params
                        },
                        code: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.query
                        },
                        state: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.query
                        }
                    }
                },
                handlers: (req: HttpRequest<ITenantRequestParams>, res: HttpResponse, next: NextFunction) => {
                    const worker = new Promise<string>(async (resolve, reject) => {
                        try {
                            const { tenant, state } = req.context.getParameters<ITenantRequestParams>();
                            const tenantRecord = await databaseUtils.findTenant(tenant);
                            if (tenantRecord && tenantRecord.is_active) {
                                const { code_verifier } = await req.context
                                    .getCache()
                                    .getValue<any>(`code_verifier:${tenantRecord.name}:${state}`);

                                const client = await getOIDCClient(tenant, req);
                                const params = client.callbackParams(req);
                                const tokenSet = await client.callback(
                                    `${req.context.getServerURL()}/${tenant}/local/signin/callback`,
                                    params,
                                    { code_verifier, state }
                                );

                                const expire = Date.now() + 1000 * tokenSet.expires_in;

                                res.cookie("_session", expire, {
                                    expires: new Date(expire)
                                });

                                res.redirect(`/fe/${tenant}/dashboard`);
                            } else {
                                resolve(undefined);
                            }
                        } catch (err) {
                            reject(err);
                        }
                    });

                    worker
                        .then((redirectTo) => {
                            if (redirectTo) {
                                res.send(renderGetRedirect(redirectTo));
                            } else {
                                next();
                            }
                        })
                        .catch((err) => {
                            next(err);
                        });
                }
            },
            {
                method: "get",
                url: "/:tenant/local/signin",
                public: true,
                request: {
                    properties: {
                        tenant: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.params
                        }
                    },
                    required: ["tenant"]
                },
                handlers: (req: HttpRequest<ITenantRequestParams>, res: HttpResponse, next: NextFunction) => {
                    const worker = new Promise<string>(async (resolve) => {
                        const { tenant } = req.context.getParameters<ITenantRequestParams>();
                        const tenantRecord = await databaseUtils.findTenant(tenant);
                        if (tenantRecord && tenantRecord.is_active) {
                            const state = crypto.randomUUID();
                            const code_verifier = generators.codeVerifier();

                            const oidcClient = await getOIDCClient(tenantRecord.name, req);

                            const redirectTo = oidcClient.authorizationUrl({
                                scope: "openid email profile",
                                state,
                                code_challenge: generators.codeChallenge(code_verifier),
                                code_challenge_method: eOAuthPKCECodeChallengeMethod.S256
                            });

                            await req.context.getCache().setValue(
                                `code_verifier:${tenantRecord.name}:${state}`,
                                {
                                    code_verifier
                                },
                                {
                                    expire: expireSecondsFromNow(OTA_TTL)
                                }
                            );

                            resolve(redirectTo);
                        } else {
                            resolve(undefined);
                        }
                    });

                    worker.then((redirectTo) => {
                        if (redirectTo) {
                            res.send(renderGetRedirect(redirectTo));
                        } else {
                            next();
                        }
                    });
                }
            },
            {
                method: "get",
                url: "/:tenant",
                public: true,
                request: {
                    properties: {
                        tenant: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.params
                        }
                    },
                    required: ["tenant"]
                },
                handlers: (req: HttpRequest<ITenantRequestParams>, res: HttpResponse, next: NextFunction) => {
                    const worker = new Promise<string>(async (resolve) => {
                        const { tenant } = req.context.getParameters<ITenantRequestParams>();
                        const tenantRecord = await databaseUtils.findTenant(tenant);
                        if (tenantRecord && tenantRecord.is_active) {
                            resolve(tenantRecord.name);
                        } else {
                            resolve(undefined);
                        }
                    });

                    worker.then((tenant) => {
                        if (tenant) {
                            res.cookie("_tenant", tenant);
                            res.redirect(`/fe/${tenant}/dashboard`);
                        } else {
                            res.redirect(`/fe/not-found`);
                        }
                    });
                }
            }
        ]
    };
};
