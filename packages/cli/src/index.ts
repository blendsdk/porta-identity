import yargs from "yargs";
import { createInitCommand } from "./commands/init";
import { createLoginCommand } from "./commands/login";
import { createTenantCreateCommand, createTenantDeleteCommand } from "./commands/tenant";

// tslint:disable-next-line: no-unused-expression
console.log("Welcome to Porta CLI utility");
yargs
    //
    .scriptName("porta-cli")
    .command(createInitCommand())
    .command(createLoginCommand())
    .command(createTenantCreateCommand())
    .command(createTenantDeleteCommand())
    .demandCommand(1)
    .help().argv;
