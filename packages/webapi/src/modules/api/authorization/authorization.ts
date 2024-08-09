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
				dispatch: "logout_flow_info",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.logout_flow_info
			}),
			defineControllerRoute({
				dispatch: "session_logout_get",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.session_logout_get
			}),
			defineControllerRoute({
				dispatch: "session_logout_post",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.session_logout_post
			}),
			defineControllerRoute({
				dispatch: "token_info",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.token_info
			}),
			defineControllerRoute({
				dispatch: "user_info_post",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.user_info_post
			}),
			defineControllerRoute({
				dispatch: "user_info_get",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.user_info_get
			}),
			defineControllerRoute({
				dispatch: "token",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.token
			}),
			defineControllerRoute({
				dispatch: "finalize",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.finalize
			}),
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
