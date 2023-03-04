import { IRouter } from "@blendsdk/webafx";
import { validationSchema } from "../../types";

/**
 * Provides the global validation schema to the router
 */
export const ValidationSchema = (): IRouter => {
    return {
        validationSchema
    };
};
