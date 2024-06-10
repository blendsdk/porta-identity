/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { ExtensionController } from "./ExtensionController";

export const ExtensionModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "list_extension",
				controller: ExtensionController,
				route: routeDefinitions.extension.list_extension
			})
		]
	};
};
