#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const glob = require("glob");
const root = process.cwd();

const packages = glob.sync(path.join(root, "packages", "**", "package.json")).filter(p => { return p.indexOf("node_modules") === -1; });
const install = [`rm ${path.join(root, "yarn.lock")}`, ""];
const channel = process.argv[2];

if (["next", "develop", "stable"].indexOf(channel) !== -1) {
    packages.forEach((file) => {
        const package = JSON.parse(fs.readFileSync(file).toString());
        const deps = [];
        const pkgs = package.dependencies;
        if (pkgs) {
            Object.entries(pkgs).forEach(([pkg, version]) => {
                if (pkg.indexOf("@blendsdk") === 0) {
                    deps.push(`${pkg}@${channel}`);
                }
            });
            if (deps.length !== 0) {
                install.push(`cd ${path.dirname(file)}`);
                install.push(`yarn add --exact ${deps.join(" \\\n")}`);
                install.push("\n");
            }
        }
    });

    console.log(install.join("\n"));
    process.exit(0);
} else {
    console.error(`Missing BlendSDK installation channel. Use next | develop | latest`);
    process.exit(-1);
}