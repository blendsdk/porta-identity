/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { THttpRequest, createHttpApi, defineEndpoint } from "@blendsdk/clientkit";
import {
	IGetTranslationsRequest,
	IGetTranslationsResponse,
	IGetAppVersionRequest,
	IGetAppVersionResponse,
	IDiscoveryRequest,
	IDiscoveryResponse,
	IInitializeRequest,
	IInitializeResponse
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
	authorization: { discovery: THttpRequest<IDiscoveryRequest, IDiscoveryResponse> };
	initialize: { initialize: THttpRequest<IInitializeRequest, IInitializeResponse> };
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
		},
		authorization: {
			discovery: defineEndpoint({ method: "get", url: "/:tenant/oauth2/.well-known/openid-configuration" })
		},
		initialize: { initialize: defineEndpoint({ method: "post", url: "/api/initialize" }) }
	}
});
