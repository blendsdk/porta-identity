import { IDictionaryOf } from "@blendsdk/stdlib";

import {
    IAuthorizeRequest,
    ISysAccessTokenAuthRequestParams,
    ISysAccessTokenView,
    ISysAuthorizationView,
    ISysClient,
    ISysGroup,
    ISysGroupsByUserView,
    ISysSession,
    ISysSessionView,
    ISysTenant,
    ISysUser,
    ISysUserPermissionView,
    ISysUserProfile
} from "@porta/shared";

export enum eLogoutFlowState {
    consent = "consent",
    finalize = "finalize"
}

//TODO: make dynamic from the config!
export const PORTA_REGISTRY = "porta";

/**
 * Interface describing the One Time Access Code cache
 *
 * @export
 * @interface IOTACache
 */
export interface IOTACache {
    /**
     * The auth flow id
     *
     * @type {string}
     * @memberof IOTACache
     */
    flowId: string;
    /**
     * Indicated whether the OTA is already used.
     *
     * @type {boolean}
     * @memberof IOTACache
     */
    used: boolean;
    /**
     * The token that the OTA refers to
     *
     * @type {string}
     * @memberof IOTACache
     */
    tokenRef: string;
    /**
     * Reference to the tenant
     *
     * @type {ISysTenant}
     * @memberof IOTACache
     */
    tenantRecord: ISysTenant;
}

/**
 * Meta data accompanying the signed-in user
 *
 * @export
 * @interface IPortaUserMetaData
 */
export interface IPortaUserMetaData {
    //TODO: wrote code doc
    ui_locales: string;
    tenant: string;
    scope: string;
    claims: string;
    auth_time: number;
    roles: ISysGroupsByUserView[];
    permissions: ISysUserPermissionView[];
}

export interface IAuthRequestParams extends ISysAccessTokenAuthRequestParams {
    auth_time?: number;
}

export interface IAccessToken
    extends Omit<
        ISysAccessTokenView,
        "user" | "profile" | "client" | "tenant" | "auth_time" | "auth_request" | "auth_request_params" | "session"
    > {
    auth_time: number;
    user: ISysUser;
    profile: ISysUserProfile;
    client: ISysClient;
    tenant: ISysTenant;
    session: ISysSession;
    permissions: ISysUserPermissionView[];
    roles: ISysGroup[];
    auth_request_params: IAuthRequestParams;
    anonymus_logout?: boolean;
}

export interface IPortaApplicationSetting {
    PORTA_SIGNIN_URI: string;
    PORTA_ADMIN: string;
    PORTA_PASSWORD: string;
    ACCESS_TOKEN_TTL: number;
    REFRESH_TOKEN_TTL: number;
    PORTA_SSO_COMMON_NAME: string;
}

export interface ILogoutFlowStorage extends Omit<ISysSessionView, "user" | "client"> {
    client: ISysClient;
    user: ISysUser;
    tenant: string;
    flowState?: eLogoutFlowState;
    finalizeURL: string;
    state?: string;
    post_logout_redirect_uri: string;
}

export interface ICachedFlowInformation {
    flowId: string;
    expire: number;
    authRecord: ISysAuthorizationView;
    authRequest: IAuthorizeRequest;
    currentUserToken: string;
    tenantRecord: ISysTenant;
    response_types: string[];
    confidentialClient: boolean;
}

export interface IFlowRedirect {
    response_mode: string;
    response: IDictionaryOf<string>;
    redirect_uri: string;
}

export interface ICachedUser {
    tenant: ISysTenant;
    user: ISysUser;
}

export enum eOAuthResponseType {
    code = "code",
    none = "none"
}

export enum eOAuthResponseMode {
    query = "query",
    form_post = "form_post"
}

export enum eOAuthPKCECodeChallengeMethod {
    S256 = "S256"
}

export enum eOAuthSigningAlg {
    RS256 = "RS256"
}

export enum eOAuthGrantType {
    authorization_code = "authorization_code",
    client_credentials = "client_credentials",
    refresh_token = "refresh_token"
}

export enum eOAuthScope {
    openid = "openid",
    profile = "profile",
    email = "email",
    address = "address",
    phone = "phone",
    offline_access = "offline_access"
}

export enum eOAuthClaims {
    sub = "sub",
    iss = "iss"
}

export enum eOAuthTokenEndpointAuthMethods {
    client_secret_post = "client_secret_post",
    client_secret_basic = "client_secret_basic"
}

export enum eOAuthDisplayModes {
    page = "page",
    popup = "popup",
    touch = "touch",
    wap = "wap"
}

export enum eOAuthPrompt {
    none = "none",
    login = "login",
    consent = "consent",
    select_account = "select_account"
}

export enum eErrorType {
    interaction_required = "interaction_required",
    login_required = "login_required",
    account_selection_required = "account_selection_required",
    consent_required = "consent_required",
    invalid_request_uri = "invalid_request_uri",
    invalid_request = "invalid_request",
    invalid_grant = "invalid_grant",
    invalid_request_object = "invalid_request_object",
    request_not_supported = "request_not_supported",
    request_uri_not_supported = "request_uri_not_supported",
    registration_not_supported = "registration_not_supported"
}

export interface IErrorResponseParams {
    error: eErrorType;
    error_description: string;
    redirect_uri?: string;
    state?: any;
    error_uri?: string;
    response_mode?: string;
}

export enum eClientType {
    public = "P",
    confidential = "C",
    service = "S",
    device = "D"
}
