import { ArgumentsCamelCase, CommandBuilder } from "yargs";
import { IPortaApplicationSetting } from "../../../types";
import { application } from "../../application";

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
    }
};

export const handler = async (argv: ArgumentsCamelCase<ICommandLineArgs>) => {
    try {
        application.loadFileConfig(argv.config);

        // Sets the porta registry tenant from the config parameter to be read from
        // CommonUtils
        const { PORTA_REGISTRY_TENANT } = application.getSettings<IPortaApplicationSetting>();
        process.env.PORTA_REGISTRY_TENANT = PORTA_REGISTRY_TENANT || "registry";

        try {
            await application.run();
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
