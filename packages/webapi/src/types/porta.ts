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
