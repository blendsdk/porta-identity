import { RedisCache } from "@blendsdk/webafx-cache/dist/cache";
import { CommandBuilder } from "yargs";
import { IPortaApplicationSetting, PORTA_REGISTRY } from "../../../types";
import { commonUtils, databaseUtils } from "../../../utils";
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

/**
 * Check and initialize the registry database
 *
 * @export
 * @returns
 */
export function checkAndInitialize() {
    return new Promise<void>(async (resolve, reject) => {
        try {
            const { PORTA_ADMIN, PORTA_PASSWORD } = application.getSettings<IPortaApplicationSetting>();
            await databaseUtils.initializeTenant(
                PORTA_REGISTRY,
                PORTA_REGISTRY,
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

export const handler = async (argv: any) => {
    try {
        application.loadFileConfig(argv.config);
        try {
            await application.run();
            if (await isInitSequence()) {
                await checkAndInitialize();
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
