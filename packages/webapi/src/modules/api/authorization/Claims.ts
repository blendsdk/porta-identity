import { IDictionaryOf, isNullOrUndef, isObject, wrapInArray } from "@blendsdk/stdlib";
import { eDefaultPermissions } from "@porta/shared";
import { IAccessToken } from "../../../types";
import { commonUtils } from "../../../utils";

/**
 * Interface describing a claim
 *
 * @export
 * @class IClaim
 */
export class IClaim {
    essential?: boolean;
    value?: any;
    values?: any[];
}

/**
 * Describes a Claim handler
 *
 * @export
 * @interface IClaimHandlerRecord
 */
export interface IClaimHandlerRecord {
    scope: string | string[];
    claim: string;
    handler: (claim?: IClaim) => any;
}

/**
 * Implements Claims compilation
 *
 * @export
 * @class Claims
 */
export class Claims {
    /**
     * A list of claim handlers
     *
     * @protected
     * @type {IClaimHandlerRecord[]}
     * @memberof Claims
     */
    protected handlers: IClaimHandlerRecord[];

    protected accessTokenStorage: IAccessToken;

    /**
     * Creates an instance of Claims.
     * @param {IPortaSessionInfo} sessionStorage
     * @param {string} serverUrl
     * @param {string} tenantName
     * @memberof Claims
     */
    public constructor(accessTokenStorage: IAccessToken, serverUrl: string, tenantName: string) {
        const { user, profile, tenant, permissions, roles, client } = accessTokenStorage || {};

        this.accessTokenStorage = accessTokenStorage;

        if (user && profile) {
            const fq_email = user.username;

            this.handlers = [
                {
                    scope: ["userinfo", "profile"],
                    claim: "name",
                    handler: this.handleClaim(() => {
                        return `${profile.firstname} ${profile.lastname}`;
                    })
                },
                {
                    scope: ["userinfo", "profile"],
                    claim: "updated_at",
                    handler: this.handleClaim(() => {
                        return new Date(user.date_changed).getTime();
                    })
                },
                {
                    scope: "profile",
                    claim: "given_name",
                    handler: this.handleClaim(() => {
                        return profile.firstname;
                    })
                },
                {
                    scope: ["userinfo", "profile"],
                    claim: "family_name",
                    handler: this.handleClaim(() => {
                        return profile.lastname;
                    })
                },
                {
                    scope: "profile",
                    claim: "middle_name",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "profile",
                    claim: "nickname",
                    handler: this.handleClaim(() => {
                        return profile.firstname;
                    })
                },
                {
                    scope: "profile",
                    claim: "preferred_username",
                    handler: this.handleClaim(() => {
                        return fq_email;
                    })
                },
                {
                    scope: "profile",
                    claim: "signout_url",
                    handler: this.handleClaim(() => {
                        const signOutURL = new URL(`${serverUrl}/${tenant.name}/oauth2/logout`);
                        signOutURL.searchParams.append("client_id", client.client_id);
                        signOutURL.searchParams.append("logout_hint", user.id);
                        return signOutURL.toString();
                    })
                },
                {
                    scope: "profile",
                    claim: "profile",
                    handler: this.handleClaim(() => {
                        return `${serverUrl}/${tenantName}/profile/me`;
                    })
                },
                {
                    scope: "profile",
                    claim: "picture",
                    handler: this.handleClaim(() => {
                        return profile.avatar ? profile.avatar : "n/a";
                    })
                },
                {
                    scope: "profile",
                    claim: "website",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "profile",
                    claim: "gender",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "profile",
                    claim: "birthdate",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "profile",
                    claim: "zoneinfo",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "profile",
                    claim: "locale",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "profile",
                    claim: "profile_updated_at",
                    handler: this.handleClaim(() => {
                        return new Date(profile.date_changed).getTime();
                    })
                },
                {
                    scope: "address",
                    claim: "address",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "openid",
                    claim: "sub",
                    handler: this.handleClaim(() => {
                        return user.id;
                    })
                },
                {
                    scope: "email",
                    claim: "email",
                    handler: this.handleClaim(() => {
                        return profile.email || user.username;
                    })
                },
                {
                    scope: "email",
                    claim: "email_verified",
                    handler: this.handleClaim((essential) => {
                        // if not value in the db then return false when essential otherwise return whatever in the db
                        return essential ? (isNullOrUndef(user.is_active) ? false : user.is_active) : user.is_active;
                    })
                },
                {
                    scope: "phone",
                    claim: "phone_number",
                    handler: this.handleClaim(() => {
                        return undefined;
                    })
                },
                {
                    scope: "phone",
                    claim: "phone_number_verified",
                    handler: this.handleClaim(() => {
                        return false;
                    })
                },
                {
                    scope: "acl",
                    claim: "tenant",
                    handler: this.handleClaim(() => {
                        return {
                            id: tenant.id,
                            name: tenant.name,
                            organization: tenant.organization
                        };
                    })
                },
                {
                    scope: "acl",
                    claim: "roles",
                    handler: this.handleClaim(() => {
                        const tmp = roles
                            .filter((r) => {
                                return r.is_active === true;
                            })
                            .map((r) => {
                                return {
                                    role_id: r.id,
                                    role: r.name
                                };
                            });
                        return tmp.filter((obj, index) => {
                            return index === tmp.findIndex((o) => obj.role_id === o.role_id);
                        });
                    })
                },
                {
                    scope: "acl",
                    claim: "permissions",
                    handler: this.handleClaim(() => {
                        const tmp = permissions
                            .filter((r) => {
                                // Here we filter the GROUP_PERMISSION since it is for handling Role based access only
                                return r.is_active === true && r.code !== eDefaultPermissions.GROUP_PERMISSION.code;
                            })
                            .map((r) => {
                                return {
                                    permission_id: r.permission_id,
                                    permission: r.code
                                };
                            });
                        return tmp.filter((obj, index) => {
                            return index === tmp.findIndex((o) => obj.permission_id === o.permission_id);
                        });
                    })
                }
            ];
        } else {
            this.handlers = [];
        }
    }

