/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { AuthorizationController } from "./AuthorizationController";

export const AuthorizationModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "check_set_flow",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.check_set_flow
			}),
			defineControllerRoute({
				dispatch: "discovery_keys",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.discovery_keys
			}),
			defineControllerRoute({
				dispatch: "discovery",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.discovery
			}),
			defineControllerRoute({
				dispatch: "authorize",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.authorize
			})
		]
	};
};
