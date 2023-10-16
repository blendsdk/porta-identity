/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { ApplicationController } from "./ApplicationController";

export const ApplicationModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "initialize",
				controller: ApplicationController,
				route: routeDefinitions.application.initialize
			}),
			defineControllerRoute({
				dispatch: "get_user_profile",
				controller: ApplicationController,
				route: routeDefinitions.application.get_user_profile
			})
		]
	};
};
