import { base64Encode, isNullOrUndef } from "@blendsdk/stdlib";
import { Response } from "@blendsdk/webafx-common";
import { IGetUserProfileRequest, IGetUserProfileResponse, IGetUserState, IGetUserStateRequest, IGetUserStateResponse, IPortaAccount, ISaveUserStateRequest, ISaveUserStateResponse } from "@porta/shared";
import { DataServices } from "../../../dataservices/DataServices";
import { ProfileControllerBase } from "./ProfileControllerBase";

/**
 * @export
 * @abstract
 * @class ProfileController
 * @extends {ProfileControllerBase}
 */
export class ProfileController extends ProfileControllerBase {
    /**
     * @param {IGetUserStateRequest} { tenant }
     * @return {*}  {Promise<Response<IGetUserStateResponse>>}
     * @memberof ProfileController
     */
    public getUserState({ tenant }: IGetUserStateRequest): Promise<Response<IGetUserStateResponse>> {
        return this.withSuccessResponse<IGetUserState>(() => {
            const ds = new DataServices(tenant, this.request);
            return ds.withTransaction(async () => {
                const { user } = this.getUser<IPortaAccount>();
                const profile = await ds.sysProfileDataService().findProfileByUserId({ user_id: user.id });
                return {
                    user_state: !isNullOrUndef(profile?.user_state) ? profile.user_state : base64Encode(JSON.stringify({}))
                };
            });
        });
    }

    /**
     * @param {ISaveUserStateRequest} { tenant, user_state }
     * @return {*}  {Promise<Response<ISaveUserStateResponse>>}
     * @memberof ProfileController
     */
    public saveUserState({ tenant, user_state }: ISaveUserStateRequest): Promise<Response<ISaveUserStateResponse>> {
        return this.withSuccessResponse(() => {
            const ds = new DataServices(tenant, this.request);
            return ds.withTransaction(async () => {
                const { profile } = this.getUser<IPortaAccount>();
                await ds.sysProfileDataService().updateSysProfileById(
                    {
                        user_state
                    },
                    { id: profile.id }
                );
            });
        });
    }

    /**
     * @param {IGetUserProfileRequest} _params
     * @returns {Promise<Response<IGetUserProfileResponse>>}
     * @memberof ProfileController
     */
    public async getUserProfile(_params: IGetUserProfileRequest): Promise<Response<IGetUserProfileResponse>> {
        return this.withSuccessResponse(async () => {
            const { user } = this.request.context.getSessionStorage<{ user: IPortaAccount; }>();
            return {
                ...user,
                _ui_locales: undefined,
                _sub: undefined,
                oidc: undefined
            };
        });
    }
}
