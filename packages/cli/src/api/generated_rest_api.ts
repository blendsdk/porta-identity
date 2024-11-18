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
	IDeleteTenantRequest,
	IDeleteTenantResponse,
	ICreateTenantRequest,
	ICreateTenantResponse,
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
	IResetAuthRequest,
	IResetAuthResponse,
	IResetPasswordFlowInfoRequest,
	IResetPasswordFlowInfoResponse,
	ILogoutFlowInfoRequest,
	ILogoutFlowInfoResponse,
	ISessionLogoutGetRequest,
	ISessionLogoutGetResponse,
	ISessionLogoutPostRequest,
	ISessionLogoutPostResponse,
	ITokenInfoRequest,
	ITokenInfoResponse,
	IUserInfoPostRequest,
	IUserInfoPostResponse,
	IUserInfoGetRequest,
	IUserInfoGetResponse,
	ICheckSetFlowRequest,
	ICheckSetFlowResponse,
	ICreateApplicationRequest,
	ICreateApplicationResponse
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
	initialize: {
		deleteTenant: THttpRequest<IDeleteTenantRequest, IDeleteTenantResponse>;
		createTenant: THttpRequest<ICreateTenantRequest, ICreateTenantResponse>;
		initialize: THttpRequest<IInitializeRequest, IInitializeResponse>;
	};
	referenceData: { getReferenceData: THttpRequest<IGetReferenceDataRequest, IGetReferenceDataResponse> };
	profile: {
		getUserProfile: THttpRequest<IGetUserProfileRequest | void, IGetUserProfileResponse>;
		getUserState: THttpRequest<IGetUserStateRequest, IGetUserStateResponse>;
		saveUserState: THttpRequest<ISaveUserStateRequest, ISaveUserStateResponse>;
	};
	authorization: {
		resetAuth: THttpRequest<IResetAuthRequest, IResetAuthResponse>;
		resetPasswordFlowInfo: THttpRequest<IResetPasswordFlowInfoRequest | void, IResetPasswordFlowInfoResponse>;
		logoutFlowInfo: THttpRequest<ILogoutFlowInfoRequest | void, ILogoutFlowInfoResponse>;
		sessionLogoutGet: THttpRequest<ISessionLogoutGetRequest, ISessionLogoutGetResponse>;
		sessionLogoutPost: THttpRequest<ISessionLogoutPostRequest, ISessionLogoutPostResponse>;
		tokenInfo: THttpRequest<ITokenInfoRequest, ITokenInfoResponse>;
		userInfoPost: THttpRequest<IUserInfoPostRequest, IUserInfoPostResponse>;
		userInfoGet: THttpRequest<IUserInfoGetRequest, IUserInfoGetResponse>;
		checkSetFlow: THttpRequest<ICheckSetFlowRequest, ICheckSetFlowResponse>;
	};
	admin: { createApplication: THttpRequest<ICreateApplicationRequest, ICreateApplicationResponse> };
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
		initialize: {
			deleteTenant: defineEndpoint({ method: "post", url: "/api/initialize/tenant/delete" }),
			createTenant: defineEndpoint({ method: "post", url: "/api/initialize/tenant/create" }),
			initialize: defineEndpoint({ method: "post", url: "/api/initialize" })
		},
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
			resetAuth: defineEndpoint({ method: "post", url: "/rp/reset_auth" }),
			resetPasswordFlowInfo: defineEndpoint({ method: "post", url: "/rp/flow_info" }),
			logoutFlowInfo: defineEndpoint({ method: "post", url: "/lf/flow_info" }),
			sessionLogoutGet: defineEndpoint({ method: "get", url: "/:tenant/oauth2/logout" }),
			sessionLogoutPost: defineEndpoint({
				method: "post",
				url: "/:tenant/oauth2/logout",
				parameters: {
					tenant: eParameterLocation.params,
					id_token_hint: eParameterLocation.body,
					logout_hint: eParameterLocation.body,
					client_id: eParameterLocation.body,
					post_logout_redirect_uri: eParameterLocation.body,
					state: eParameterLocation.body,
					ui_locales: eParameterLocation.body,
					lf: eParameterLocation.body
				}
			}),
			tokenInfo: defineEndpoint({
				method: "post",
				url: "/:tenant/oauth2/token_info",
				parameters: {
					tenant: eParameterLocation.params,
					token: eParameterLocation.body,
					client_id: eParameterLocation.body,
					client_secret: eParameterLocation.body
				}
			}),
			userInfoPost: defineEndpoint({
				method: "post",
				url: "/:tenant/oauth2/me",
				parameters: { access_token: eParameterLocation.body, tenant: eParameterLocation.params }
			}),
			userInfoGet: defineEndpoint({ method: "get", url: "/:tenant/oauth2/me" }),
			checkSetFlow: defineEndpoint({ method: "post", url: "/af/flow" })
		},
		admin: {
			createApplication: defineEndpoint({
				method: "post",
				url: "/api/admin/:tenant/application/create",
				parameters: { tenant: eParameterLocation.params }
			})
		}
	}
});
