import { ensureFolder, globSync } from "@blendsdk/filesystem";
import * as path from "path";
import { executeCommand } from "./exec";
import { logger } from "./logger";

logger.info("Preparing");
const buildFolder = path.join(process.cwd(), "..", `build-${Date.now()}`);
const bundleDist = path.join(process.cwd(), "..", `dist-bundle`);
const packagesDepFolder = path.join(buildFolder, "packages");
ensureFolder(buildFolder);
ensureFolder(packagesDepFolder);
ensureFolder(bundleDist);

const srcPackages = ["shared","webafx-auth","webapi"];
srcPackages.forEach((pkg) => {
    const pkgPath = path.resolve(path.join(process.cwd(), "..", "packages", pkg));
    logger.info(`Creating local package in ${pkgPath}`);
    executeCommand({
        cmd: ["yarn", "pack"],
        cwd: pkgPath
    });
    executeCommand({
        cmd: ["find", ".", "-type", "f", "-name", "*.tgz", "-exec", "mv", "{}", packagesDepFolder, ";"],
        cwd: pkgPath
    });
});

logger.info("Creating NPM Package");
executeCommand({
    cmd: ["npm", "init", "-y"],
    cwd: buildFolder
});

const packages = globSync(path.join(packagesDepFolder, "*.tgz"));
srcPackages.forEach((pkg) => {
    const file = packages.find((file) => {
        return path.basename(file).includes(pkg);
    });
    if (file) {
        logger.info(`Installing ${file}`);
        executeCommand({
            cmd: ["npm", "install", file, "--save"],
            cwd: buildFolder
        });
    }
});

logger.info("Creating distributable bundle");
executeCommand({
    cmd: ["tar", "czf", path.join(bundleDist, "dist.tgz"), "-C", buildFolder, "."],
    cwd: bundleDist
});
