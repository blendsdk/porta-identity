/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { OpenIdPermissionController } from "./OpenIdPermissionController";

export const OpenIdPermissionModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "list_open_id_permission",
				controller: OpenIdPermissionController,
				route: routeDefinitions.open_id_permission.list_open_id_permission
			}),
			defineControllerRoute({
				dispatch: "get_open_id_permission",
				controller: OpenIdPermissionController,
				route: routeDefinitions.open_id_permission.get_open_id_permission
			}),
			defineControllerRoute({
				dispatch: "create_open_id_permission",
				controller: OpenIdPermissionController,
				route: routeDefinitions.open_id_permission.create_open_id_permission
			}),
			defineControllerRoute({
				dispatch: "update_open_id_permission",
				controller: OpenIdPermissionController,
				route: routeDefinitions.open_id_permission.update_open_id_permission
			}),
			defineControllerRoute({
				dispatch: "delete_open_id_permission",
				controller: OpenIdPermissionController,
				route: routeDefinitions.open_id_permission.delete_open_id_permission
			})
		]
	};
};
