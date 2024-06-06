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
				dispatch: "discovery",
				controller: AuthorizationController,
				route: routeDefinitions.authorization.discovery
			})
		]
	};
};
