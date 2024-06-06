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
