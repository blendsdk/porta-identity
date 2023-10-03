import { IDictionaryOf } from "@blendsdk/stdlib";
import { confirm, input } from "@inquirer/prompts";
import { CommandModule } from "yargs";

export function createTenantCommand(): CommandModule {
    return {
        command: "tenant",
        describe: "Creates a new tenant",
        builder: {
            h: {
                alias: "host",
                requiresArg: true,
                type: "string",
                default: "https://dev.portaidentity.com"
            },
            t: {
                alias: "registry",
                requiresArg: true,
                type: "string",
                default: "registry"
            }
        },
        handler: async ({ host, registry }) => {
            // const token = checkGetToken();
            const answers: IDictionaryOf<any> = {
                name: await input({
                    message: "Please provide a name (no spaces)",
                    validate: (value) => {
                        return !value || value.includes(" ") ? "Name must not have spaces or be empty" : true;
                    }
                }),
                organization: await input({
                    message: "Please provide an organization name",
                    validate: (value) => {
                        return value ? true : "Organization name is required!";
                    }
                }),
                allow_reset_password: await confirm({ message: "Allow reset password?", default: true }),
                ok: await confirm({
                    message: `Tenant will be created on [${host}] using registry [${registry}]`,
                    default: false
                })
            };
            if (answers.ok) {
            }
        }
    };
}
