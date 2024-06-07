/**
 * DO NOT CHANGE.
 * THIS FILE IS AUTO GENERATED
 */

import { IRouteBase } from "@blendsdk/stdlib";
export const routeDefinitions: {
	blend: { get_translations: IRouteBase; get_app_version: IRouteBase };
	authorization: { discovery_keys: IRouteBase; discovery: IRouteBase; authorize: IRouteBase };
	initialize: { initialize: IRouteBase };
} = {
	blend: {
		get_translations: { id: "get_translations", method: "get", url: "/api/i18n/:locale?", public: false },
		get_app_version: { id: "get_app_version", method: "get", url: "/api/version", public: true }
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
	},
	initialize: { initialize: { id: "initialize", method: "post", url: "/api/initialize", public: false } }
};
