import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { asyncForEach } from "@blendsdk/stdlib";
import { RedisCache } from "@blendsdk/webafx-cache/dist/cache";
import { ISysClient, ISysUser } from "@porta/shared";
import { CommandBuilder } from "yargs";
import { SysUserDataService } from "../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../dataservices/SysUserProfileDataService";
import { eClientType, IPortaApplicationSetting, PORTA_REGISTRY } from "../../../types";
import { commonUtils, databaseUtils } from "../../../utils";
import { application } from "../../application";
import * as fs from "fs";
import * as path from "path";
import { IDatabaseAppSettings } from "@blendsdk/webafx";

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

/**
 * Check and initialize the registry database
 *
 * @export
 * @returns
 */
export function checkAndInitialize() {
    return new Promise<void>(async (resolve, reject) => {
        try {
            const { PORTA_ADMIN, PORTA_PASSWORD, DB_DATABASE } = application.getSettings<
                IPortaApplicationSetting & IDatabaseAppSettings
            >();
            await databaseUtils.initializeTenant(
                PORTA_REGISTRY,
                DB_DATABASE,
                "Porta Registry",
                false,
                true,
                PORTA_ADMIN,
                PORTA_PASSWORD
            );
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Check if this is a promoted "container" instance
 *
 * @returns
 */
function isInitSequence() {
    /**
     * Wait method
     */
    const wait = (ms?: number) => {
        const getRandomInt = (min: number, max: number) => {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };

        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, ms || getRandomInt(1000, 2000));
        });
    };

    return new Promise<boolean>(async (resolve, reject) => {
        try {
            // Get the redis credentials
            const { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } = application.getSettings<any>();

            // Connect to redis
            const cache = new RedisCache({
                host: REDIS_HOST,
                password: REDIS_PASSWORD,
                port: REDIS_PORT,
                uniqueId: "startup"
            });
            await cache.connect();

            // Create an ID and write/overwrite it to redis cache immediately
            const id = commonUtils.getUUID();
            await cache.setValue("rank", id);

            let count = 0;
            let last = false;
            const counts = process.env.BYPASS ? 2 : 10; //

            // Start waiting and counting for `counts` random seconds
            // to make the last "container" instance to surface!
            while (count !== counts) {
                await wait();
                last = id === (await cache.getValue("rank"));
                count += 1;
            }

            // return if this is the last container
            resolve(last);
        } catch (err) {
            reject(err);
        }
    });
}

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
                secret: "secret",
                client_type: eClientType.confidential,
                redirect_uri,
                client_credentials_user_id: serviceUser.id
            },
            tenantRecord
        )
    );

    clients.push(
        await databaseUtils.createClient(
            {
                application_name: "oidc client 1",
                client_id: "client1",
                secret: "secret",
                client_type: eClientType.confidential,
                redirect_uri
            },
            tenantRecord
        )
    );

    clients.push(
        await databaseUtils.createClient(
            {
                application_name: "oidc client 2",
                client_id: "client2",
                secret: "secret",
                client_type: eClientType.confidential,
                redirect_uri
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

export const handler = async (argv: ICommandLineArgs) => {
    try {
        application.loadFileConfig(argv.config);
        try {
            await application.run();
            if (await isInitSequence()) {
                await checkAndInitialize();
                if (argv.oidcRedirectUri) {
                    application.getLogger("Initializing data for OIDC conformance suite");
                    await createOIDCConformanceSuite(argv.oidcRedirectUri);
                }
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
