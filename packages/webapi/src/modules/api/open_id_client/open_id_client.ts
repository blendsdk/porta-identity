/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { OpenIdClientController } from "./OpenIdClientController";

export const OpenIdClientModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "list_open_id_client",
				controller: OpenIdClientController,
				route: routeDefinitions.open_id_client.list_open_id_client
			}),
			defineControllerRoute({
				dispatch: "get_open_id_client",
				controller: OpenIdClientController,
				route: routeDefinitions.open_id_client.get_open_id_client
			}),
			defineControllerRoute({
				dispatch: "create_open_id_client",
				controller: OpenIdClientController,
				route: routeDefinitions.open_id_client.create_open_id_client
			}),
			defineControllerRoute({
				dispatch: "update_open_id_client",
				controller: OpenIdClientController,
				route: routeDefinitions.open_id_client.update_open_id_client
			}),
			defineControllerRoute({
				dispatch: "delete_open_id_client",
				controller: OpenIdClientController,
				route: routeDefinitions.open_id_client.delete_open_id_client
			})
		]
	};
};
