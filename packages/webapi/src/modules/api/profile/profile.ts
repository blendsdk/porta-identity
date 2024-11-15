/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { ProfileController } from "./ProfileController";

export const ProfileModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "get_user_profile",
				controller: ProfileController,
				route: routeDefinitions.profile.get_user_profile
			}),
			defineControllerRoute({
				dispatch: "get_user_state",
				controller: ProfileController,
				route: routeDefinitions.profile.get_user_state
			}),
			defineControllerRoute({
				dispatch: "save_user_state",
				controller: ProfileController,
				route: routeDefinitions.profile.save_user_state
			})
		]
	};
};
