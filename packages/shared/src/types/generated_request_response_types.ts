/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IErrorData, IAuthenticationFlowState, IOpsResponse } from "./generated_types";
import { ISysUser, ISysUserProfile, ISysTenant } from "./generated_database_types";

/**
 * @export
 * @interface IErrorResponse
 */
export interface IErrorResponse {
	/**
	 * @type number
	 * @memberOf IErrorResponse
	 */
	status: number;
	/**
	 * @type IErrorData
	 * @memberOf IErrorResponse
	 */
	data: IErrorData;
}

/**
 * @export
 * @interface IGetTranslationsRequest
 */
export interface IGetTranslationsRequest {
	/**
	 * @type string
	 * @memberOf IGetTranslationsRequest
	 */
	locale?: string;
	/**
	 * @type boolean
	 * @memberOf IGetTranslationsRequest
	 */
	save?: boolean;
}

/**
 * @export
 * @interface IGetTranslationsResponse
 */
export interface IGetTranslationsResponse {
	/**
	 * @type any
	 * @memberOf IGetTranslationsResponse
	 */
	data: any;
}

/**
 * @export
 * @interface IGetAppVersionRequest
 */
export interface IGetAppVersionRequest {}

/**
 * @export
 * @interface IGetAppVersion
 */
export interface IGetAppVersion {
	/**
	 * @type string
	 * @memberOf IGetAppVersion
	 */
	webclient: string;
	/**
	 * @type string
	 * @memberOf IGetAppVersion
	 */
	webapi: string;
	/**
	 * @type string
	 * @memberOf IGetAppVersion
	 */
	mobileclient: string;
}

/**
 * @export
 * @interface IGetAppVersionResponse
 */
export interface IGetAppVersionResponse {
	/**
	 * @type IGetAppVersion
	 * @memberOf IGetAppVersionResponse
	 */
	data: IGetAppVersion;
}

/**
 * @export
 * @interface ITokenInfoRequest
 */
export interface ITokenInfoRequest {
	/**
	 * @type string
	 * @memberOf ITokenInfoRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf ITokenInfoRequest
	 */
	token: string;
	/**
	 * @type string
	 * @memberOf ITokenInfoRequest
	 */
	client_id?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfoRequest
	 */
	client_secret?: string;
}

/**
 * @export
 * @interface ITokenInfo
 */
export interface ITokenInfo {
	/**
	 * @type boolean
	 * @memberOf ITokenInfo
	 */
	active: boolean;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	scope?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	client_id?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	username?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	token_type?: string;
	/**
	 * @type number
	 * @memberOf ITokenInfo
	 */
	exp?: number;
	/**
	 * @type number
	 * @memberOf ITokenInfo
	 */
	iat?: number;
	/**
	 * @type number
	 * @memberOf ITokenInfo
	 */
	nbf?: number;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	sub?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	aud?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	iss?: string;
	/**
	 * @type string
	 * @memberOf ITokenInfo
	 */
	jti?: string;
}

/**
 * @export
 * @interface ITokenInfoResponse
 */
export interface ITokenInfoResponse {
	/**
	 * @type ITokenInfo
	 * @memberOf ITokenInfoResponse
	 */
	data: ITokenInfo;
}

/**
 * @export
 * @interface IAuthorizeRequest
 */
export interface IAuthorizeRequest {
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	response_type?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	redirect_uri: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	scope: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	nonce?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	response_mode?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	state?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	code_challenge?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	code_challenge_method?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	ui_locales?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	request?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	acr_values?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	claims?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	prompt?: string;
	/**
	 * @type number
	 * @memberOf IAuthorizeRequest
	 */
	max_age?: number;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	display?: string;
	/**
	 * @type string
	 * @memberOf IAuthorizeRequest
	 */
	resource?: string;
}

/**
 * @export
 * @interface IAuthorize
 */
export interface IAuthorize {}

/**
 * @export
 * @interface IAuthorizeResponse
 */
export interface IAuthorizeResponse {
	/**
	 * @type IAuthorize
	 * @memberOf IAuthorizeResponse
	 */
	data: IAuthorize;
}

/**
 * @export
 * @interface ITokenRequest
 */
