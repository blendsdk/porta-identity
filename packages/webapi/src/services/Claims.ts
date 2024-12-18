import { IDictionaryOf, isNullOrUndef, isObject, wrapInArray } from "@blendsdk/stdlib";
import {
    IAuthorizeRequest,
    ISysApplication,
    ISysClient,
    ISysPermission,
    ISysProfile,
    ISysRole,
    ISysTenant,
    ISysUser
} from "@porta/shared";
import { commonUtils } from "./CommonUtils";
import { neutralAvatar } from "./resources";

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

export interface IClames {
    application: ISysApplication;
    user: ISysUser;
    profile: ISysProfile;
    tenant: ISysTenant;
    roles: ISysRole[];
    permissions: ISysPermission[];
    client: ISysClient;
    serverUrl: string;
    auth_request_params: IAuthorizeRequest;
}

export enum eScopes {
    userinfo = "userinfo",
    profile = "profile",
    openid = "openid",
    email = "email",
    phone = "phone",
    acl = "acl",
    address = "address"
}

export enum eClaims {
    name = "name",
    updated_at = "updated_at",
    given_name = "given_name",
    family_name = "family_name",
    middle_name = "middle_name",
    nickname = "nickname",
    preferred_username = "preferred_username",
    signout_url = "signout_url",
    profile = "profile",
    picture = "picture",
    website = "website",
    gender = "gender",
    birthdate = "birthdate",
    zoneinfo = "zoneinfo",
    locale = "locale",
    profile_updated_at = "profile_updated_at",
    address = "address",
    sub = "sub",
    email = "email",
    email_verified = "email_verified",
    phone_number = "phone_number",
    phone_number_verified = "phone_number_verified",
    tenant = "tenant",
    roles = "roles",
    permissions = "permissions",
    metadata = "metadata"
}

/**
 * @export
 * @param {...eScopes[]} scopes
 * @return {*}
 */
