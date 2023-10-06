#!/usr/bin/env node
//
import yargs from "yargs";
import * as start from "./modules/commandline/commands/start";

yargs
    //
    .scriptName("porta-crtl")
    .command(start)
    .demandCommand(1)
    .help().argv;
