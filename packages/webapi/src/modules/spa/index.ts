import { IRouter, IStaticFileAppSettings, UNAUTHORIZED_PRIVATE_ENDPOINT_HANDLER } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let indexFile: string = null;
let versionInfo = null;

export const SPARoutes = (): IRouter => {
    return {
        requestHandlers: {
            [UNAUTHORIZED_PRIVATE_ENDPOINT_HANDLER]: (req: HttpRequest, _res: HttpResponse, next: NextFunction) => {
                const { tags = [] } = req.context.getRoute();
                if (tags.length !== 0) {
                    req.context.getLogger().info("Tags", { tags });
                }
                next();
            }
        },
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
                handlers: [
                    (req: HttpRequest, res: HttpResponse, _next: NextFunction) => {
                        // cache the location to avoid resolving
                        if (!indexFile) {
                            const { PUBLIC_FOLDER } = req.context.getSettings<IStaticFileAppSettings>();
                            indexFile = fs.readFileSync(path.resolve(PUBLIC_FOLDER, "index.html")).toString();
                        }
                        if (req.url === "/" || req.url.startsWith("/fe")) {
                            res.send(indexFile);
                        } else {
                            res.redirect("/fe/not-found");
                        }
                    }
                ]
            }
        ]
    };
};
