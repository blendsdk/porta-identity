import { sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { asyncForEach } from "@blendsdk/stdlib";
import { ISysClientType } from "@porta/shared";
import { CommandBuilder } from "yargs";
import { SysClientDataService } from "../../../dataservices/SysClientDataService";
import { SysClientTypeDataService } from "../../../dataservices/SysClientTypeDataService";
import { SysGroupDataService } from "../../../dataservices/SysGroupDataService";
import { SysGroupPermissionDataService } from "../../../dataservices/SysGroupPermissionDataService";
import { SysKeyDataService } from "../../../dataservices/SysKeyDataService";
import { SysPermissionDataService } from "../../../dataservices/SysPermissionDataService";
import { SysTenantDataService } from "../../../dataservices/SysTenantDataService";
import { SysUserDataService } from "../../../dataservices/SysUserDataService";
import { SysUserGroupDataService } from "../../../dataservices/SysUserGroupDataService";
import { SysUserProfileDataService } from "../../../dataservices/SysUserProfileDataService";
import { IPortaApplicationSetting } from "../../../types";
import { generateKeyPareAndCertificate, getUUID } from "../../../utils";
import { application } from "../../application";

/**
 * The name of this command
 */
export const command = "start";
/**
 * The description of this command
 */
export const desc = "Starts Porta";
/**
 * The description of command options
 */
export const builder: CommandBuilder = {
    c: {
        alias: "config",
        required: true,
        type: "array",
        description: "A configuration file to be used as application settings."
    }
};

export function checkAndInitialize() {
    return new Promise<void>(async (resolve, reject) => {
        try {
            const { PORTA_ADMIN, PORTA_PASSWORD } = application.getSettings<IPortaApplicationSetting>();
            if (!PORTA_ADMIN) {
                reject(`Missing PORTA_ADMIN configuration!`);
            }
            if (!PORTA_PASSWORD) {
                reject(`Missing PORTA_PASSWORD configuration!`);
            }

            const sharedContext = dataSourceManager.getDataSource<PostgreSQLDataSource>().createSharedContext();
            const userDs = new SysUserDataService({ sharedContext });
            const profileDs = new SysUserProfileDataService({ sharedContext });
            const keysDs = new SysKeyDataService({ sharedContext });
            const groupDs = new SysGroupDataService({ sharedContext });
            const userGroupDs = new SysUserGroupDataService({ sharedContext });
            const permissionDs = new SysPermissionDataService({ sharedContext });
            const groupPermissionDs = new SysGroupPermissionDataService({ sharedContext });
            const clientTypeDs = new SysClientTypeDataService({ sharedContext });
            const clientDs = new SysClientDataService({ sharedContext });

            let adminUser = await userDs.findByUsernameNonService({ username: PORTA_ADMIN });

            if (!adminUser) {
                const clientTypeData: Partial<ISysClientType>[] = [
                    {
                        client_type: "web_app",
                        description: "OIDC client that is a web application"
                    },
                    {
                        client_type: "mobile_app",
                        description: "OIDC client that is a mobile application"
                    },
                    {
                        client_type: "confidential",
                        description: "OIDC client that is a server side API"
                    }
                ];

                let client_type_id: string = undefined;

                await asyncForEach(clientTypeData, async ({ client_type, description }: any) => {
                    const result = await clientTypeDs.insertIntoSysClientType({ client_type, description });
                    if (client_type === "web_app") {
                        client_type_id = result.id;
                    }
                });

                await clientDs.insertIntoSysClient({
                    client_id: getUUID(),
                    client_type_id,
                    description: "Porta WebApp Client"
                });

                adminUser = await userDs.insertIntoSysUser({
                    username: PORTA_ADMIN,
                    password: PORTA_PASSWORD,
                    is_active: true
                });

                await profileDs.insertIntoSysUserProfile({
                    user_id: adminUser.id,
                    firstname: "System",
                    lastname: "Administrator"
                });

                const adminGroup = await groupDs.insertIntoSysGroup({
                    name: "Administrators",
                    description: "System administrators group",
                    is_active: true
                });

                const userGroup = await groupDs.insertIntoSysGroup({
                    name: "Users",
                    description: "All users",
                    is_active: true
                });

                await groupDs.insertIntoSysGroup({
                    name: "Services",
                    description: "All service accounts",
                    is_active: true
                });

                await userGroupDs.insertIntoSysUserGroup({
                    user_id: adminUser.id,
                    group_id: adminGroup.id
                });

                await userGroupDs.insertIntoSysUserGroup({
                    user_id: adminUser.id,
                    group_id: userGroup.id
                });

                const adminPerm = await permissionDs.insertIntoSysPermission({
                    code: "ADMIN",
                    description: "Can perform system administrative operations",
                    is_active: true
                });

                await groupPermissionDs.insertIntoSysGroupPermission({
                    group_id: adminGroup.id,
                    permission_id: adminPerm.id
                });

                await application.getLogger().info(`Admin user created`, adminUser);
            }

            const hasJwk = await keysDs.findJwkKeys();
            if (!hasJwk || hasJwk.length === 0) {
                await keysDs.insertIntoSysKey({
                    key_type: "JWK",
                    key_id: await sha256Hash(Date.now().toString()),
                    data: (await generateKeyPareAndCertificate("porta")) as any
                });
            }

            const tenantDs = new SysTenantDataService({ sharedContext });
            let defaultTenant = await tenantDs.findSysTenantByName({ name: "porta" });
            if (!defaultTenant) {
                defaultTenant = await tenantDs.insertIntoSysTenant({
                    name: "porta",
                    organization: "Porta Admin Tenant"
                });
                await application.getLogger().info(`Default porta tenant created`, defaultTenant);
            }
            (await sharedContext).disposeContext();
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

export const handler = async (argv: any) => {
    try {
        application.loadFileConfig(argv.config);
        try {
            await application.run();
            await checkAndInitialize();
        } catch (err) {
            await application.stop();
            console.error(err);
            process.exit(1);
        }
    } catch (err) {
        console.log(err);
        console.error(`Unable to start application due: ${err.message}`);
    }
};
