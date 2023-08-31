import { ArgumentsCamelCase, CommandBuilder } from "yargs";
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
export const desc = "Starts BFF";
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
