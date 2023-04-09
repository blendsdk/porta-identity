#!/usr/bin/env node
//
import yargs from "yargs";
import * as start from "./modules/commandline/commands/start";

// tslint:disable-next-line: no-unused-expression
yargs
    //
    .scriptName("porta-crtl")
    .command(start)
    .demandCommand()
    .help().argv;
