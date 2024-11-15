import { IDictionaryOf, TClass, asyncForEach } from "@blendsdk/stdlib";
import { Response } from "@blendsdk/webafx-common";
import { IGetReferenceData, IGetReferenceDataRequest, IGetReferenceDataResponse } from "@porta/shared";
import { databaseUtils } from "../../../services";
import { ReferenceDataControllerBase } from "./ReferenceDataControllerBase";

type IFields = {
    [field in keyof IGetReferenceData]: TClass;
};

/**
 * @export
 * @abstract
 * @class ReferenceDataController
 * @extends {ReferenceDataControllerBase}
 */
export class ReferenceDataController extends ReferenceDataControllerBase {
    /**
     * @param {IGetReferenceDataRequest} _params
     * @returns {Promise<Response<IGetReferenceDataResponse>>}
     * @memberof ReferenceDataController
     */
    public async getReferenceData({ tenant }: IGetReferenceDataRequest): Promise<Response<IGetReferenceDataResponse>> {
        return this.withSuccessResponse(async () => {
            const ds: IFields = {
            };

            const data: IDictionaryOf<any> = {};

            databaseUtils.assertTenant(tenant, this.request);
            const dataSource = await databaseUtils.initDataSource(tenant, this.request);

            await dataSource.withContext(async (sharedContext) => {
                await asyncForEach(Object.entries(ds), async ([field, clazz]) => {
                    const dataService = new (clazz as any)({ sharedContext });
                    if (dataService.findAll) {
                        data[field] = await dataService.findAll();
                    } else {
                        throw new Error(`Invalid or missing ${field} reference service!`);
                    }
                });
            });
            return data;
        });
    }
}
