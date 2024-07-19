/**
 * DO NOT CHANGE.
 * THIS FILE IS AUTO GENERATED
 */

import { IRouteBase } from "@blendsdk/stdlib";
export const routeDefinitions: {
	blend: { get_translations: IRouteBase; get_app_version: IRouteBase };
	initialize: { initialize: IRouteBase };
	reference_data: { get_reference_data: IRouteBase };
	profile: { get_user_profile: IRouteBase; get_user_state: IRouteBase; save_user_state: IRouteBase };
	authorization: {
		user_info_post: IRouteBase;
		user_info_get: IRouteBase;
		token: IRouteBase;
		finalize: IRouteBase;
		check_set_flow: IRouteBase;
		discovery_keys: IRouteBase;
		discovery: IRouteBase;
		authorize: IRouteBase;
	};
} = {
	blend: {
		get_translations: { id: "get_translations", method: "get", url: "/api/i18n/:locale?", public: false },
		get_app_version: { id: "get_app_version", method: "get", url: "/api/version", public: true }
	},
	initialize: { initialize: { id: "initialize", method: "post", url: "/api/initialize", public: false } },
	reference_data: {
		get_reference_data: { id: "get_reference_data", method: "post", url: "/api/:tenant/reference_data", public: false }
	},
	profile: {
		get_user_profile: { id: "get_user_profile", method: "post", url: "/api/profile", public: false },
		get_user_state: { id: "get_user_state", method: "get", url: "/api/:tenant/user_state", public: false },
		save_user_state: { id: "save_user_state", method: "post", url: "/api/:tenant/user_state", public: false }
	},
	authorization: {
		user_info_post: { id: "user_info_post", method: "post", url: "/:tenant/oauth2/me", public: false },
		user_info_get: { id: "user_info_get", method: "get", url: "/:tenant/oauth2/me", public: false },
		token: { id: "token", method: "post", url: "/:tenant/oauth2/token", public: true },
		finalize: { id: "finalize", method: "get", url: "/af/finalize", public: true },
		check_set_flow: { id: "check_set_flow", method: "post", url: "/af/flow", public: true },
		discovery_keys: { id: "discovery_keys", method: "get", url: "/:tenant/oauth2/discovery/keys", public: true },
		discovery: {
			id: "discovery",
			method: "get",
			url: "/:tenant/oauth2/.well-known/openid-configuration",
			public: true
		},
		authorize: { id: "authorize", method: "get", url: "/:tenant/oauth2/authorize", public: true }
	}
};
