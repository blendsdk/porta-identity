import { lineLogger } from "@blendsdk/filesystem";
import { confirm, input, password } from "@inquirer/prompts";
import { CommandModule } from "yargs";
import { PortaApi } from "../../api/generated_rest_api";
import { checkGetToken } from "../common";

export function createTenantCommand(): CommandModule {
    return {
        command: "tenant",
        describe: "Creates a new tenant",
        handler: async () => {
            const token = checkGetToken();
            const answers = {
                name: await input({
                    message: "Please provide a tenant name (no spaces)",
                    validate: (value) => {
                        return !value || value.includes(" ") ? "Name must not have spaces or be empty" : true;
                    }
                }),
                email: await input({
                    message: "Please provide an admin email",
                    validate: (value) => {
                        return value ? true : "Admin email is required!";
                    }
                }),
                password: await password({
                    mask: "*",
                    message: "Please provide an admin password",
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

                organization: await input({
                    message: "Please provide an organization name",
                    validate: (value) => {
                        return value ? true : "Organization name is required!";
                    }
                }),
                allow_reset_password: await confirm({ message: "Allow reset password?", default: true }),
                allow_registration: await confirm({ message: "Allow register new users?", default: false }),
                ok: await confirm({
                    message: `Tenant will be created on [${token.host}] using registry [${token.tenant}]`,
                    default: false
                })
            };

            if (answers.password !== answers.confirm) {
                lineLogger.error("Passwords to not match!");
                process.exit(1);
            }

            if (answers.ok) {
                PortaApi.setBaseUrl(token.host);
                PortaApi.onRequest((req) => {
                    req.headers["Authorization"] = `Bearer ${token.token}`;
                });
                try {
                    const result = await PortaApi.openIdTenant.createOpenIdTenant({
                        name: answers.name,
                        allow_registration: answers.allow_registration,
                        allow_reset_password: answers.allow_reset_password,
                        email: answers.email,
                        organization: answers.organization,
                        password: answers.password,
                        tenant: token.tenant
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
