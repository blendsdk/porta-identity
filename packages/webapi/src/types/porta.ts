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

export enum eDatabaseType {
    system = "system",
    registry = "registry"
}
