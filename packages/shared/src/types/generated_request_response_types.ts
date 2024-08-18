/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IErrorData, IPortaAccount, IOpsResponse } from "./generated_types";

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
	 * @type string
	 * @memberOf IGetTranslationsRequest
	 */
	options?: string;
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
 * @interface IGetReferenceData
 */
export interface IGetReferenceData {}

/**
 * @export
 * @interface IGetReferenceDataRequest
 */
export interface IGetReferenceDataRequest {
	/**
	 * @type string
	 * @memberOf IGetReferenceDataRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IGetReferenceDataResponse
 */
export interface IGetReferenceDataResponse {
	/**
	 * @type IGetReferenceData
	 * @memberOf IGetReferenceDataResponse
	 */
	data: IGetReferenceData;
}

/**
 * @export
 * @interface IGetUserProfileRequest
 */
export interface IGetUserProfileRequest {}

/**
 * @export
 * @interface IGetUserProfileResponse
 */
export interface IGetUserProfileResponse {
	/**
	 * @type IPortaAccount
	 * @memberOf IGetUserProfileResponse
	 */
	data: IPortaAccount;
}

/**
 * @export
 * @interface IGetUserStateRequest
 */
export interface IGetUserStateRequest {
	/**
	 * @type string
	 * @memberOf IGetUserStateRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IGetUserState
 */
export interface IGetUserState {
	/**
	 * @type string
	 * @memberOf IGetUserState
	 */
	user_state: string;
}

/**
 * @export
 * @interface IGetUserStateResponse
 */
export interface IGetUserStateResponse {
	/**
	 * @type IGetUserState
	 * @memberOf IGetUserStateResponse
	 */
	data: IGetUserState;
}

/**
 * @export
 * @interface ISaveUserStateRequest
 */
export interface ISaveUserStateRequest {
	/**
	 * @type string
	 * @memberOf ISaveUserStateRequest
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf ISaveUserStateRequest
	 */
	user_state: string;
}

/**
 * @export
 * @interface ISaveUserStateResponse
 */
export interface ISaveUserStateResponse {
	/**
	 * @type IOpsResponse
	 * @memberOf ISaveUserStateResponse
	 */
	data: IOpsResponse;
}

/**
 * @export
 * @interface ILogoutFlowInfoRequest
 */
export interface ILogoutFlowInfoRequest {}

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
	 * @type number
	 * @memberOf ILogoutFlowInfo
	 */
	expires_in: number;
	/**
	 * @type string
	 * @memberOf ILogoutFlowInfo
	 */
	error?: string;
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
	id_token?: string;
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
 * @interface IFinalizeRequest
 */
export interface IFinalizeRequest {}

/**
 * @export
 * @interface IFinalize
 */
export interface IFinalize {}

/**
 * @export
 * @interface IFinalizeResponse
 */
export interface IFinalizeResponse {
	/**
	 * @type IFinalize
	 * @memberOf IFinalizeResponse
	 */
	data: IFinalize;
}

/**
 * @export
 * @interface ICheckSetFlowRequest
 */
export interface ICheckSetFlowRequest {
	/**
	 * @type string
	 * @memberOf ICheckSetFlowRequest
	 */
	update?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlowRequest
	 */
	username?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlowRequest
	 */
	password?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlowRequest
	 */
	new_password?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlowRequest
	 */
	confirm_new_password?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlowRequest
	 */
	mfa_result?: string;
	/**
	 * @type boolean
	 * @memberOf ICheckSetFlowRequest
	 */
	consent?: boolean;
	/**
	 * @type boolean
	 * @memberOf ICheckSetFlowRequest
	 */
	ow_consent?: boolean;
}

/**
 * @export
 * @interface ICheckSetFlow
 */
export interface ICheckSetFlow {
	/**
	 * @type boolean
	 * @memberOf ICheckSetFlow
	 */
	error?: boolean;
	/**
	 * @type string
	 * @memberOf ICheckSetFlow
	 */
	logo?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlow
	 */
	tenant_name?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlow
	 */
	application_name?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlow
	 */
	consent_display_name?: string;
	/**
	 * @type string
	 * @memberOf ICheckSetFlow
	 */
	mfa_type?: string;
	/**
	 * @type string[]
	 * @memberOf ICheckSetFlow
	 */
	consent_claims?: string[];
	/**
	 * @type boolean
	 * @memberOf ICheckSetFlow
	 */
	ow_consent?: boolean;
	/**
	 * @type boolean
	 * @memberOf ICheckSetFlow
	 */
	allow_reset_password?: boolean;
	/**
	 * @type number
	 * @memberOf ICheckSetFlow
	 */
	expires_in: number;
	/**
	 * @type string
	 * @memberOf ICheckSetFlow
	 */
	resp: string;
}

/**
 * @export
 * @interface ICheckSetFlowResponse
 */
export interface ICheckSetFlowResponse {
	/**
	 * @type ICheckSetFlow
	 * @memberOf ICheckSetFlowResponse
	 */
	data: ICheckSetFlow;
}

/**
 * @export
 * @interface IDiscoveryKeysRequest
 */
export interface IDiscoveryKeysRequest {
	/**
	 * @type string
	 * @memberOf IDiscoveryKeysRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IDiscoveryKeys
 */
export interface IDiscoveryKeys {}

/**
 * @export
 * @interface IDiscoveryKeysResponse
 */
export interface IDiscoveryKeysResponse {}

/**
 * @export
 * @interface IDiscoveryRequest
 */
export interface IDiscoveryRequest {
	/**
	 * @type string
	 * @memberOf IDiscoveryRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IDiscovery
 */
export interface IDiscovery {}

/**
 * @export
 * @interface IDiscoveryResponse
 */
export interface IDiscoveryResponse {}

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
	id_token_hint?: string;
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
