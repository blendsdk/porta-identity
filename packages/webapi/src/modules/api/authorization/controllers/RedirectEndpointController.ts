import { createErrorObject } from "@blendsdk/stdlib";
import {
    IRedirectResponse,
    RedirectResponse,
    Response,
    ServerErrorResponse,
    SuccessResponse
} from "@blendsdk/webafx-common";
import { IRedirectRequest } from "@porta/shared";
import { eOAuthResponseMode, IFlowRedirect } from "../../../../types";
import { formPostTemplate } from "../FormPostTemplate";
import { EndpointController } from "./EndpointControllerBase";

/**
 * Handles the redirect endpoint
 *
 * @export
 * @class RedirectEndpointController
 * @extends {EndpointController}
 */
export class RedirectEndpointController extends EndpointController {
    /**
     * The redirection endpoint for handling redirecting to the redirect_uri
     *
     * @param {IRedirectRequest} { flow }
     * @returns {Promise<Response<IRedirectResponse>>}
     * @memberof AuthorizationController
     */
    public async handleRequest({ af }: IRedirectRequest): Promise<Response<IRedirectResponse>> {
        try {
            const errors: string[] = [];
            let resp: Response = undefined;

            if (af) {
                const { redirect_uri, response, response_mode } =
                    (await this.getCache().getValue<IFlowRedirect>(`redirect:${af}`)) || {};

                if (redirect_uri && response && response_mode) {
                    // redirect for the query mode
                    if (response_mode === eOAuthResponseMode.query) {
                        const query = new URLSearchParams(response).toString();
                        resp = new RedirectResponse({
                            url: `${redirect_uri}${query !== "" ? `?${query}` : ""}`
                        });
                    } else if (response_mode === eOAuthResponseMode.form_post) {
                        resp = new SuccessResponse(
                            formPostTemplate({
                                redirect_uri,
                                data: response
                            })
                        );
                    }
                    await this.getCache().deleteValue(`redirect:${af}`);
                } else {
                    errors.push("non_existent");
                }
            } else {
                errors.push("not_provided");
            }

            return resp !== undefined
                ? resp
                : new ServerErrorResponse(createErrorObject({ message: "INVALID_REDIRECTION_FLOW", cause: errors }));
        } catch (err) {
            return new ServerErrorResponse(err.message);
        }
    }
}
