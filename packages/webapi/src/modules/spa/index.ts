import { eJsonSchemaType, eParameterLocation } from "@blendsdk/jsonschema";
import { base64Encode } from "@blendsdk/stdlib";
import { IRouter, IStaticFileAppSettings } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { renderGetRedirect } from "../auth/utils";

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
                        },
                        locale: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.query
                        }
                    }
                },
                handlers: (req: HttpRequest, res: HttpResponse) => {
                    const { tenant, locale } = req.context.getParameters<any>();
                    const url = new URL(`${req.context.getServerURL()}/oidc/${tenant}/signin`);
                    url.searchParams.append(
                        "state",
                        base64Encode(JSON.stringify({ location: `${req.context.getServerURL()}/fe/` }))
                    );
                    if (locale) {
                        url.searchParams.append("locale", locale);
                    }
                    //res.cookie("_manage", tenant);
                    res.send(renderGetRedirect(url.toString()));
                }
            },
            {
                method: "get",
                public: false,
                url: "/:tenant/me",
                request: {
                    properties: {
                        tenant: {
                            type: eJsonSchemaType.string
                        },
                        locale: {
                            type: eJsonSchemaType.string,
                            location: eParameterLocation.query
                        }
                    }
                },
                handlers: (req: HttpRequest, res: HttpResponse) => {
                    const { tenant, locale } = req.context.getParameters<any>();
                    const url = new URL(`${req.context.getServerURL()}/oidc/${tenant}/signin`);
                    url.searchParams.append(
                        "state",
                        base64Encode(JSON.stringify({ location: `${req.context.getServerURL()}/fe/auth/${tenant}/me` }))
                    );
                    if (locale) {
                        url.searchParams.append("locale", locale);
                    }
                    res.send(renderGetRedirect(url.toString()));
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
                        indexFile = fs.readFileSync(path.resolve(PUBLIC_FOLDER, "index.html")).toString();
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
