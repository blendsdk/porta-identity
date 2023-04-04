import { IRouteBase } from "@blendsdk/stdlib";
export const routeDefinitions: {
	blend: { get_translations: IRouteBase; get_app_version: IRouteBase };
	authorization: {
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
	};
	authentication: {
		authentication_keep_alive: IRouteBase;
		authentication_logout: IRouteBase;
		authentication_login: IRouteBase;
	};
} = {
	blend: {
		get_translations: {
			id: "get_translations",
			method: "get",
			url: "/api/i18n/:locale?",
			public: false,
			signed: false
		},
		get_app_version: { id: "get_app_version", method: "get", url: "/api/version", public: true, signed: false }
	},
	authorization: {
		authorize: { id: "authorize", method: "get", url: "/:tenant/oauth2/authorize", public: true, signed: false },
		token: { id: "token", method: "post", url: "/:tenant/oauth2/token", public: true, signed: false },
		signin: { id: "signin", method: "get", url: "/af/signin", public: true, signed: false },
		redirect: { id: "redirect", method: "get", url: "/af/redirect", public: true, signed: false },
		flow_info: { id: "flow_info", method: "post", url: "/af/flow_info", public: true },
		check_flow: { id: "check_flow", method: "post", url: "/af/check_flow", public: true },
		oidc_discovery: {
			id: "oidc_discovery",
			method: "get",
			url: "/:tenant/oauth2/.well-known/openid-configuration",
			public: true,
			signed: false
		},
		oidc_discovery_keys: {
			id: "oidc_discovery_keys",
			method: "get",
			url: "/:tenant/oauth2/discovery/keys",
			public: true,
			signed: false
		},
		user_info_get: { id: "user_info_get", method: "get", url: "/:tenant/oauth2/me", public: false, signed: false },
		user_info_post: { id: "user_info_post", method: "post", url: "/:tenant/oauth2/me", public: false, signed: false },
		session_logout_get: {
			id: "session_logout_get",
			method: "get",
			url: "/:tenant/oauth2/logout",
			public: false,
			signed: false
		},
		session_logout_post: {
			id: "session_logout_post",
			method: "post",
			url: "/:tenant/oauth2/logout",
			public: false,
			signed: false
		}
	},
	authentication: {
		authentication_keep_alive: {
			id: "authentication_keep_alive",
			method: "post",
			url: "/api/authentication/keep-alive"
		},
		authentication_logout: {
			id: "authentication_logout",
			method: "post",
			url: "/api/authentication/logout",
			signed: false
		},
		authentication_login: { id: "authentication_login", method: "post", url: "/api/authentication/login" }
	}
};
