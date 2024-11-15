import { lineLogger } from "@blendsdk/filesystem";
import password from "@inquirer/password";
import { confirm, input } from "@inquirer/prompts";
import { CommandModule } from "yargs";
import { PortaApi } from "../../api/generated_rest_api";

export function createInitCommand(): CommandModule {
    return {
        command: "init",
        describe: "Initializes porta for the first time",
        builder: {
            h: {
                alias: "host",
                required: true,
                type: "string"
            }
        },
        handler: async ({ host }) => {
            const answers = {
                key: await password({
                    mask: "#",
                    message: "Please paste the API key",
                    validate: (value) => {
                        return value ? true : "An API key is required!";
                    }
                }),
                email: await input({
                    message: "Please enter an email",
                    validate: (value) => {
                        return value ? true : "Email is required!";
                    }
                }),
                password: await password({
                    mask: "*",
                    message: "Please provide a password",
                    validate: (value: string) => {
                        return value ? true : "Password is required";
                    }
                }),
                confirm: await password({
                    mask: "*",
                    message: "Please confirm your password",
                    validate: (value: string) => {
                        return value ? true : "Password is required";
                    }
                }),

                ok: await confirm({
                    message: `Finalize?`,
                    default: false
                })
            };

            if (answers.password !== answers.confirm) {
                lineLogger.error("Passwords to not match!");
                process.exit(1);
            }

            if (answers.ok) {
                try {
                    PortaApi.setBaseUrl(host as string);
                    PortaApi.onRequest((req) => {
                        req.headers["Authorization"] = `Bearer ${answers.key}`;
                    });
                    const result = await PortaApi.initialize.initialize({
                        email: answers.email,
                        password: answers.password
                    });
                    console.log(JSON.stringify(result, null, 4));
                } catch (err) {
                    lineLogger.error(err.message);
                    console.log(err);
                }
            }
        }
    };
}
