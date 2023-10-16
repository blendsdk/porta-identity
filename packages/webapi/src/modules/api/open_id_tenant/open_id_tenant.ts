/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { OpenIdTenantController } from "./OpenIdTenantController";

export const OpenIdTenantModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "list_open_id_tenant",
				controller: OpenIdTenantController,
				route: routeDefinitions.open_id_tenant.list_open_id_tenant
			}),
			defineControllerRoute({
				dispatch: "get_open_id_tenant",
				controller: OpenIdTenantController,
				route: routeDefinitions.open_id_tenant.get_open_id_tenant
			}),
			defineControllerRoute({
				dispatch: "create_open_id_tenant",
				controller: OpenIdTenantController,
				route: routeDefinitions.open_id_tenant.create_open_id_tenant
			}),
			defineControllerRoute({
				dispatch: "update_open_id_tenant",
				controller: OpenIdTenantController,
				route: routeDefinitions.open_id_tenant.update_open_id_tenant
			}),
			defineControllerRoute({
				dispatch: "delete_open_id_tenant",
				controller: OpenIdTenantController,
				route: routeDefinitions.open_id_tenant.delete_open_id_tenant
			})
		]
	};
};
