import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { asyncForEach } from "@blendsdk/stdlib";
import { ISysClient, ISysUser } from "@porta/shared";
import { ArgumentsCamelCase, CommandBuilder } from "yargs";
import { SysUserDataService } from "../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../dataservices/SysUserProfileDataService";
import { eClientType, IPortaApplicationSetting } from "../../../types";
import { databaseUtils } from "../../../utils";
import { application } from "../../application";
import path from "path";
import fs from "fs";

/**
 * Interface describing the commandline args
 *
 * @interface ICommandLineArgs
 */
interface ICommandLineArgs {
    /**
     * Config files
     *
     * @type {string[]}
     * @memberof ICommandLineArgs
     */
    config: string[];
    /**
     * When set the OIDC conformance test will be created and this will be set as the redirect uri
     *
     * @type {string}
     * @memberof ICommandLineArgs
     */
    oidcRedirectUri?: string;
}

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
    },
    r: {
        alias: "oidcRedirectUri",
        required: false,
        type: "string",
        description:
            "The redirect uri configured in OIDC conformance suite. This option initializes data for the OIDC conformance suite"
    }
};

async function createOIDCConformanceSuite(redirect_uri: string) {
    const tenantName = "oidc_suite";
    await databaseUtils.deleteTenant(tenantName);
    await databaseUtils.initializeTenant(
        tenantName,
        tenantName,
        "OIDC conformance suite",
        true,
        true,
        "oidc@example.com",
        "secret"
    );
    const tenantRecord = await databaseUtils.initializeTenantDataSource(tenantName);
    const ds = dataSourceManager.getDataSource<PostgreSQLDataSource>(tenantRecord.id);
    const sharedContext = ds.createSharedContext();
    const users = ["user1@example.com", "user2@example.com", "app1@example.com"];
    const userDs = new SysUserDataService({ sharedContext });
    const userProfileDs = new SysUserProfileDataService({ sharedContext });

    let serviceUser: ISysUser;
    const usersList: ISysUser[] = [];
    const clients: ISysClient[] = [];

    await asyncForEach(users, async (username, index) => {
        const user = await userDs.insertIntoSysUser({
            username,
            password: "secret",
            is_active: true
        });
        await userProfileDs.insertIntoSysUserProfile({
            firstname: `User ${username}`,
            lastname: `Example ${index}`,
            user_id: user.id,
            email: username
        });
        usersList.push({ ...user, password: "secret" });
        serviceUser = user; // will end up the last one
    });

    clients.push(
        await databaseUtils.createClient(
            {
                application_name: "oidc client credentials",
                client_id: "service-client",
                secret: "hYrN6jbdLq6WtfxjhVxmdF3vVdOgNK9p",
                client_type: eClientType.confidential,
                redirect_uri,
                client_credentials_user_id: serviceUser.id,
                post_logout_redirect_uri: [redirect_uri.replace("/callback", ""), "post_logout_redirect"].join("/")
            },
            tenantRecord
        )
    );

    clients.push(
        await databaseUtils.createClient(
            {
                application_name: "oidc client 1",
                client_id: "client1",
                secret: "hYrN6jbdLq6WtfxjhVxmdF3vVdOgNK9p",
                client_type: eClientType.confidential,
                redirect_uri,
                post_logout_redirect_uri: [redirect_uri.replace("/callback", ""), "post_logout_redirect"].join("/")
            },
            tenantRecord
        )
    );

    clients.push(
        await databaseUtils.createClient(
            {
                application_name: "oidc client 2",
                client_id: "client2",
                secret: "hYrN6jbdLq6WtfxjhVxmdF3vVdOgNK9p",
                client_type: eClientType.confidential,
                redirect_uri,
                post_logout_redirect_uri: [redirect_uri.replace("/callback", ""), "post_logout_redirect"].join("/")
            },
            tenantRecord
        )
    );
    const fName = path.resolve(process.cwd(), "oidc-conformance-accounts.json");
    fs.writeFileSync(
        fName,
        JSON.stringify(
            {
                clients,
                users: usersList
            },
            null,
            4
        )
    );
}

export const handler = async (argv: ArgumentsCamelCase<ICommandLineArgs>) => {
    try {
        application.loadFileConfig(argv.config);

        // Sets the porta registry tenant from the config parameter to be read from
        // CommonUtils
        const { PORTA_REGISTRY_TENANT } = application.getSettings<IPortaApplicationSetting>();
        process.env.PORTA_REGISTRY_TENANT = PORTA_REGISTRY_TENANT || "registry";

        try {
            await application.run();
            if (argv.oidcRedirectUri) {
                application.getLogger("Initializing data for OIDC conformance suite");
                await createOIDCConformanceSuite(argv.oidcRedirectUri);
            }
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
