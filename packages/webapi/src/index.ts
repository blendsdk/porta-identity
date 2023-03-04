#!/usr/bin/env node
import * as path from "path";
import yargs from "yargs";

// tslint:disable-next-line: no-unused-expression
yargs
    .scriptName("porta-crtl")
    .commandDir(path.resolve(path.join(__dirname, "modules", "commandline", "commands")))
    .demandCommand()
    .help().argv;