export interface ITokenRequest {
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	client_id?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	redirect_uri?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	grant_type: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	code?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	code_verifier?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	client_secret?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	state?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	nonce?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	scope?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	claims?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	refresh_token?: string;
	/**
	 * @type string
	 * @memberOf ITokenRequest
	 */
	resource?: string;
}

/**
 * @export
 * @interface IToken
 */
export interface IToken {
	/**
	 * @type string
	 * @memberOf IToken
	 */
	access_token: string;
	/**
	 * @type string
	 * @memberOf IToken
	 */
	token_type: string;
	/**
	 * @type number
	 * @memberOf IToken
	 */
	expires_in: number;
	/**
	 * @type string
	 * @memberOf IToken
	 */
	id_token: string;
	/**
	 * @type string
	 * @memberOf IToken
	 */
	refresh_token?: string;
	/**
	 * @type number
	 * @memberOf IToken
	 */
	refresh_token_expires_in?: number;
	/**
	 * @type number
	 * @memberOf IToken
	 */
	refresh_token_expires_at?: number;
}

/**
 * @export
 * @interface ITokenResponse
 */
export interface ITokenResponse {
	/**
	 * @type IToken
	 * @memberOf ITokenResponse
	 */
	data: IToken;
}

/**
 * @export
 * @interface ISigninRequest
 */
export interface ISigninRequest {
	/**
	 * @type string
	 * @memberOf ISigninRequest
	 */
	af?: string;
}

/**
 * @export
 * @interface ISignin
 */
export interface ISignin {}

/**
 * @export
 * @interface ISigninResponse
 */
export interface ISigninResponse {
	/**
	 * @type ISignin
	 * @memberOf ISigninResponse
	 */
	data: ISignin;
}

/**
 * @export
 * @interface IRedirectRequest
 */
export interface IRedirectRequest {
	/**
	 * @type string
	 * @memberOf IRedirectRequest
	 */
	af: string;
}

/**
 * @export
 * @interface IRedirect
 */
export interface IRedirect {}

/**
 * @export
 * @interface IRedirectResponse
 */
export interface IRedirectResponse {
	/**
	 * @type IRedirect
	 * @memberOf IRedirectResponse
	 */
	data: IRedirect;
}

/**
 * @export
 * @interface IFlowInfoRequest
 */
export interface IFlowInfoRequest {
	/**
	 * @type string
	 * @memberOf IFlowInfoRequest
	 */
	af?: string;
}

/**
 * @export
 * @interface IFlowInfo
 */
export interface IFlowInfo {
	/**
	 * @type string
	 * @memberOf IFlowInfo
	 */
	logo: string;
	/**
	 * @type string
	 * @memberOf IFlowInfo
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf IFlowInfo
	 */
	application_name: string;
	/**
	 * @type string
	 * @memberOf IFlowInfo
	 */
	organization: string;
	/**
	 * @type boolean
	 * @memberOf IFlowInfo
	 */
	allow_reset_password: boolean;
	/**
	 * @type boolean
	 * @memberOf IFlowInfo
	 */
	allow_registration: boolean;
}

/**
 * @export
 * @interface IFlowInfoResponse
 */
export interface IFlowInfoResponse {
	/**
	 * @type IFlowInfo
	 * @memberOf IFlowInfoResponse
	 */
	data: IFlowInfo;
}

/**
 * @export
 * @interface ICheckFlowRequest
 */
export interface ICheckFlowRequest {
	/**
	 * @type string
	 * @memberOf ICheckFlowRequest
	 */
	state: string;
	/**
	 * @type string
	 * @memberOf ICheckFlowRequest
	 */
	af?: string;
	/**
	 * @type string
	 * @memberOf ICheckFlowRequest
	 */
	options?: string;
}

/**
 * @export
 * @interface ICheckFlowResponse
 */
export interface ICheckFlowResponse {
	/**
	 * @type IAuthenticationFlowState
	 * @memberOf ICheckFlowResponse
	 */
	data: IAuthenticationFlowState;
}

/**
 * @export
 * @interface IOidcDiscoveryRequest
 */
