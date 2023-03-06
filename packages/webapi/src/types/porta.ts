import { IDictionaryOf } from "@blendsdk/stdlib";
import { ISessionInfo, ISessionStorage } from "@blendsdk/webafx-auth";

export const PORTA_REGISTRY = "porta";

import {
    IAuthorizeRequest,
    ISysAuthorizationView,
    ISysGroupsByUserView,
    ISysTenant,
    ISysUser,
    ISysUserPermissionView,
    ISysUserProfile
} from "@porta/shared";

export interface IPortaUserMetaData {
    ui_locales: string;
    tenant: string;
    scope: string;
    claims: string;
    auth_time: number;
    roles: ISysGroupsByUserView[];
    permissions: ISysUserPermissionView[];
}

export interface IPortaSessionInfo
    extends ISessionInfo<ISysUser, ISysUserProfile & IDictionaryOf<any>, IPortaUserMetaData> {}

export interface IPortaSessionStorage extends ISessionStorage<IPortaSessionInfo> {
    tokenExpireAt: number;
}

export interface IPortaApplicationSetting {
    PORTA_SIGNIN_URI: string;
    PORTA_ADMIN: string;
    PORTA_PASSWORD: string;
    PORTA_SESSION_LENGTH: number;
    PORTA_SSO_COMMON_NAME: string;
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

export enum eOAuthClientType {
    webapp = "webapp",
    webapp_pkce = "webapp_pkce",
    spa = "spa"
}

export enum eOAuthPKCECodeChallengeMethod {
    S256 = "S256"
}

export enum eOAuthSigningAlg {
    RS256 = "RS256"
}

export enum eOAuthGrantType {
    authorization_code = "authorization_code",
    client_credentials = "client_credentials"
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
    invalid_request_object = "invalid_request_object",
    request_not_supported = "request_not_supported",
    request_uri_not_supported = "request_uri_not_supported",
    registration_not_supported = "registration_not_supported"
}

export interface IErrorResponseParams {
    error: eErrorType;
    error_description: string;
    redirect_uri: string;
    state: any;
    error_uri?: string;
    response_mode: string;
}
