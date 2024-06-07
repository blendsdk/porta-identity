/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IErrorData } from "./generated_types";

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
