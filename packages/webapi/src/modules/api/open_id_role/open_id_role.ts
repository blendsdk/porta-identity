/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { OpenIdRoleController } from "./OpenIdRoleController";

export const OpenIdRoleModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "list_open_id_role",
				controller: OpenIdRoleController,
				route: routeDefinitions.open_id_role.list_open_id_role
			}),
			defineControllerRoute({
				dispatch: "get_open_id_role",
				controller: OpenIdRoleController,
				route: routeDefinitions.open_id_role.get_open_id_role
			}),
			defineControllerRoute({
				dispatch: "create_open_id_role",
				controller: OpenIdRoleController,
				route: routeDefinitions.open_id_role.create_open_id_role
			}),
			defineControllerRoute({
				dispatch: "update_open_id_role",
				controller: OpenIdRoleController,
				route: routeDefinitions.open_id_role.update_open_id_role
			}),
			defineControllerRoute({
				dispatch: "delete_open_id_role",
				controller: OpenIdRoleController,
				route: routeDefinitions.open_id_role.delete_open_id_role
			})
		]
	};
};
