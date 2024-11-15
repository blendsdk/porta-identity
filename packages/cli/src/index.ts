import yargs from "yargs";
import { createInitCommand } from "./commands/init";
import { createLoginCommand } from "./commands/login";

// tslint:disable-next-line: no-unused-expression
console.log("Welcome to Porta CLI utility");
yargs
    //
    .scriptName("porta-cli")
    .command(createInitCommand())
    .command(createLoginCommand())
    .demandCommand(1)
    .help().argv;
