import { errorObjectInfo } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import {
    IGetUserProfileRequest,
    IGetUserProfileResponse,
    IInitializeRequest,
    IInitializeResponse
} from "@porta/shared";
import { SysAccessTokenViewDataService } from "../../../dataservices/SysAccessTokenViewDataService";
import { SysUserDataService } from "../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../dataservices/SysUserProfileDataService";
import { commonUtils, databaseUtils, neutralAvatar } from "../../../utils";
import { DatabaseSeed } from "../../../utils/DatabaseSeed";
import { Claims } from "../authorization/Claims";
import { ApplicationControllerBase } from "./ApplicationControllerBase";

/**
 * @export
 * @abstract
 * @class ApplicationController
 * @extends {ApplicationControllerBase}
 */
export class ApplicationController extends ApplicationControllerBase {
    public async getUserProfile(_params: IGetUserProfileRequest): Promise<Response<IGetUserProfileResponse>> {
        const { user_id, id } = this.request.context.getUser<{ user_id: string; id: string }>();
        const tenant = commonUtils.getTenantFromRequest(this.request);
        const { dataSource } = await databaseUtils.getTenantDataSource(tenant);

        const userDs = new SysUserDataService({ dataSource });
        const accessTokenViewDs = new SysAccessTokenViewDataService({ dataSource });
        const profileDs = new SysUserProfileDataService({ dataSource });

        const user = await userDs.findSysUserById({ id: user_id });
        const profile = await profileDs.findUserProfileByUserId({ user_id });
        const accessTokenView = await accessTokenViewDs.findAccessTokenById({ id });
        const accessTokenStorage = await databaseUtils.findAccessTokenByTenant({
            tenant,
            check_validity: true,
            token_reference: undefined,
            access_token: accessTokenView.access_token
        });

        let accessClaims: any = undefined;

        if (profile && !profile.avatar) {
            profile.avatar = neutralAvatar;
        }

        if (user) {
            const claims = new Claims(accessTokenStorage, this.getServerURL(), tenant);
            accessClaims = claims.getClaims();
        }

        return new SuccessResponse({
            tenant: {
                ...accessTokenStorage.tenant,
                id: undefined,
                allow_reset_password: undefined,
                database: undefined,
                is_active: undefined
            },
            user,
            profile,
            roles: accessClaims?.roles,
            permissions: accessClaims?.permissions,
            signout_url: accessClaims?.signout_url
        });
    }

    /**
     * @param {ICreateTenantRequest} params
     * @returns {Promise<Response<IOpsResponse>>}
     * @memberof ApplicationController
     */
    // public async createTenant(params: ICreateTenantRequest): Promise<Response<IOpsResponse>> {
    //     try {
    //         let { password, email, allow_registration, allow_reset_password, name, organization } = params;
    //         name = name.toLocaleLowerCase();
    //         const databaseSeed = new DatabaseSeed();
    //         const tenantRecord = await databaseSeed.initializeTenant({
    //             allow_registration,
    //             allow_reset_password,
    //             databaseName: `porta_${name}`,
    //             organization,
    //             tenantName: name,
    //             username: email,
    //             password,
    //             email,
    //             serverURL: this.getServerURL()
    //         });

    //         return new SuccessResponse({
    //             status: tenantRecord ? true : false,
    //             error: tenantRecord ? undefined : `${ucFirst(organization)} is already initialized!`,
    //             ...(tenantRecord || {})
    //         } as any);
    //     } catch (err) {
    //         this.getLogger().error(err.message, errorObjectInfo(err));
    //         return new ServerErrorResponse(err);
    //     }
    // }

    /**
     * Initializes the Porta Registry Tenant
     *
     * @param {IInitializeRequest} {key}
     * @returns {Promise<Response<IInitializeResponse>>}
     * @memberof ApplicationController
     */
    public async initialize({ username, email, password }: IInitializeRequest): Promise<Response<IInitializeResponse>> {
        try {
            username = username || email;

            const databaseSeed = new DatabaseSeed();
            const tenantRecord = await databaseSeed.initializeTenant({
                allow_registration: false,
                allow_reset_password: true,
                databaseName: commonUtils.getPortaRegistryTenant(),
                organization: "Porta Registry",
                tenantName: commonUtils.getPortaRegistryTenant(),
                username,
                password,
                email,
                serverURL: this.getServerURL()
            });

            return new SuccessResponse({
                status: tenantRecord ? true : false,
                error: tenantRecord ? undefined : "Porta is already initialized!",
                ...(tenantRecord || {})
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }
}
