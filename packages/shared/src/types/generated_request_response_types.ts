/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IErrorData } from "./generated_types";

import { IAuthenticationFlowState } from "./generated_types";

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
