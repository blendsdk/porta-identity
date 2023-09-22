import { IRouter, IStaticFileAppSettings } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { renderGetRedirect } from "../auth/utils";
import { eJsonSchemaType } from "@blendsdk/jsonschema";

let indexFile: string = null;
let versionInfo = null;

export const SPARoutes = (): IRouter => {
    return {
        routes: [
            {
                method: "get",
                public: true,
                url: "/:tenant/manage",
                request: {
                    properties: {
                        tenant: {
                            type: eJsonSchemaType.string
                        }
                    }
                },
                handlers: (req: HttpRequest, res: HttpResponse) => {
                    const { tenant } = req.context.getParameters<any>();
                    res.send(renderGetRedirect(`${req.context.getServerURL()}/oidc/${tenant}/signin`));
                }
            },
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
                handlers: (req: HttpRequest, res: HttpResponse, _next: NextFunction) => {
                    // cache the location to avoid resolving
                    if (!indexFile) {
                        const { PUBLIC_FOLDER } = req.context.getSettings<IStaticFileAppSettings>();
                        indexFile = fs.readFileSync(path.resolve(PUBLIC_FOLDER, "index.template.html")).toString();
                    }
                    if (req.url === "/" || req.url.startsWith("/fe")) {
                        res.send(indexFile);
                    } else {
                        res.redirect("/fe/not-found");
                    }
                }
            }
        ]
    };
};