    /**
     * Get claims by scope or individual claims
     *
     * @param {{ scope?: string; claims?: IDictionaryOf<IClaim> }} { scope, claims }
     * @returns
     * @memberof Claims
     */
    public getClaims() {
        const { auth_request_params } = this.accessTokenStorage || {};
        const { claims, scope } = auth_request_params || {};

        const result: IDictionaryOf<any> = {};
        let claimsObj: IDictionaryOf<IClaim> = {};

        try {
            claimsObj = isObject(claims) ? claims : JSON.parse(claims);
            if (!isObject(claimsObj)) {
                claimsObj = {};
            }
        } catch {
            // no-op
        }

        const additionalHandlers = [];
        Object.entries(claimsObj).forEach(([scopeName, claims]) => {
            Object.keys(claims || {}).forEach((key) => {
                this.handlers
                    .filter((handler) => {
                        return handler.claim === key;
                    })
                    .forEach((handler) => {
                        wrapInArray<string>(scopeName).forEach((sName) => {
                            additionalHandlers.push({ ...handler, scope: sName });
                        });
                    });
            });
        });

        additionalHandlers.forEach((handler) => {
            this.handlers.push(handler);
        });

        const scopeList = [scope, Object.keys(claimsObj)].filter(Boolean).join(" ");

        // find all handler by scope
        Object.keys(commonUtils.parseSeparatedTokens(scopeList)).forEach((scopeName) => {
            this.handlers
                .filter((item) => {
                    return wrapInArray<string>(item.scope).includes(scopeName);
                })
                .forEach((handler) => {
                    result[handler.claim] = handler.handler({});
                });
        });

        Object.entries(claimsObj || {}).forEach(([claimName, claim]) => {
            this.handlers
                .filter((item) => {
                    return item.claim === claimName;
                })
                .forEach((handler) => {
                    result[handler.claim] = handler.handler(claim);
                });
        });

        return result;
    }

    /**
     * Create a claim handler
     *
     * @protected
     * @param {(essential: boolean, values: any[]) => any} getValue
     * @returns
     * @memberof Claims
     */
    protected handleClaim(getValue: (essential: boolean, values: any[]) => any) {
        return (claim: IClaim) => {
            let { essential, value, values } =
                claim === null ? { essential: false, value: undefined, values: undefined } : claim;

            // normalize the essential value, set true by default
            essential = essential === false ? false : true;

            if (value) {
                // if a value is provided then just return it since this is set by the client
                return value;
            } else {
                // otherwise handle per case
                return getValue(essential, values);
            }
        };
    }
}
