import * as path from "path";

const rootFolder = path.resolve(path.join(__dirname, "..", ".."));
const resourceFolder = path.resolve(path.join(rootFolder, "resources"));

export interface IApplicationResource {
    rootFolder: string;
    resourceFolder: string;
}

export const ApplicationResources: IApplicationResource = {
    rootFolder,
    resourceFolder
};
