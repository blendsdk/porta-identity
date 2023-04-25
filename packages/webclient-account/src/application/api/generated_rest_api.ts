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
	IAuthorizeRequest,
	IAuthorizeResponse,
	ITokenRequest,
	ITokenResponse,
	ISigninRequest,
	ISigninResponse,
	IRedirectRequest,
	IRedirectResponse,
	IFlowInfoRequest,
	IFlowInfoResponse,
	ICheckFlowRequest,
	ICheckFlowResponse,
	IOidcDiscoveryRequest,
	IOidcDiscoveryResponse,
	IOidcDiscoveryKeysRequest,
	IOidcDiscoveryKeysResponse,
	IUserInfoGetRequest,
	IUserInfoGetResponse,
	IUserInfoPostRequest,
	IUserInfoPostResponse,
	ISessionLogoutGetRequest,
	ISessionLogoutGetResponse,
	ISessionLogoutPostRequest,
	ISessionLogoutPostResponse,
	ILogoutFlowInfoRequest,
	ILogoutFlowInfoResponse,
	IAuthenticationKeepAliveRequest,
	IAuthenticationKeepAliveResponse,
	IAuthenticationLogoutRequest,
	IAuthenticationLogoutResponse,
	IAuthenticationLoginRequest,
	IAuthenticationLoginResponse
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
		authorize: THttpRequest<IAuthorizeRequest, IAuthorizeResponse>;
		token: THttpRequest<ITokenRequest, ITokenResponse>;
		signin: THttpRequest<ISigninRequest, ISigninResponse>;
		redirect: THttpRequest<IRedirectRequest, IRedirectResponse>;
		flowInfo: THttpRequest<IFlowInfoRequest, IFlowInfoResponse>;
		checkFlow: THttpRequest<ICheckFlowRequest, ICheckFlowResponse>;
		oidcDiscovery: THttpRequest<IOidcDiscoveryRequest, IOidcDiscoveryResponse>;
		oidcDiscoveryKeys: THttpRequest<IOidcDiscoveryKeysRequest, IOidcDiscoveryKeysResponse>;
		userInfoGet: THttpRequest<IUserInfoGetRequest, IUserInfoGetResponse>;
		userInfoPost: THttpRequest<IUserInfoPostRequest, IUserInfoPostResponse>;
		sessionLogoutGet: THttpRequest<ISessionLogoutGetRequest, ISessionLogoutGetResponse>;
		sessionLogoutPost: THttpRequest<ISessionLogoutPostRequest, ISessionLogoutPostResponse>;
		logoutFlowInfo: THttpRequest<ILogoutFlowInfoRequest, ILogoutFlowInfoResponse>;
	};
	authentication: {
		authenticationKeepAlive: THttpRequest<IAuthenticationKeepAliveRequest | void, IAuthenticationKeepAliveResponse>;
		authenticationLogout: THttpRequest<IAuthenticationLogoutRequest | void, IAuthenticationLogoutResponse>;
		authenticationLogin: THttpRequest<IAuthenticationLoginRequest, IAuthenticationLoginResponse>;
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
		authorization: {
			authorize: defineEndpoint({ method: "get", url: "/:tenant/oauth2/authorize" }),
			token: defineEndpoint({ method: "post", url: "/:tenant/oauth2/token" }),
			signin: defineEndpoint({ method: "get", url: "/af/signin" }),
			redirect: defineEndpoint({ method: "get", url: "/af/redirect" }),
			flowInfo: defineEndpoint({ method: "post", url: "/af/flow_info" }),
			checkFlow: defineEndpoint({ method: "post", url: "/af/check_flow" }),
			oidcDiscovery: defineEndpoint({ method: "get", url: "/:tenant/oauth2/.well-known/openid-configuration" }),
			oidcDiscoveryKeys: defineEndpoint({ method: "get", url: "/:tenant/oauth2/discovery/keys" }),
			userInfoGet: defineEndpoint({ method: "get", url: "/:tenant/oauth2/me" }),
			userInfoPost: defineEndpoint({ method: "post", url: "/:tenant/oauth2/me" }),
			sessionLogoutGet: defineEndpoint({ method: "get", url: "/:tenant/oauth2/logout" }),
			sessionLogoutPost: defineEndpoint({ method: "post", url: "/:tenant/oauth2/logout" }),
			logoutFlowInfo: defineEndpoint({ method: "get", url: "/lf/flow_info" })
		},
		authentication: {
			authenticationKeepAlive: defineEndpoint({ method: "post", url: "/api/authentication/keep-alive" }),
			authenticationLogout: defineEndpoint({ method: "post", url: "/api/authentication/logout" }),
			authenticationLogin: defineEndpoint({ method: "post", url: "/api/authentication/login" })
		}
	}
});
