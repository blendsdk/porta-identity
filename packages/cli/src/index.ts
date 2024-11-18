import yargs from "yargs";
import { createInitCommand } from "./commands/init";
import { createLoginCommand } from "./commands/login";
import {
    createDevTestAccountCommand,
    createDevTestApplicationCommand,
    createTenantCreateCommand,
    createTenantDeleteCommand
} from "./commands/tenant";

// tslint:disable-next-line: no-unused-expression
console.log("Welcome to Porta CLI utility");
yargs
    //
    .scriptName("porta-cli")
    .command(createInitCommand())
    .command(createLoginCommand())
    .command(createTenantCreateCommand())
    .command(createTenantDeleteCommand())
    .command(createDevTestApplicationCommand())
    .command(createDevTestAccountCommand())
    .demandCommand(1)
    .help().argv;
