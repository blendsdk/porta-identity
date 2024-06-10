import { eSortDirection, expression } from "@blendsdk/expression";
import { Response } from "@blendsdk/webafx-common";
import { IListExtensionRequest, IListExtensionResponse, eSysExtension } from "@porta/shared";
import { DataServices } from "../../../dataservices/DataServices";
import { ExtensionControllerBase } from "./ExtensionControllerBase";

/**
 * @export
 * @abstract
 * @class ExtensionController
 * @extends {ExtensionControllerBase}
 */
export class ExtensionController extends ExtensionControllerBase {
    /**
     * @param {IListExtensionRequest} _params
     * @return {*}  {Promise<Response<IListExtensionResponse>>}
     * @memberof ExtensionController
     */
    public async listExtension({ tenant }: IListExtensionRequest): Promise<Response<IListExtensionResponse>> {
        return this.withSuccessResponse(async () => {
            const ds = new DataServices(tenant, this.request);
            return ds.withTransaction(() => {
                const e = expression();
                return ds
                    .sysExtensionDataService()
                    .listSysExtensionByExpression(
                        e.createRenderer(
                            e.And(e.Equal(eSysExtension.IS_ACTIVE, true)),
                            e.OrderBy({ column: eSysExtension.NAME, sortDirection: eSortDirection.ASC })
                        )
                    );
            });
        });
    }
}
