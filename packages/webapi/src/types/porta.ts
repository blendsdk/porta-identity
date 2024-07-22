import { IAuthorizeRequest, ISysAuthorizationView, ISysProfile, ISysSession, ISysTenant, ISysUser } from "@porta/shared";

// How log a nonce is locked before it can be reused
export const CONST_NONCE_TTL = 86400 * 1; // 1 day
export const CONST_AUTH_FLOW_TTL = 60 * 5; // 5 mins
export const CONST_DAY_IN_SECONDS = 60 * 60 * 24;
export const CONST_OTA_TTL = 30;

export const MFA_TYPE_PORTAMAIL = "portamail";

export interface IAuthorizationFlow {
    authRequest: IAuthorizeRequest;
    authRecord: ISysAuthorizationView;
    user: ISysUser,
    profile: ISysProfile,
    account_state: boolean;
    mfa_state: boolean;
    mfa_request: string;
    flowId: string;
    expire: number;
    tenantRecord: ISysTenant;
    session: ISysSession;
    complete: boolean;
}

export enum eErrorType {
    invalid_authorization = "invalid_authorization",
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
    registration_not_supported = "registration_not_supported",
    invalid_tenant = "invalid_tenant"
}

export interface IErrorResponseParams {
    error: eErrorType;
    error_description: string;
    redirect_uri?: string;
    state?: any;
    error_uri?: string;
    response_mode?: string;
    response_type?: string;
}

export interface IPortaApplicationSetting {
    PORTA_SSO_COMMON_NAME: string;
    PORTA_PUBLIC_DOMAIN: string;
    PORTA_REGISTRY_TENANT: string;
    PORTA_API_KEY: string;
    ACCESS_TOKEN_TTL: number;
    REFRESH_TOKEN_TTL: number;
    BYPASS_MFA_DAYS: number;
    ENFORCE_PKCE: boolean;
    MFA_EMAIL_FROM: string;
    AUTH_SESSION_LENGTH_HOURS: number;
}

export enum eClientType {
    public = "P",
    confidential = "C",
    service = "S",
    device = "D"
}

export enum eOAuthPKCECodeChallengeMethod {
    S256 = "S256"
}

export enum eOAuthTokenEndpointAuthMethods {
    client_secret_post = "client_secret_post",
    client_secret_basic = "client_secret_basic"
}

export enum eOAuthSigningAlg {
    RS256 = "RS256"
}

export enum eOAuthScope {
    openid = "openid",
    profile = "profile",
    email = "email",
    address = "address",
    phone = "phone",
    offline_access = "offline_access"
}

export enum eOAuthGrantType {
    authorization_code = "authorization_code",
    client_credentials = "client_credentials",
    refresh_token = "refresh_token"
}

export enum eOAuthResponseType {
    code = "code", //
    token = "token",
    id_token = "id_token", //
    id_token_token = "id_token token",
    code_id_token = "code id_token", //
    code_token = "code token", //
    code_id_token_token = "code id_token token" //
}

export enum eOAuthClaims {
    sub = "sub",
    iss = "iss"
}

export enum eDatabaseType {
    system = "system",
    registry = "registry"
}

export enum eOAuthDisplayModes {
    page = "page",
    popup = "popup",
    touch = "touch",
    wap = "wap"
}

export enum eOAuthResponseMode {
    query = "query",
    form_post = "form_post"
}

export enum eOAuthPrompt {
    none = "none",
    login = "login",
    consent = "consent",
    select_account = "select_account"
}