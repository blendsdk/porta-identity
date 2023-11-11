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
	ITokenInfoRequest,
	ITokenInfoResponse,
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
	IForgotPasswordFlowInfoRequest,
	IForgotPasswordFlowInfoResponse,
	IForgotPasswordRequestAccountRequest,
	IForgotPasswordRequestAccountResponse,
	ICheckPasswordResetRequestRequest,
	ICheckPasswordResetRequestResponse,
	IRequestPasswordResetRequest,
	IRequestPasswordResetResponse,
	IAuthenticationKeepAliveRequest,
	IAuthenticationKeepAliveResponse,
	IAuthenticationLogoutRequest,
	IAuthenticationLogoutResponse,
	IAuthenticationLoginRequest,
	IAuthenticationLoginResponse,
	IInitializeRequest,
	IInitializeResponse,
	IGetUserProfileRequest,
	IGetUserProfileResponse,
	IListOpenIdTenantRequest,
	IListOpenIdTenantResponse,
	IGetOpenIdTenantRequest,
	IGetOpenIdTenantResponse,
	ICreateOpenIdTenantRequest,
	ICreateOpenIdTenantResponse,
	IUpdateOpenIdTenantRequest,
	IUpdateOpenIdTenantResponse,
	IDeleteOpenIdTenantRequest,
	IDeleteOpenIdTenantResponse,
	IListOpenIdClientRequest,
	IListOpenIdClientResponse,
	IGetOpenIdClientRequest,
	IGetOpenIdClientResponse,
	ICreateOpenIdClientRequest,
	ICreateOpenIdClientResponse,
	IUpdateOpenIdClientRequest,
	IUpdateOpenIdClientResponse,
	IDeleteOpenIdClientRequest,
	IDeleteOpenIdClientResponse,
	IListOpenIdRoleRequest,
	IListOpenIdRoleResponse,
	IGetOpenIdRoleRequest,
	IGetOpenIdRoleResponse,
	ICreateOpenIdRoleRequest,
	ICreateOpenIdRoleResponse,
	IUpdateOpenIdRoleRequest,
	IUpdateOpenIdRoleResponse,
	IDeleteOpenIdRoleRequest,
	IDeleteOpenIdRoleResponse,
	IListOpenIdAccountRequest,
	IListOpenIdAccountResponse,
	IGetOpenIdAccountRequest,
	IGetOpenIdAccountResponse,
	ICreateOpenIdAccountRequest,
	ICreateOpenIdAccountResponse,
	IUpdateOpenIdAccountRequest,
	IUpdateOpenIdAccountResponse,
	IDeleteOpenIdAccountRequest,
	IDeleteOpenIdAccountResponse,
	IChangeAccountPasswordRequest,
	IChangeAccountPasswordResponse,
	IListOpenIdPermissionRequest,
	IListOpenIdPermissionResponse,
	IGetOpenIdPermissionRequest,
	IGetOpenIdPermissionResponse,
	ICreateOpenIdPermissionRequest,
	ICreateOpenIdPermissionResponse,
	IUpdateOpenIdPermissionRequest,
	IUpdateOpenIdPermissionResponse,
	IDeleteOpenIdPermissionRequest,
	IDeleteOpenIdPermissionResponse
} from "@porta/shared";
import { onInterceptRequestParameters } from "../../lib";
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
		tokenInfo: THttpRequest<ITokenInfoRequest, ITokenInfoResponse>;
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
		forgotPasswordFlowInfo: THttpRequest<IForgotPasswordFlowInfoRequest | void, IForgotPasswordFlowInfoResponse>;
		forgotPasswordRequestAccount: THttpRequest<
			IForgotPasswordRequestAccountRequest,
			IForgotPasswordRequestAccountResponse
		>;
		checkPasswordResetRequest: THttpRequest<ICheckPasswordResetRequestRequest, ICheckPasswordResetRequestResponse>;
		requestPasswordReset: THttpRequest<IRequestPasswordResetRequest, IRequestPasswordResetResponse>;
	};
	authentication: {
		authenticationKeepAlive: THttpRequest<IAuthenticationKeepAliveRequest | void, IAuthenticationKeepAliveResponse>;
		authenticationLogout: THttpRequest<IAuthenticationLogoutRequest | void, IAuthenticationLogoutResponse>;
		authenticationLogin: THttpRequest<IAuthenticationLoginRequest, IAuthenticationLoginResponse>;
	};
	application: {
		initialize: THttpRequest<IInitializeRequest, IInitializeResponse>;
		getUserProfile: THttpRequest<IGetUserProfileRequest, IGetUserProfileResponse>;
	};
	openIdTenant: {
		listOpenIdTenant: THttpRequest<IListOpenIdTenantRequest, IListOpenIdTenantResponse>;
		getOpenIdTenant: THttpRequest<IGetOpenIdTenantRequest, IGetOpenIdTenantResponse>;
		createOpenIdTenant: THttpRequest<ICreateOpenIdTenantRequest, ICreateOpenIdTenantResponse>;
		updateOpenIdTenant: THttpRequest<IUpdateOpenIdTenantRequest | void, IUpdateOpenIdTenantResponse>;
		deleteOpenIdTenant: THttpRequest<IDeleteOpenIdTenantRequest | void, IDeleteOpenIdTenantResponse>;
	};
	openIdClient: {
		listOpenIdClient: THttpRequest<IListOpenIdClientRequest | void, IListOpenIdClientResponse>;
		getOpenIdClient: THttpRequest<IGetOpenIdClientRequest | void, IGetOpenIdClientResponse>;
		createOpenIdClient: THttpRequest<ICreateOpenIdClientRequest | void, ICreateOpenIdClientResponse>;
		updateOpenIdClient: THttpRequest<IUpdateOpenIdClientRequest | void, IUpdateOpenIdClientResponse>;
		deleteOpenIdClient: THttpRequest<IDeleteOpenIdClientRequest | void, IDeleteOpenIdClientResponse>;
	};
	openIdRole: {
		listOpenIdRole: THttpRequest<IListOpenIdRoleRequest | void, IListOpenIdRoleResponse>;
		getOpenIdRole: THttpRequest<IGetOpenIdRoleRequest | void, IGetOpenIdRoleResponse>;
		createOpenIdRole: THttpRequest<ICreateOpenIdRoleRequest | void, ICreateOpenIdRoleResponse>;
		updateOpenIdRole: THttpRequest<IUpdateOpenIdRoleRequest | void, IUpdateOpenIdRoleResponse>;
		deleteOpenIdRole: THttpRequest<IDeleteOpenIdRoleRequest | void, IDeleteOpenIdRoleResponse>;
	};
	openIdAccount: {
		listOpenIdAccount: THttpRequest<IListOpenIdAccountRequest | void, IListOpenIdAccountResponse>;
		getOpenIdAccount: THttpRequest<IGetOpenIdAccountRequest | void, IGetOpenIdAccountResponse>;
		createOpenIdAccount: THttpRequest<ICreateOpenIdAccountRequest | void, ICreateOpenIdAccountResponse>;
		updateOpenIdAccount: THttpRequest<IUpdateOpenIdAccountRequest | void, IUpdateOpenIdAccountResponse>;
		deleteOpenIdAccount: THttpRequest<IDeleteOpenIdAccountRequest | void, IDeleteOpenIdAccountResponse>;
		changeAccountPassword: THttpRequest<IChangeAccountPasswordRequest, IChangeAccountPasswordResponse>;
	};
	openIdPermission: {
		listOpenIdPermission: THttpRequest<IListOpenIdPermissionRequest | void, IListOpenIdPermissionResponse>;
		getOpenIdPermission: THttpRequest<IGetOpenIdPermissionRequest | void, IGetOpenIdPermissionResponse>;
		createOpenIdPermission: THttpRequest<ICreateOpenIdPermissionRequest | void, ICreateOpenIdPermissionResponse>;
		updateOpenIdPermission: THttpRequest<IUpdateOpenIdPermissionRequest | void, IUpdateOpenIdPermissionResponse>;
		deleteOpenIdPermission: THttpRequest<IDeleteOpenIdPermissionRequest | void, IDeleteOpenIdPermissionResponse>;
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
			authorize: defineEndpoint({ method: "get", url: "/:tenant/oauth2/authorize" }),
			token: defineEndpoint({
				method: "post",
				url: "/:tenant/oauth2/token",
				parameters: {
					tenant: eParameterLocation.params,
					client_id: eParameterLocation.body,
					redirect_uri: eParameterLocation.body,
					grant_type: eParameterLocation.body,
					code: eParameterLocation.body,
					code_verifier: eParameterLocation.body,
					client_secret: eParameterLocation.body,
					state: eParameterLocation.body,
					nonce: eParameterLocation.body,
					scope: eParameterLocation.query,
					claims: eParameterLocation.query,
					refresh_token: eParameterLocation.body,
					resource: eParameterLocation.query
				}
			}),
			signin: defineEndpoint({ method: "get", url: "/af/signin" }),
			redirect: defineEndpoint({ method: "get", url: "/af/redirect" }),
			flowInfo: defineEndpoint({ method: "post", url: "/af/flow_info" }),
			checkFlow: defineEndpoint({ method: "post", url: "/af/check_flow" }),
			oidcDiscovery: defineEndpoint({ method: "get", url: "/:tenant/oauth2/.well-known/openid-configuration" }),
			oidcDiscoveryKeys: defineEndpoint({ method: "get", url: "/:tenant/oauth2/discovery/keys" }),
			userInfoGet: defineEndpoint({ method: "get", url: "/:tenant/oauth2/me" }),
			userInfoPost: defineEndpoint({
				method: "post",
				url: "/:tenant/oauth2/me",
				parameters: { access_token: eParameterLocation.body, tenant: eParameterLocation.params }
			}),
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
			logoutFlowInfo: defineEndpoint({ method: "get", url: "/lf/flow_info" }),
			forgotPasswordFlowInfo: defineEndpoint({ method: "post", url: "/fp/flow_info" }),
			forgotPasswordRequestAccount: defineEndpoint({ method: "post", url: "/fp/forgot_request_account" }),
			checkPasswordResetRequest: defineEndpoint({ method: "post", url: "/fp/check_password_reset_request" }),
			requestPasswordReset: defineEndpoint({ method: "post", url: "/fp/request_password_reset" })
		},
		authentication: {
			authenticationKeepAlive: defineEndpoint({ method: "post", url: "/api/authentication/keep-alive" }),
			authenticationLogout: defineEndpoint({ method: "post", url: "/api/authentication/logout" }),
			authenticationLogin: defineEndpoint({ method: "post", url: "/api/authentication/login" })
		},
		application: {
			initialize: defineEndpoint({ method: "post", url: "/api/initialize" }),
			getUserProfile: defineEndpoint({ method: "get", url: "/:tenant/user_profile" })
		},
		openIdTenant: {
			listOpenIdTenant: defineEndpoint({ method: "get", url: "/api/:tenant/tenant/list/list" }),
			getOpenIdTenant: defineEndpoint({ method: "get", url: "/api/:tenant/tenant/get/:id" }),
			createOpenIdTenant: defineEndpoint({
				method: "post",
				url: "/api/:tenant/tenant/create",
				parameters: { tenant: eParameterLocation.params }
			}),
			updateOpenIdTenant: defineEndpoint({ method: "patch", url: "/api/:tenant/tenant/update/:id" }),
			deleteOpenIdTenant: defineEndpoint({ method: "delete", url: "/api/:tenant/tenant/delete/:id" })
		},
		openIdClient: {
			listOpenIdClient: defineEndpoint({ method: "get", url: "/api/:tenant/list/list" }),
			getOpenIdClient: defineEndpoint({ method: "get", url: "/api/:tenant/get/:id" }),
			createOpenIdClient: defineEndpoint({ method: "post", url: "/api/:tenant/create" }),
			updateOpenIdClient: defineEndpoint({ method: "patch", url: "/api/:tenant/update/:id" }),
			deleteOpenIdClient: defineEndpoint({ method: "delete", url: "/api/:tenant/delete/:id" })
		},
		openIdRole: {
			listOpenIdRole: defineEndpoint({ method: "get", url: "/api/:tenant/list/list" }),
			getOpenIdRole: defineEndpoint({ method: "get", url: "/api/:tenant/get/:id" }),
			createOpenIdRole: defineEndpoint({ method: "post", url: "/api/:tenant/create" }),
			updateOpenIdRole: defineEndpoint({ method: "patch", url: "/api/:tenant/update/:id" }),
			deleteOpenIdRole: defineEndpoint({ method: "delete", url: "/api/:tenant/delete/:id" })
		},
		openIdAccount: {
			listOpenIdAccount: defineEndpoint({ method: "get", url: "/api/:tenant/list/list" }),
			getOpenIdAccount: defineEndpoint({ method: "get", url: "/api/:tenant/get/:id" }),
			createOpenIdAccount: defineEndpoint({ method: "post", url: "/api/:tenant/create" }),
			updateOpenIdAccount: defineEndpoint({ method: "patch", url: "/api/:tenant/update/:id" }),
			deleteOpenIdAccount: defineEndpoint({ method: "delete", url: "/api/:tenant/delete/:id" }),
			changeAccountPassword: defineEndpoint({
				method: "patch",
				url: "/api/:tenant/change_password/:id",
				parameters: { id: eParameterLocation.query, tenant: eParameterLocation.query }
			})
		},
		openIdPermission: {
			listOpenIdPermission: defineEndpoint({ method: "get", url: "/api/:tenant/list/list" }),
			getOpenIdPermission: defineEndpoint({ method: "get", url: "/api/:tenant/get/:id" }),
			createOpenIdPermission: defineEndpoint({ method: "post", url: "/api/:tenant/create" }),
			updateOpenIdPermission: defineEndpoint({ method: "patch", url: "/api/:tenant/update/:id" }),
			deleteOpenIdPermission: defineEndpoint({ method: "delete", url: "/api/:tenant/delete/:id" })
		}
	},
	requestConfig: onInterceptRequestParameters
});
