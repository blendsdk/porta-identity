/**
 * DO NOT CHANGE.
 * THIS FILE IS AUTO GENERATED
 */

import { IRouteBase } from "@blendsdk/stdlib";
export const routeDefinitions: { blend: { get_translations: IRouteBase; get_app_version: IRouteBase } } = {
	blend: {
		get_translations: { id: "get_translations", method: "get", url: "/api/i18n/:locale?", public: false },
		get_app_version: { id: "get_app_version", method: "get", url: "/api/version", public: true }
	}
};
