/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { InitializeController } from "./InitializeController";

export const InitializeModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "delete_tenant",
				controller: InitializeController,
				route: routeDefinitions.initialize.delete_tenant
			}),
			defineControllerRoute({
				dispatch: "create_tenant",
				controller: InitializeController,
				route: routeDefinitions.initialize.create_tenant
			}),
			defineControllerRoute({
				dispatch: "initialize",
				controller: InitializeController,
				route: routeDefinitions.initialize.initialize
			})
		]
	};
};
