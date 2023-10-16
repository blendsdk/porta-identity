/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { OpenIdAccountController } from "./OpenIdAccountController";

export const OpenIdAccountModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "list_open_id_account",
				controller: OpenIdAccountController,
				route: routeDefinitions.open_id_account.list_open_id_account
			}),
			defineControllerRoute({
				dispatch: "get_open_id_account",
				controller: OpenIdAccountController,
				route: routeDefinitions.open_id_account.get_open_id_account
			}),
			defineControllerRoute({
				dispatch: "create_open_id_account",
				controller: OpenIdAccountController,
				route: routeDefinitions.open_id_account.create_open_id_account
			}),
			defineControllerRoute({
				dispatch: "update_open_id_account",
				controller: OpenIdAccountController,
				route: routeDefinitions.open_id_account.update_open_id_account
			}),
			defineControllerRoute({
				dispatch: "delete_open_id_account",
				controller: OpenIdAccountController,
				route: routeDefinitions.open_id_account.delete_open_id_account
			})
		]
	};
};
