/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IRouter } from "@blendsdk/webafx";
import { defineControllerRoute } from "@blendsdk/webafx-common";
import { routeDefinitions } from "../../../types";
import { ReferenceDataController } from "./ReferenceDataController";

export const ReferenceDataModule = (): IRouter => {
	return {
		routes: [
			defineControllerRoute({
				dispatch: "get_reference_data",
				controller: ReferenceDataController,
				route: routeDefinitions.reference_data.get_reference_data
			})
		]
	};
};
