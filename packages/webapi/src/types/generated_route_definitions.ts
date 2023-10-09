import { IRouteBase } from "@blendsdk/stdlib";
export const routeDefinitions: {
	blend: { get_translations: IRouteBase; get_app_version: IRouteBase };
	authorization: {
		token_info: IRouteBase;
		authorize: IRouteBase;
		token: IRouteBase;
		signin: IRouteBase;
		redirect: IRouteBase;
		flow_info: IRouteBase;
		check_flow: IRouteBase;
		oidc_discovery: IRouteBase;
		oidc_discovery_keys: IRouteBase;
		user_info_get: IRouteBase;
		user_info_post: IRouteBase;
		session_logout_get: IRouteBase;
		session_logout_post: IRouteBase;
		logout_flow_info: IRouteBase;
		forgot_password_flow_info: IRouteBase;
		forgot_password_request_account: IRouteBase;
		check_password_reset_request: IRouteBase;
		request_password_reset: IRouteBase;
	};
	authentication: {
		authentication_keep_alive: IRouteBase;
		authentication_logout: IRouteBase;
		authentication_login: IRouteBase;
	};
	application: { initialize: IRouteBase; create_tenant: IRouteBase; get_user_profile: IRouteBase };
} = {
	blend: {
		get_translations: { id: "get_translations", method: "get", url: "/api/i18n/:locale?", public: false },
		get_app_version: { id: "get_app_version", method: "get", url: "/api/version", public: true }
	},
	authorization: {
		token_info: { id: "token_info", method: "post", url: "/:tenant/oauth2/token_info", public: false },
		authorize: { id: "authorize", method: "get", url: "/:tenant/oauth2/authorize", public: true },
		token: { id: "token", method: "post", url: "/:tenant/oauth2/token", public: true },
		signin: { id: "signin", method: "get", url: "/af/signin", public: true },
		redirect: { id: "redirect", method: "get", url: "/af/redirect", public: true },
		flow_info: { id: "flow_info", method: "post", url: "/af/flow_info", public: true },
		check_flow: { id: "check_flow", method: "post", url: "/af/check_flow", public: true },
		oidc_discovery: {
			id: "oidc_discovery",
			method: "get",
			url: "/:tenant/oauth2/.well-known/openid-configuration",
			public: true
		},
		oidc_discovery_keys: {
			id: "oidc_discovery_keys",
			method: "get",
			url: "/:tenant/oauth2/discovery/keys",
			public: true
		},
		user_info_get: { id: "user_info_get", method: "get", url: "/:tenant/oauth2/me", public: false },
		user_info_post: { id: "user_info_post", method: "post", url: "/:tenant/oauth2/me", public: false },
		session_logout_get: { id: "session_logout_get", method: "get", url: "/:tenant/oauth2/logout", public: false },
		session_logout_post: { id: "session_logout_post", method: "post", url: "/:tenant/oauth2/logout", public: false },
		logout_flow_info: { id: "logout_flow_info", method: "get", url: "/lf/flow_info", public: true },
		forgot_password_flow_info: { id: "forgot_password_flow_info", method: "post", url: "/fp/flow_info", public: true },
		forgot_password_request_account: {
			id: "forgot_password_request_account",
			method: "post",
			url: "/fp/forgot_request_account",
			public: true
		},
		check_password_reset_request: {
			id: "check_password_reset_request",
			method: "post",
			url: "/fp/check_password_reset_request",
			public: true
		},
		request_password_reset: {
			id: "request_password_reset",
			method: "post",
			url: "/fp/request_password_reset",
			public: true
		}
	},
	authentication: {
		authentication_keep_alive: {
			id: "authentication_keep_alive",
			method: "post",
			url: "/api/authentication/keep-alive"
		},
		authentication_logout: { id: "authentication_logout", method: "post", url: "/api/authentication/logout" },
		authentication_login: { id: "authentication_login", method: "post", url: "/api/authentication/login" }
	},
	application: {
		initialize: { id: "initialize", method: "post", url: "/api/initialize", public: false },
		create_tenant: { id: "create_tenant", method: "post", url: "/api/:tenant/tenant" },
		get_user_profile: { id: "get_user_profile", method: "get", url: "/:tenant/user_profile", public: false }
	}
};