export interface IOidcDiscoveryRequest {
	/**
	 * @type string
	 * @memberOf IOidcDiscoveryRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IOidcDiscovery
 */
export interface IOidcDiscovery {}

/**
 * @export
 * @interface IOidcDiscoveryResponse
 */
export interface IOidcDiscoveryResponse {}

/**
 * @export
 * @interface IOidcDiscoveryKeysRequest
 */
export interface IOidcDiscoveryKeysRequest {
	/**
	 * @type string
	 * @memberOf IOidcDiscoveryKeysRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IOidcDiscoveryKeys
 */
export interface IOidcDiscoveryKeys {}

/**
 * @export
 * @interface IOidcDiscoveryKeysResponse
 */
export interface IOidcDiscoveryKeysResponse {}

/**
 * @export
 * @interface IUserInfoGetRequest
 */
export interface IUserInfoGetRequest {
	/**
	 * @type string
	 * @memberOf IUserInfoGetRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IUserInfoGet
 */
export interface IUserInfoGet {}

/**
 * @export
 * @interface IUserInfoGetResponse
 */
export interface IUserInfoGetResponse {}

/**
 * @export
 * @interface IUserInfoPostRequest
 */
export interface IUserInfoPostRequest {
	/**
	 * @type string
	 * @memberOf IUserInfoPostRequest
	 */
	access_token?: string;
	/**
	 * @type string
	 * @memberOf IUserInfoPostRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IUserInfoPost
 */
export interface IUserInfoPost {}

/**
 * @export
 * @interface IUserInfoPostResponse
 */
export interface IUserInfoPostResponse {}

/**
 * @export
 * @interface ISessionLogoutGetRequest
 */
export interface ISessionLogoutGetRequest {
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	tenant?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	id_token_hint?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	logout_hint?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	client_id?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	post_logout_redirect_uri?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	state?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	ui_locales?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutGetRequest
	 */
	lf?: string;
}

/**
 * @export
 * @interface ISessionLogoutGet
 */
export interface ISessionLogoutGet {}

/**
 * @export
 * @interface ISessionLogoutGetResponse
 */
export interface ISessionLogoutGetResponse {}

/**
 * @export
 * @interface ISessionLogoutPostRequest
 */
export interface ISessionLogoutPostRequest {
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	id_token_hint?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	logout_hint?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	client_id?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	post_logout_redirect_uri?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	state?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	ui_locales?: string;
	/**
	 * @type string
	 * @memberOf ISessionLogoutPostRequest
	 */
	lf?: string;
}

/**
 * @export
 * @interface ISessionLogoutPost
 */
export interface ISessionLogoutPost {}

/**
 * @export
 * @interface ISessionLogoutPostResponse
 */
export interface ISessionLogoutPostResponse {}

/**
 * @export
 * @interface ILogoutFlowInfoRequest
 */
export interface ILogoutFlowInfoRequest {
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfoRequest
	 */
	lf?: string;
}

/**
 * @export
 * @interface ILogoutFlowInfo
 */
export interface ILogoutFlowInfo {
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfo
	 */
	logo: string;
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfo
	 */
	application_name: string;
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfo
	 */
	organization: string;
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfo
	 */
	finalize_url: string;
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfo
	 */
	flowId: string;
	/**
	 * @type boolean
	 * @memberOf ILogoutFlowInfo
	 */
	has_post_redirect: boolean;
}

/**
 * @export
 * @interface ILogoutFlowInfoResponse
 */
export interface ILogoutFlowInfoResponse {
	/**
	 * @type ILogoutFlowInfo
	 * @memberOf ILogoutFlowInfoResponse
	 */
	data: ILogoutFlowInfo;
}

/**
 * @export
 * @interface IForgotPasswordFlowInfoRequest
 */
export interface IForgotPasswordFlowInfoRequest {}

/**
 * @export
 * @interface IForgotPasswordFlowInfo
 */
export interface IForgotPasswordFlowInfo {
	/**
	 * @type string
	 * @memberOf IForgotPasswordFlowInfo
	 */
	logo: string;
	/**
	 * @type string
	 * @memberOf IForgotPasswordFlowInfo
	 */
	organization: string;
}

/**
 * @export
 * @interface IForgotPasswordFlowInfoResponse
 */
export interface IForgotPasswordFlowInfoResponse {
	/**
	 * @type IForgotPasswordFlowInfo
	 * @memberOf IForgotPasswordFlowInfoResponse
	 */
	data: IForgotPasswordFlowInfo;
}

/**
 * @export
 * @interface IForgotPasswordRequestAccountRequest
 */
export interface IForgotPasswordRequestAccountRequest {
	/**
	 * @type string
	 * @memberOf IForgotPasswordRequestAccountRequest
	 */
	account: string;
}

/**
 * @export
 * @interface IForgotPasswordRequestAccount
 */
export interface IForgotPasswordRequestAccount {}

/**
 * @export
 * @interface IForgotPasswordRequestAccountResponse
 */
export interface IForgotPasswordRequestAccountResponse {
	/**
	 * @type IForgotPasswordRequestAccount
	 * @memberOf IForgotPasswordRequestAccountResponse
	 */
	data: IForgotPasswordRequestAccount;
}

/**
 * @export
 * @interface ICheckPasswordResetRequestRequest
 */
export interface ICheckPasswordResetRequestRequest {
	/**
	 * @type string
	 * @memberOf ICheckPasswordResetRequestRequest
	 */
	flow: string;
}

/**
 * @export
 * @interface ICheckPasswordResetRequest
 */
export interface ICheckPasswordResetRequest {
	/**
	 * @type string
	 * @memberOf ICheckPasswordResetRequest
	 */
	logo: string;
	/**
	 * @type string
	 * @memberOf ICheckPasswordResetRequest
	 */
	organization: string;
}

/**
 * @export
 * @interface ICheckPasswordResetRequestResponse
 */
export interface ICheckPasswordResetRequestResponse {
	/**
	 * @type ICheckPasswordResetRequest
	 * @memberOf ICheckPasswordResetRequestResponse
	 */
	data: ICheckPasswordResetRequest;
}

/**
 * @export
 * @interface IRequestPasswordResetRequest
 */
export interface IRequestPasswordResetRequest {
	/**
	 * @type string
	 * @memberOf IRequestPasswordResetRequest
	 */
	flow: string;
	/**
	 * @type string
	 * @memberOf IRequestPasswordResetRequest
	 */
	password: string;
	/**
	 * @type string
	 * @memberOf IRequestPasswordResetRequest
	 */
	confirmPassword: string;
}

/**
 * @export
 * @interface IRequestPasswordReset
 */
export interface IRequestPasswordReset {
	/**
	 * @type boolean
	 * @memberOf IRequestPasswordReset
	 */
	status: boolean;
}

/**
 * @export
 * @interface IRequestPasswordResetResponse
 */
export interface IRequestPasswordResetResponse {
	/**
	 * @type IRequestPasswordReset
	 * @memberOf IRequestPasswordResetResponse
	 */
	data: IRequestPasswordReset;
}

/**
 * @export
 * @interface IAuthenticationKeepAliveRequest
 */
export interface IAuthenticationKeepAliveRequest {}

/**
 * @export
 * @interface IAuthenticationKeepAliveResponse
 */
export interface IAuthenticationKeepAliveResponse {}

/**
 * @export
 * @interface IAuthenticationLogoutRequest
 */
export interface IAuthenticationLogoutRequest {}

/**
 * @export
 * @interface IAuthenticationLogoutResponse
 */
export interface IAuthenticationLogoutResponse {}

/**
 * @export
 * @interface IAuthenticationLoginRequest
 */
export interface IAuthenticationLoginRequest {
	/**
	 * @type string
	 * @memberOf IAuthenticationLoginRequest
	 */
	username: string;
	/**
	 * @type string
	 * @memberOf IAuthenticationLoginRequest
	 */
	password: string;
	/**
	 * @type string
	 * @memberOf IAuthenticationLoginRequest
	 */
	language?: string;
}

/**
 * @export
 * @interface IAuthenticationLoginResponse
 */
export interface IAuthenticationLoginResponse {
	/**
	 * @type string
	 * @memberOf IAuthenticationLoginResponse
	 */
	token: string;
	/**
	 * @type string
	 * @memberOf IAuthenticationLoginResponse
	 */
	token_key: string;
	/**
	 * @type number
	 * @memberOf IAuthenticationLoginResponse
	 */
	expire: number;
	/**
	 * @type number
	 * @memberOf IAuthenticationLoginResponse
	 */
	ttl: number;
}

/**
 * @export
 * @interface IInitializeRequest
 */
export interface IInitializeRequest {
	/**
	 * @type string
	 * @memberOf IInitializeRequest
	 */
	username?: string;
	/**
	 * @type string
	 * @memberOf IInitializeRequest
	 */
	password: string;
	/**
	 * @type string
	 * @memberOf IInitializeRequest
	 */
	email: string;
}

/**
 * @export
 * @interface IInitialize
 */
export interface IInitialize {
	/**
	 * @type string
	 * @memberOf IInitialize
	 */
	error?: string;
	/**
	 * @type boolean
	 * @memberOf IInitialize
	 */
	status: boolean;
}

/**
 * @export
 * @interface IInitializeResponse
 */
export interface IInitializeResponse {
	/**
	 * @type IInitialize
	 * @memberOf IInitializeResponse
	 */
	data: IInitialize;
}

/**
 * @export
 * @interface IGetUserProfileRequest
 */
export interface IGetUserProfileRequest {
	/**
	 * @type string
	 * @memberOf IGetUserProfileRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IGetUserProfile
 */
export interface IGetUserProfile {
	/**
	 * @type ISysUser
	 * @memberOf IGetUserProfile
	 */
	user: ISysUser;
	/**
	 * @type ISysUserProfile
	 * @memberOf IGetUserProfile
	 */
	profile: ISysUserProfile;
}

/**
 * @export
 * @interface IGetUserProfileResponse
 */
export interface IGetUserProfileResponse {
	/**
	 * @type IGetUserProfile
	 * @memberOf IGetUserProfileResponse
	 */
	data: IGetUserProfile;
}

/**
 * @export
 * @interface IListOpenIdTenantRequest
 */
export interface IListOpenIdTenantRequest {}

/**
 * @export
 * @interface IListOpenIdTenant
 */
export interface IListOpenIdTenant {}

/**
 * @export
 * @interface IListOpenIdTenantResponse
 */
export interface IListOpenIdTenantResponse {
	/**
	 * @type IListOpenIdTenant
	 * @memberOf IListOpenIdTenantResponse
	 */
	data: IListOpenIdTenant;
}

/**
 * @export
 * @interface IGetOpenIdTenantRequest
 */
export interface IGetOpenIdTenantRequest {}

/**
 * @export
 * @interface IGetOpenIdTenant
 */
export interface IGetOpenIdTenant {}

/**
 * @export
 * @interface IGetOpenIdTenantResponse
 */
export interface IGetOpenIdTenantResponse {
	/**
	 * @type IGetOpenIdTenant
	 * @memberOf IGetOpenIdTenantResponse
	 */
	data: IGetOpenIdTenant;
}

/**
 * @export
 * @interface ICreateOpenIdTenantRequest
 */
export interface ICreateOpenIdTenantRequest {
	/**
	 * @type string
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	name: string;
	/**
	 * @type string
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	email: string;
	/**
	 * @type string
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	password: string;
	/**
	 * @type boolean
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	allow_registration: boolean;
	/**
	 * @type boolean
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	allow_reset_password: boolean;
	/**
	 * @type string
	 * @memberOf ICreateOpenIdTenantRequest
	 */
	organization: string;
}

/**
 * @export
 * @interface ICreateOpenIdTenantResponse
 */
export interface ICreateOpenIdTenantResponse {
	/**
	 * @type ISysTenant
	 * @memberOf ICreateOpenIdTenantResponse
	 */
	data: ISysTenant;
}

/**
 * @export
 * @interface IUpdateOpenIdTenantRequest
 */
export interface IUpdateOpenIdTenantRequest {}

/**
 * @export
 * @interface IUpdateOpenIdTenant
 */
export interface IUpdateOpenIdTenant {}

/**
 * @export
 * @interface IUpdateOpenIdTenantResponse
 */
export interface IUpdateOpenIdTenantResponse {
	/**
	 * @type IUpdateOpenIdTenant
	 * @memberOf IUpdateOpenIdTenantResponse
	 */
	data: IUpdateOpenIdTenant;
}

/**
 * @export
 * @interface IDeleteOpenIdTenantRequest
 */
export interface IDeleteOpenIdTenantRequest {}

/**
 * @export
 * @interface IDeleteOpenIdTenant
 */
export interface IDeleteOpenIdTenant {}

/**
 * @export
 * @interface IDeleteOpenIdTenantResponse
 */
export interface IDeleteOpenIdTenantResponse {
	/**
	 * @type IDeleteOpenIdTenant
	 * @memberOf IDeleteOpenIdTenantResponse
	 */
	data: IDeleteOpenIdTenant;
}

/**
 * @export
 * @interface IListOpenIdClientRequest
 */
export interface IListOpenIdClientRequest {}

/**
 * @export
 * @interface IListOpenIdClient
 */
export interface IListOpenIdClient {}

/**
 * @export
 * @interface IListOpenIdClientResponse
 */
export interface IListOpenIdClientResponse {
	/**
	 * @type IListOpenIdClient
	 * @memberOf IListOpenIdClientResponse
	 */
	data: IListOpenIdClient;
}

/**
 * @export
 * @interface IGetOpenIdClientRequest
 */
export interface IGetOpenIdClientRequest {}

/**
 * @export
 * @interface IGetOpenIdClient
 */
export interface IGetOpenIdClient {}

/**
 * @export
 * @interface IGetOpenIdClientResponse
 */
export interface IGetOpenIdClientResponse {
	/**
	 * @type IGetOpenIdClient
	 * @memberOf IGetOpenIdClientResponse
	 */
	data: IGetOpenIdClient;
}

/**
 * @export
 * @interface ICreateOpenIdClientRequest
 */
export interface ICreateOpenIdClientRequest {}

/**
 * @export
 * @interface ICreateOpenIdClient
 */
export interface ICreateOpenIdClient {}

/**
 * @export
 * @interface ICreateOpenIdClientResponse
 */
export interface ICreateOpenIdClientResponse {
	/**
	 * @type ICreateOpenIdClient
	 * @memberOf ICreateOpenIdClientResponse
	 */
	data: ICreateOpenIdClient;
}

/**
 * @export
 * @interface IUpdateOpenIdClientRequest
 */
export interface IUpdateOpenIdClientRequest {}

/**
 * @export
 * @interface IUpdateOpenIdClient
 */
export interface IUpdateOpenIdClient {}

/**
 * @export
 * @interface IUpdateOpenIdClientResponse
 */
export interface IUpdateOpenIdClientResponse {
	/**
	 * @type IUpdateOpenIdClient
	 * @memberOf IUpdateOpenIdClientResponse
	 */
	data: IUpdateOpenIdClient;
}

/**
 * @export
 * @interface IDeleteOpenIdClientRequest
 */
export interface IDeleteOpenIdClientRequest {}

/**
 * @export
 * @interface IDeleteOpenIdClient
 */
export interface IDeleteOpenIdClient {}

/**
 * @export
 * @interface IDeleteOpenIdClientResponse
 */
export interface IDeleteOpenIdClientResponse {
	/**
	 * @type IDeleteOpenIdClient
	 * @memberOf IDeleteOpenIdClientResponse
	 */
	data: IDeleteOpenIdClient;
}

/**
 * @export
 * @interface IListOpenIdRoleRequest
 */
export interface IListOpenIdRoleRequest {}

/**
 * @export
 * @interface IListOpenIdRole
 */
export interface IListOpenIdRole {}

/**
 * @export
 * @interface IListOpenIdRoleResponse
 */
export interface IListOpenIdRoleResponse {
	/**
	 * @type IListOpenIdRole
	 * @memberOf IListOpenIdRoleResponse
	 */
	data: IListOpenIdRole;
}

/**
 * @export
 * @interface IGetOpenIdRoleRequest
 */
export interface IGetOpenIdRoleRequest {}

/**
 * @export
 * @interface IGetOpenIdRole
 */
export interface IGetOpenIdRole {}

/**
 * @export
 * @interface IGetOpenIdRoleResponse
 */
export interface IGetOpenIdRoleResponse {
	/**
	 * @type IGetOpenIdRole
	 * @memberOf IGetOpenIdRoleResponse
	 */
	data: IGetOpenIdRole;
}

/**
 * @export
 * @interface ICreateOpenIdRoleRequest
 */
export interface ICreateOpenIdRoleRequest {}

/**
 * @export
 * @interface ICreateOpenIdRole
 */
export interface ICreateOpenIdRole {}

/**
 * @export
 * @interface ICreateOpenIdRoleResponse
 */
export interface ICreateOpenIdRoleResponse {
	/**
	 * @type ICreateOpenIdRole
	 * @memberOf ICreateOpenIdRoleResponse
	 */
	data: ICreateOpenIdRole;
}

/**
 * @export
 * @interface IUpdateOpenIdRoleRequest
 */
export interface IUpdateOpenIdRoleRequest {}

/**
 * @export
 * @interface IUpdateOpenIdRole
 */
export interface IUpdateOpenIdRole {}

/**
 * @export
 * @interface IUpdateOpenIdRoleResponse
 */
export interface IUpdateOpenIdRoleResponse {
	/**
	 * @type IUpdateOpenIdRole
	 * @memberOf IUpdateOpenIdRoleResponse
	 */
	data: IUpdateOpenIdRole;
}

/**
 * @export
 * @interface IDeleteOpenIdRoleRequest
 */
export interface IDeleteOpenIdRoleRequest {}

/**
 * @export
 * @interface IDeleteOpenIdRole
 */
export interface IDeleteOpenIdRole {}

/**
 * @export
 * @interface IDeleteOpenIdRoleResponse
 */
export interface IDeleteOpenIdRoleResponse {
	/**
	 * @type IDeleteOpenIdRole
	 * @memberOf IDeleteOpenIdRoleResponse
	 */
	data: IDeleteOpenIdRole;
}

/**
 * @export
 * @interface IListOpenIdAccountRequest
 */
export interface IListOpenIdAccountRequest {}

/**
 * @export
 * @interface IListOpenIdAccount
 */
export interface IListOpenIdAccount {}

/**
 * @export
 * @interface IListOpenIdAccountResponse
 */
export interface IListOpenIdAccountResponse {
	/**
	 * @type IListOpenIdAccount
	 * @memberOf IListOpenIdAccountResponse
	 */
	data: IListOpenIdAccount;
}

/**
 * @export
 * @interface IGetOpenIdAccountRequest
 */
export interface IGetOpenIdAccountRequest {}

/**
 * @export
 * @interface IGetOpenIdAccount
 */
export interface IGetOpenIdAccount {}

/**
 * @export
 * @interface IGetOpenIdAccountResponse
 */
export interface IGetOpenIdAccountResponse {
	/**
	 * @type IGetOpenIdAccount
	 * @memberOf IGetOpenIdAccountResponse
	 */
	data: IGetOpenIdAccount;
}

/**
 * @export
 * @interface ICreateOpenIdAccountRequest
 */
export interface ICreateOpenIdAccountRequest {}

/**
 * @export
 * @interface ICreateOpenIdAccount
 */
export interface ICreateOpenIdAccount {}

/**
 * @export
 * @interface ICreateOpenIdAccountResponse
 */
export interface ICreateOpenIdAccountResponse {
	/**
	 * @type ICreateOpenIdAccount
	 * @memberOf ICreateOpenIdAccountResponse
	 */
	data: ICreateOpenIdAccount;
}

/**
 * @export
 * @interface IUpdateOpenIdAccountRequest
 */
export interface IUpdateOpenIdAccountRequest {}

/**
 * @export
 * @interface IUpdateOpenIdAccount
 */
export interface IUpdateOpenIdAccount {}

/**
 * @export
 * @interface IUpdateOpenIdAccountResponse
 */
export interface IUpdateOpenIdAccountResponse {
	/**
	 * @type IUpdateOpenIdAccount
	 * @memberOf IUpdateOpenIdAccountResponse
	 */
	data: IUpdateOpenIdAccount;
}

/**
 * @export
 * @interface IDeleteOpenIdAccountRequest
 */
export interface IDeleteOpenIdAccountRequest {}

/**
 * @export
 * @interface IDeleteOpenIdAccount
 */
export interface IDeleteOpenIdAccount {}

/**
 * @export
 * @interface IDeleteOpenIdAccountResponse
 */
export interface IDeleteOpenIdAccountResponse {
	/**
	 * @type IDeleteOpenIdAccount
	 * @memberOf IDeleteOpenIdAccountResponse
	 */
	data: IDeleteOpenIdAccount;
}

/**
 * @export
 * @interface IChangeAccountPasswordRequest
 */
export interface IChangeAccountPasswordRequest {
	/**
	 * @type string
	 * @memberOf IChangeAccountPasswordRequest
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf IChangeAccountPasswordRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf IChangeAccountPasswordRequest
	 */
	password: string;
}

/**
 * @export
 * @interface IChangeAccountPasswordResponse
 */
export interface IChangeAccountPasswordResponse {
	/**
	 * @type IOpsResponse
	 * @memberOf IChangeAccountPasswordResponse
	 */
	data: IOpsResponse;
}

/**
 * @export
 * @interface IListOpenIdPermissionRequest
 */
export interface IListOpenIdPermissionRequest {}

/**
 * @export
 * @interface IListOpenIdPermission
 */
export interface IListOpenIdPermission {}

/**
 * @export
 * @interface IListOpenIdPermissionResponse
 */
export interface IListOpenIdPermissionResponse {
	/**
	 * @type IListOpenIdPermission
	 * @memberOf IListOpenIdPermissionResponse
	 */
	data: IListOpenIdPermission;
}

/**
 * @export
 * @interface IGetOpenIdPermissionRequest
 */
export interface IGetOpenIdPermissionRequest {}

/**
 * @export
 * @interface IGetOpenIdPermission
 */
export interface IGetOpenIdPermission {}

/**
 * @export
 * @interface IGetOpenIdPermissionResponse
 */
export interface IGetOpenIdPermissionResponse {
	/**
	 * @type IGetOpenIdPermission
	 * @memberOf IGetOpenIdPermissionResponse
	 */
	data: IGetOpenIdPermission;
}

/**
 * @export
 * @interface ICreateOpenIdPermissionRequest
 */
export interface ICreateOpenIdPermissionRequest {}

/**
 * @export
 * @interface ICreateOpenIdPermission
 */
export interface ICreateOpenIdPermission {}

/**
 * @export
 * @interface ICreateOpenIdPermissionResponse
 */
export interface ICreateOpenIdPermissionResponse {
	/**
	 * @type ICreateOpenIdPermission
	 * @memberOf ICreateOpenIdPermissionResponse
	 */
	data: ICreateOpenIdPermission;
}

/**
 * @export
 * @interface IUpdateOpenIdPermissionRequest
 */
export interface IUpdateOpenIdPermissionRequest {}

/**
 * @export
 * @interface IUpdateOpenIdPermission
 */
export interface IUpdateOpenIdPermission {}

/**
 * @export
 * @interface IUpdateOpenIdPermissionResponse
 */
export interface IUpdateOpenIdPermissionResponse {
	/**
	 * @type IUpdateOpenIdPermission
	 * @memberOf IUpdateOpenIdPermissionResponse
	 */
	data: IUpdateOpenIdPermission;
}

/**
 * @export
 * @interface IDeleteOpenIdPermissionRequest
 */
export interface IDeleteOpenIdPermissionRequest {}

/**
 * @export
 * @interface IDeleteOpenIdPermission
 */
export interface IDeleteOpenIdPermission {}

/**
 * @export
 * @interface IDeleteOpenIdPermissionResponse
 */
export interface IDeleteOpenIdPermissionResponse {
	/**
	 * @type IDeleteOpenIdPermission
	 * @memberOf IDeleteOpenIdPermissionResponse
	 */
	data: IDeleteOpenIdPermission;
}
