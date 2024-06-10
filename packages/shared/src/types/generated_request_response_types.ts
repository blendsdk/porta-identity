/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IErrorData, IPortaAccount, IOpsResponse } from "./generated_types";
import { ISysExtension, ISysAuthorizationView } from "./generated_database_types";

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
 * @interface IListExtensionRequest
 */
export interface IListExtensionRequest {
	/**
	 * @type string
	 * @memberOf IListExtensionRequest
	 */
	tenant: string;
}

/**
 * @export
 * @interface IListExtensionResponse
 */
export interface IListExtensionResponse {
	/**
	 * @type ISysExtension[]
	 * @memberOf IListExtensionResponse
	 */
	data: ISysExtension[];
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
 * @interface IGetFlowRequest
 */
export interface IGetFlowRequest {
	/**
	 * @type string
	 * @memberOf IGetFlowRequest
	 */
	flow_id: string;
}

/**
 * @export
 * @interface IGetFlowResponse
 */
export interface IGetFlowResponse {
	/**
	 * @type ISysAuthorizationView
	 * @memberOf IGetFlowResponse
	 */
	data: ISysAuthorizationView;
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
