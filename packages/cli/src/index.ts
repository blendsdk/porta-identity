#!/usr/bin/env node
//
import yargs from "yargs";
import { createLoginCommand } from "./commands/login";

// tslint:disable-next-line: no-unused-expression
yargs
    //
    .scriptName("porta-cli")
    .command(createLoginCommand())
    .demandCommand(1)
    .help().argv;