export function mergeScopes(...scopes: eScopes[]) {
    return scopes
        .map((s) => {
            return s.toString();
        })
        .join(" ");
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

    protected config: IClames;

    /**
     * Creates an instance of Claims.
     * @param {IPortaSessionInfo} sessionStorage
     * @param {string} serverUrl
     * @param {string} tenantName
     * @memberof Claims
     */
    public constructor(config: IClames) {
        this.config = config;
        const {
            user = undefined,
            profile = undefined,
            tenant = undefined,
            permissions = [],
            roles = [],
            application = undefined,
            serverUrl
        } = config || {};

        if (user && profile) {
            const fq_email = user.username;

            this.handlers = [
                {
                    scope: [eScopes.userinfo, eScopes.profile],
                    claim: eClaims.metadata,
                    handler: this.handleClaim(() => {
                        return profile.metadata;
                    })
                },
                {
                    scope: [eScopes.userinfo, eScopes.profile],
                    claim: eClaims.name,
                    handler: this.handleClaim(() => {
                        return `${profile.firstname} ${profile.lastname}`;
                    })
                },
                {
                    scope: [eScopes.userinfo, eScopes.profile],
                    claim: eClaims.updated_at,
                    handler: this.handleClaim(() => {
                        return commonUtils.millisecondsToSeconds(new Date(user.date_modified).getTime());
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.given_name,
                    handler: this.handleClaim(() => {
                        return profile.firstname;
                    })
                },
                {
                    scope: [eScopes.userinfo, eScopes.profile],
                    claim: eClaims.family_name,
                    handler: this.handleClaim(() => {
                        return profile.lastname;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.middle_name,
                    handler: this.handleClaim(() => {
                        return profile.middle_name;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.nickname,
                    handler: this.handleClaim(() => {
                        return profile.firstname;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.preferred_username,
                    handler: this.handleClaim(() => {
                        return fq_email;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.signout_url,
                    handler: this.handleClaim(() => {
                        const signOutURL = new URL(`${serverUrl}/${tenant.name}/oauth2/logout`);
                        signOutURL.searchParams.append("client_id", application.client_id);
                        signOutURL.searchParams.append("logout_hint", user.id);
                        return signOutURL.toString();
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.profile,
                    handler: this.handleClaim(() => {
                        return `${serverUrl}/${tenant.id}/me`;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.picture,
                    handler: this.handleClaim(() => {
                        return profile.avatar ? profile.avatar : neutralAvatar;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.website,
                    handler: this.handleClaim(() => {
                        return profile.website;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.gender,
                    handler: this.handleClaim(() => {
                        return profile.gender;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.birthdate,
                    handler: this.handleClaim(() => {
                        return profile.birthdate;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.zoneinfo,
                    handler: this.handleClaim(() => {
                        return profile.zoneinfo;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.locale,
                    handler: this.handleClaim(() => {
                        return profile.locale;
                    })
                },
                {
                    scope: eScopes.profile,
                    claim: eClaims.profile_updated_at,
                    handler: this.handleClaim(() => {
                        return new Date(profile.date_modified).getTime();
                    })
                },
                {
                    scope: eScopes.address,
                    claim: eClaims.address,
                    handler: this.handleClaim(() => {
                        return {
                            address: profile.address || "n/a",
                            city: profile.city || "n/a",
                            postalcode: profile.postalcode || "n/a",
                            state: profile.state || "n/a",
                            country: profile.country || "n/a"
                        };
                    })
                },
                {
                    scope: eScopes.openid,
                    claim: eClaims.sub,
                    handler: this.handleClaim(() => {
                        return user.id;
                    })
                },
                {
                    scope: eScopes.email,
                    claim: eClaims.email,
                    handler: this.handleClaim(() => {
                        return profile.email || user.username;
                    })
                },
                {
                    scope: eScopes.email,
                    claim: eClaims.email_verified,
                    handler: this.handleClaim((essential) => {
                        // if not value in the db then return false when essential otherwise return whatever in the db
                        return essential ? (isNullOrUndef(user.is_active) ? false : user.is_active) : user.is_active;
                    })
                },
                {
                    scope: eScopes.phone,
                    claim: eClaims.phone_number,
                    handler: this.handleClaim(() => {
                        return profile.phone_number;
                    })
                },
                {
                    scope: eScopes.phone,
                    claim: eClaims.phone_number_verified,
                    handler: this.handleClaim(() => {
                        return profile.phone_number_verified;
                    })
                },
                {
                    scope: [eScopes.openid, eScopes.acl],
                    claim: eClaims.tenant,
                    handler: this.handleClaim(() => {
                        return {
                            id: tenant.id,
                            name: tenant.name,
                            organization: tenant.organization
                        };
                    })
                },
                {
                    scope: [eScopes.acl],
                    claim: eClaims.roles,
                    handler: this.handleClaim(() => {
                        return roles;
                    })
                },
                {
                    scope: [eScopes.acl],
                    claim: eClaims.permissions,
                    handler: this.handleClaim(() => {
                        return permissions;
                    })
                }
            ];
        } else {
            this.handlers = [];
        }
    }

    /**
     * @param {string[]} [customScopes]
     * @return {*}
     * @memberof Claims
     */
    public getClaimsList(customScopes?: string[]) {
        let { claims, scope } = this.config.auth_request_params || {};
        let claimsObj: IDictionaryOf<IClaim> = {};
        try {
            claimsObj = isObject(claims) ? claims : JSON.parse(claims);
            if (!isObject(claimsObj)) {
                claimsObj = {};
            }
        } catch {
            // no-op
        }

        const scopeList = Array.from(
            new Set([...(customScopes || []), ...[scope, Object.keys(claimsObj)].filter(Boolean)])
        )
            .join(" ")
            .trim();

        return Object.keys(commonUtils.parseSeparatedTokens(scopeList));
    }

    /**
     * Get claims by scope or individual claims
     *
     * @param {string[]} [customScopes]
     * @return {*}
     * @memberof Claims
     */
    public getClaims(customScopes?: string[]) {
        const { claims, scope } = this.config.auth_request_params || {};

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

        const scopeList = Array.from(
            new Set([...(customScopes || []), ...[scope, Object.keys(claimsObj)].filter(Boolean)])
        )
            .join(" ")
            .trim();

        // find all handler by scope
        Object.keys(commonUtils.parseSeparatedTokens(scopeList)).forEach((scopeName) => {
            this.handlers
                .filter((item) => {
                    return wrapInArray<string>(item.scope).includes(scopeName);
                })
                .forEach((handler) => {
                    try {
                        result[handler.claim] = handler.handler({});
                    } catch (err) {
                        // no handler found!
                        // debugger
                    }
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
