/**
 * DO NOT CHANGE.
 * THIS FILE IS AUTO GENERATED
 */

import { IRouteBase } from "@blendsdk/stdlib";
export const routeDefinitions: {
	blend: { get_translations: IRouteBase; get_app_version: IRouteBase };
	extension: { list_extension: IRouteBase };
	initialize: { initialize: IRouteBase };
	reference_data: { get_reference_data: IRouteBase };
	profile: { get_user_profile: IRouteBase; get_user_state: IRouteBase; save_user_state: IRouteBase };
	authorization: { discovery_keys: IRouteBase; discovery: IRouteBase; authorize: IRouteBase };
} = {
	blend: {
		get_translations: { id: "get_translations", method: "get", url: "/api/i18n/:locale?", public: false },
		get_app_version: { id: "get_app_version", method: "get", url: "/api/version", public: true }
	},
	extension: { list_extension: { id: "list_extension", method: "get", url: "/api/:tenant/extensions/list" } },
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
