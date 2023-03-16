import { createAndSetSigningKeyCookie, IRouter, IStaticFileAppSettings } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let indexFile: string = null;
let versionInfo = null;

export const SPARoutes = (): IRouter => {
    return {
        routes: [
            {
                method: "get",
                url: "/api/version",
                public: true,
                handlers: (_req: HttpRequest, res: HttpResponse) => {
                    // cache the location to avoid resolving
                    if (!versionInfo) {
                        versionInfo = JSON.parse(
                            fs.readFileSync(path.resolve(process.cwd(), "package.json")).toString()
                        );
                    }

                    setTimeout(() => {
                        res.status(200).json({
                            success: true,
                            data: (versionInfo || {}).dependencies,
                            slot: process.env.SLOT,
                            host: os.hostname()
                        });
                    }, 2000);
                }
            },
            // this needs to be the last one
            {
                method: "get",
                url: "*",
                public: true,
                signed: false,
                handlers: (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                    // cache the location to avoid resolving
                    if (!indexFile) {
                        const { PUBLIC_FOLDER } = req.context.getSettings<IStaticFileAppSettings>();
                        indexFile = fs.readFileSync(path.resolve(PUBLIC_FOLDER, "index.html")).toString();
                    }
                    if (req.url === "/" || req.url.startsWith("/fe")) {
                        res.send(indexFile.replace("_csr_", createAndSetSigningKeyCookie(req, res)));
                    } else {
                        next();
                    }
                }
            }
        ]
    };
};
