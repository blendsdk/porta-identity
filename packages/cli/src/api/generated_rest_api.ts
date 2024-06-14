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
	ICheckSetFlowRequest,
	ICheckSetFlowResponse
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
	initialize: { initialize: THttpRequest<IInitializeRequest, IInitializeResponse> };
	referenceData: { getReferenceData: THttpRequest<IGetReferenceDataRequest, IGetReferenceDataResponse> };
	profile: {
		getUserProfile: THttpRequest<IGetUserProfileRequest | void, IGetUserProfileResponse>;
		getUserState: THttpRequest<IGetUserStateRequest, IGetUserStateResponse>;
		saveUserState: THttpRequest<ISaveUserStateRequest, ISaveUserStateResponse>;
	};
	authorization: { checkSetFlow: THttpRequest<ICheckSetFlowRequest, ICheckSetFlowResponse> };
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
		authorization: { checkSetFlow: defineEndpoint({ method: "post", url: "/af/flow" }) }
	}
});
