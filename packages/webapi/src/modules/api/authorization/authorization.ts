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
				dispatch: "authorize",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.authorize
			}),
			defineControllerRoute({
				dispatch: "token",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.token
			}),
			defineControllerRoute({
				dispatch: "signin",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.signin
			}),
			defineControllerRoute({
				dispatch: "redirect",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.redirect
			}),
			defineControllerRoute({
				dispatch: "flow_info",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.flow_info
			}),
			defineControllerRoute({
				dispatch: "check_flow",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.check_flow
			}),
			defineControllerRoute({
				dispatch: "oidc_discovery",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.oidc_discovery
			}),
			defineControllerRoute({
				dispatch: "oidc_discovery_keys",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.oidc_discovery_keys
			}),
			defineControllerRoute({
				dispatch: "user_info_get",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.user_info_get
			}),
			defineControllerRoute({
				dispatch: "user_info_post",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.user_info_post
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
				dispatch: "logout_flow_info",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.logout_flow_info
			}),
			defineControllerRoute({
				dispatch: "forgot_password_flow_info",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.forgot_password_flow_info
			}),
			defineControllerRoute({
				dispatch: "forgot_password_request_account",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.forgot_password_request_account
			}),
			defineControllerRoute({
				dispatch: "check_password_reset_request",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.check_password_reset_request
			}),
			defineControllerRoute({
				dispatch: "request_password_reset",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.request_password_reset
			})
		]
	};
};
