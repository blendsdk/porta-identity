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
	IDiscoveryKeysRequest,
	IDiscoveryKeysResponse,
	IDiscoveryRequest,
	IDiscoveryResponse,
	IAuthorizeRequest,
	IAuthorizeResponse,
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
	authorization: {
		discoveryKeys: THttpRequest<IDiscoveryKeysRequest, IDiscoveryKeysResponse>;
		discovery: THttpRequest<IDiscoveryRequest, IDiscoveryResponse>;
		authorize: THttpRequest<IAuthorizeRequest, IAuthorizeResponse>;
	};
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
			discoveryKeys: defineEndpoint({ method: "get", url: "/:tenant/oauth2/discovery/keys" }),
			discovery: defineEndpoint({ method: "get", url: "/:tenant/oauth2/.well-known/openid-configuration" }),
			authorize: defineEndpoint({ method: "get", url: "/:tenant/oauth2/authorize" })
		},
		initialize: { initialize: defineEndpoint({ method: "post", url: "/api/initialize" }) }
	}
});
