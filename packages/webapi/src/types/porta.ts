// How log a nonce is locked before it can be reused
export const NONCE_TTL = 86400 * 1; // 1 day

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
}

export interface IPortaApplicationSetting {
    PORTA_SIGNIN_URI: string;
    PORTA_SSO_COMMON_NAME: string;
    PORTA_PUBLIC_DOMAIN: string;
    PORTA_REGISTRY_TENANT: string;
    PORTA_API_KEY: string;
    ACCESS_TOKEN_TTL: number;
    REFRESH_TOKEN_TTL: number;
    ENFORCE_PKCE: boolean;
    MFA_EMAIL_FROM: string;
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
    code = "code"
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