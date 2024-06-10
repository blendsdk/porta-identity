/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { THttpRequest, createHttpApi, defineEndpoint, eParameterLocation } from "@blendsdk/clientkit";
import {
	IGetTranslationsRequest,
	IGetTranslationsResponse,
	IGetAppVersionRequest,
	IGetAppVersionResponse,
	IListExtensionRequest,
	IListExtensionResponse,
	IInitializeRequest,
	IInitializeResponse,
	IGetReferenceDataRequest,
	IGetReferenceDataResponse,
	IGetUserProfileRequest,
	IGetUserProfileResponse,
	IGetUserStateRequest,
	IGetUserStateResponse,
	ISaveUserStateRequest,
	ISaveUserStateResponse,
	IDiscoveryKeysRequest,
	IDiscoveryKeysResponse,
	IDiscoveryRequest,
	IDiscoveryResponse,
	IAuthorizeRequest,
	IAuthorizeResponse
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
	extension: { listExtension: THttpRequest<IListExtensionRequest, IListExtensionResponse> };
	initialize: { initialize: THttpRequest<IInitializeRequest, IInitializeResponse> };
	referenceData: { getReferenceData: THttpRequest<IGetReferenceDataRequest, IGetReferenceDataResponse> };
	profile: {
		getUserProfile: THttpRequest<IGetUserProfileRequest | void, IGetUserProfileResponse>;
		getUserState: THttpRequest<IGetUserStateRequest, IGetUserStateResponse>;
		saveUserState: THttpRequest<ISaveUserStateRequest, ISaveUserStateResponse>;
	};
	authorization: {
		discoveryKeys: THttpRequest<IDiscoveryKeysRequest, IDiscoveryKeysResponse>;
		discovery: THttpRequest<IDiscoveryRequest, IDiscoveryResponse>;
		authorize: THttpRequest<IAuthorizeRequest, IAuthorizeResponse>;
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
		},
		extension: { listExtension: defineEndpoint({ method: "get", url: "/api/:tenant/extensions/list" }) },
		initialize: { initialize: defineEndpoint({ method: "post", url: "/api/initialize" }) },
		referenceData: {
			getReferenceData: defineEndpoint({
				method: "post",
				url: "/api/:tenant/reference_data",
				parameters: { tenant: eParameterLocation.params }
			})
		},
		profile: {
			getUserProfile: defineEndpoint({ method: "post", url: "/api/profile" }),
			getUserState: defineEndpoint({ method: "get", url: "/api/:tenant/user_state" }),
			saveUserState: defineEndpoint({
				method: "post",
				url: "/api/:tenant/user_state",
				parameters: { tenant: eParameterLocation.params }
			})
		},
		authorization: {
			discoveryKeys: defineEndpoint({ method: "get", url: "/:tenant/oauth2/discovery/keys" }),
			discovery: defineEndpoint({ method: "get", url: "/:tenant/oauth2/.well-known/openid-configuration" }),
			authorize: defineEndpoint({ method: "get", url: "/:tenant/oauth2/authorize" })
		}
	}
});
