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
				dispatch: "create_application",
				controller: AdminController,
				route: routeDefinitions.admin.create_application
			})
		]
	};
};
