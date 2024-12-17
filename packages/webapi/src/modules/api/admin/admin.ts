/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { AdminController } from "./AdminController";

export const AdminModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "change_account_state",
				controller: AdminController,
				route: routeDefinitions.admin.change_account_state
			}),
			defineControllerRoute({
				dispatch: "create_account",
				controller: AdminController,
				route: routeDefinitions.admin.create_account
			}),
			defineControllerRoute({
				dispatch: "create_application",
				controller: AdminController,
				route: routeDefinitions.admin.create_application
			}),
			defineControllerRoute({
				dispatch: "create_client",
				controller: AdminController,
				route: routeDefinitions.admin.create_client
			})
		]
	};
};
