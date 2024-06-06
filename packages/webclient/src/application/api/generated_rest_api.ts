/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { THttpRequest, createHttpApi, defineEndpoint } from "@blendsdk/clientkit";
import {
	IGetTranslationsRequest,
	IGetTranslationsResponse,
	IGetAppVersionRequest,
	IGetAppVersionResponse
} from "@porta/shared";
/**
 * Interface describing the Backend REST API client
 * @export
 * @interface {PortaApi}
 */
export interface IPortaApi {
	blend: {
		getTranslations: THttpRequest<IGetTranslationsRequest, IGetTranslationsResponse>;
		getAppVersion: THttpRequest<IGetAppVersionRequest | void, IGetAppVersionResponse>;
	};
}
/**
 * Backend REST API client
 * @export
 */
export const PortaApi = createHttpApi<IPortaApi>({
	definitions: {
		blend: {
			getTranslations: defineEndpoint({ method: "get", url: "/api/i18n/:locale?" }),
			getAppVersion: defineEndpoint({ method: "get", url: "/api/version" })
		}
	}
});
