import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { expression } from "@blendsdk/expression";
import { asyncForEach, indexObject, wrapInArray } from "@blendsdk/stdlib";
import { BadRequestResponse, Response } from "@blendsdk/webafx-common";
import {
    eSystemRoles,
    eSysUserPermissionView,
    hasRole,
    ICreateAccount,
    ICreateAccountRequest,
    ICreateAccountResponse,
    ICreateApplication,
    ICreateApplicationRequest,
    ICreateApplicationResponse,
    ICreateClientRequest,
    ICreateClientResponse,
    IPortaAccount,
    ISysRole,
    ISysUserPermissionView
} from "@porta/shared";
import { DataServices } from "../../../dataservices/DataServices";
import { commonUtils } from "../../../services";
import { CONST_DAY_IN_SECONDS, IPortaApplicationSetting } from "../../../types";
import { AdminControllerBase } from "./AdminControllerBase";

/**
 * @export
 * @abstract
 * @class AdminController
 * @extends {AdminControllerBase}
 */
export class AdminController extends AdminControllerBase {
    /**
     * @param {ICreateClientRequest} params
     * @return {*}  {Promise<Response<ICreateClientResponse>>}
     * @memberof AdminController
     */
    public async createClient(params: ICreateClientRequest): Promise<Response<ICreateClientResponse>> {
        let error: string = undefined;

        if (!hasRole(eSystemRoles.TENANT_OWNER, this.getUser<IPortaAccount>().roles)) {
            error = "You are not a tenant owner!";
        }

        if (!error) {
            const {
                ACCESS_TOKEN_TTL,
                REFRESH_TOKEN_TTL,
                BYPASS_MFA_DAYS = 1
            } = this.getContext().getSettings<IPortaApplicationSetting>();

            const {
                tenant,
                application,
                client_type = "C",
                redirect_uri,
                is_back_channel_post_logout = false,
                mfa_bypass_days = BYPASS_MFA_DAYS || 1,
                mfa_id,
                post_logout_redirect_uri
            } = params;

            return this.withSuccessResponse<ICreateApplication>(() => {
                const ds = new DataServices(tenant, this.request);
                return ds.withTransaction(async () => {
                    const applicationRecord = await ds.sysApplicationDataService().findSysApplicationById({
                        id: application
                    });

                    if (applicationRecord) {
                        await ds.sysClientDataService().insertIntoSysClient({
                            application_id: applicationRecord.id,
                            client_type,
                            redirect_uri,
                            post_logout_redirect_uri,
                            is_back_channel_post_logout,
                            access_token_length: ACCESS_TOKEN_TTL,
                            refresh_token_length: REFRESH_TOKEN_TTL,
                            mfa_bypass_days,
                            mfa_id,
                            is_active: true,
                            is_system: false
                        });

                        const now = Date.now();

                        const application_secret = commonUtils.generateSecret(60);
                        await ds.sysSecretDataService().insertIntoSysSecret({
                            application_id: applicationRecord.id,
                            secret: application_secret,
                            valid_from: new Date(now).toISOString(),
                            valid_to: new Date(
                                commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * 365, now)
                            ).toISOString()
                        });

                        return {
                            application_id: applicationRecord.id,
                            client_id: applicationRecord.client_id,
                            client_secret: application_secret
                        };
                    } else {
                        throw new Error(`Application ${application} does not exist!`);
                    }
                });
            });
        } else {
            return new BadRequestResponse(new Error(error));
        }
    }
    /**
     * @param {ICreateAccountRequest} params
     * @return {*}  {Promise<Response<ICreateAccountResponse>>}
     * @memberof AdminController
     */
    public async createAccount(params: ICreateAccountRequest): Promise<Response<ICreateAccountResponse>> {
        let error: string = undefined;

        if (
            !hasRole(eSystemRoles.ADMINISTRATOR, this.getUser<IPortaAccount>().roles) &&
            !hasRole(eSystemRoles.TENANT_OWNER, this.getUser<IPortaAccount>().roles)
        ) {
            error = "You are not authorized to create accounts!";
        }

        if (!error) {
            const {
                tenant,
                username,
                password,
                email,
                is_active = true,
                require_pw_change = true,
                service_application_id,
                firstname,
                lastname,
                address,
                applications,
                avatar,
                birthdate,
                city,
                country,
                gender,
                locale,
                middle_name,
                phone_number,
                phone_number_verified,
                postalcode,
                state,
                website,
                zoneinfo,
                metadata
            } = params;

            return this.withSuccessResponse<ICreateAccount>(() => {
                const ds = new DataServices(tenant, this.request);
                return ds.withTransaction(async () => {
                    const userRecord = await ds.sysUserDataService().insertIntoSysUser({
                        username: username || email,
                        password,
                        is_active,
                        require_pw_change,
                        is_system: false,
                        service_application_id
                    });
                    await ds.sysProfileDataService().insertIntoSysProfile({
                        user_id: userRecord.id,
                        email,
                        firstname,
                        lastname,
                        address,
                        avatar,
                        birthdate,
                        city,
                        country,
                        gender,
                        locale,
                        middle_name,
                        phone_number,
                        phone_number_verified,
                        postalcode,
                        state,
                        website,
                        zoneinfo,
                        metadata: metadata ? JSON.parse(metadata) : undefined
                    });

                    await asyncForEach(wrapInArray<string>(applications), async (application_id) => {
                        const appRole = await ds.sysRoleDataService().findSysRoleById({ id: application_id }); // role id's for
                        if (appRole) {
                            await ds.sysUserRoleDataService().insertIntoSysUserRole({
                                role_id: appRole.id,
                                user_id: userRecord.id
                            });
                        }
                    });

                    return {
                        user_id: userRecord.id,
                        user_name: userRecord.username,
                        date_created: userRecord.date_created
                    };
                });
            });
        } else {
            return new BadRequestResponse(new Error(error));
        }
    }

    /**
     * @param {ICreateApplicationRequest} params
     * @return {*}  {Promise<Response<ICreateApplicationResponse>>}
     * @memberof AdminController
     */
    public async createApplication(params: ICreateApplicationRequest): Promise<Response<ICreateApplicationResponse>> {
        let error: string = undefined;

        if (!hasRole(eSystemRoles.TENANT_OWNER, this.getUser<IPortaAccount>().roles)) {
            error = "You are not a tenant owner!";
        }

        if (!error) {
            const {
                ACCESS_TOKEN_TTL,
                REFRESH_TOKEN_TTL,
                BYPASS_MFA_DAYS = 1
            } = this.getContext().getSettings<IPortaApplicationSetting>();

            const {
                tenant,
                application_name,
                description,
                logo,
                ow_consent = false,
                client_type = "C",
                redirect_uri,
                is_back_channel_post_logout = false,
                mfa_bypass_days = BYPASS_MFA_DAYS || 1,
                mfa_id,
                post_logout_redirect_uri,
                metadata
            } = params;

            const portaAccount = this.getContext().getUser<IPortaAccount>();

            return this.withSuccessResponse<ICreateApplication>(() => {
                const ds = new DataServices(tenant, this.request);
                return ds.withTransaction(async () => {
                    const applicationRecord = await ds.sysApplicationDataService().insertIntoSysApplication({
                        application_name,
                        client_id: await sha256Hash(generateRandomUUID()),
                        tenant_id: portaAccount.tenant.id,
                        description,
                        logo,
                        ow_consent,
                        is_active: true,
                        is_system: false,
                        metadata: metadata ? JSON.parse(metadata) : undefined
                    });

                    await ds.sysClientDataService().insertIntoSysClient({
                        application_id: applicationRecord.id,
                        client_type,
                        redirect_uri,
                        post_logout_redirect_uri,
                        is_back_channel_post_logout,
                        access_token_length: ACCESS_TOKEN_TTL,
                        refresh_token_length: REFRESH_TOKEN_TTL,
                        mfa_bypass_days,
                        mfa_id,
                        is_active: true,
                        is_system: false
                    });

                    const now = Date.now();

                    const application_secret = commonUtils.generateSecret(60);
                    await ds.sysSecretDataService().insertIntoSysSecret({
                        application_id: applicationRecord.id,
                        secret: application_secret,
                        valid_from: new Date(now).toISOString(),
                        valid_to: new Date(
                            commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * 365, now)
                        ).toISOString()
                    });

                    const applicationRole = await ds.sysRoleDataService().insertIntoSysRole({
                        id: applicationRecord.id,
                        role: applicationRecord.application_name,
                        description: `${applicationRecord.application_name} Users`,
                        is_active: true,
                        is_system: true
                    });

                    const defPerm = await ds.sysPermissionDataService().insertIntoSysPermission({
                        permission: "DEFAULT",
                        application_id: applicationRecord.id
                    });

                    await ds.sysRolePermissionDataService().insertIntoSysRolePermission({
                        permission_id: defPerm.id,
                        role_id: applicationRole.id
                    });

                    await this.assignRoleToAdmins(applicationRole, ds);

                    return {
                        application_id: applicationRecord.id,
                        client_id: applicationRecord.client_id,
                        client_secret: application_secret
                    };
                });
            });
        } else {
            return new BadRequestResponse(new Error(error));
        }
    }

    /**
     * @protected
     * @param {ISysRole} role
     * @param {DataServices} ds
     * @return {*}
     * @memberof AdminController
     */
    protected async assignRoleToAdmins(role: ISysRole, ds: DataServices) {
        const e = expression();
        const admins = await ds
            .sysTenantDataService()
            .listSysUserPermissionViewByExpression(
                e.createRenderer(
                    e.Or(
                        e.Equal(eSysUserPermissionView.ROLE_ID, eSystemRoles.ADMINISTRATOR.id),
                        e.Equal(eSysUserPermissionView.ROLE_ID, eSystemRoles.TENANT_OWNER.id)
                    )
                )
            );

        const distinctUserIDs = Object.keys(indexObject<ISysUserPermissionView>(admins, "user_id"));

        return asyncForEach(distinctUserIDs, async (user_id) => {
            await ds.sysUserRoleDataService().insertIntoSysUserRole({
                role_id: role.id,
                user_id: user_id
            });
        });
    }
}
