import { formatString } from "@blendsdk/stdlib";
import { IRouter, IStaticFileAppSettings } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import * as fs from "fs";
import * as path from "path";
import { dashboardPage } from "./page";
import { BaseClient, Issuer, custom } from "openid-client";

custom.setHttpOptionsDefaults({
    timeout: 10000
});

let portaIssuer: Issuer<BaseClient> = undefined;

let indexFile: string = null;

export const BFFRoutes = (): IRouter => {
    return {
        routes: [
            // this needs to be the last one
            {
                method: "get",
                url: "*",
                public: true,
                handlers: (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                    // cache the location to avoid resolving
                    if (!indexFile) {
                        const { PUBLIC_FOLDER } = req.context.getSettings<IStaticFileAppSettings>();
                        indexFile = fs.readFileSync(path.resolve(PUBLIC_FOLDER, "index.template.html")).toString();
                    }
                    if (req.url === "/" || req.url.startsWith("/fe")) {
                        res.send(formatString(indexFile, { page: dashboardPage() }));
                    } else {
                        next();
                    }
                }
            },
            {
                method: "get",
                url: "/login",
                public: true,
                handlers: (_req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                    const worker = new Promise<string>(async (resolve, reject) => {
                        try {
                            if (!portaIssuer) {
                                portaIssuer = await Issuer.discover("https://porta.local/porta/oauth2");
                                console.log("Discovered issuer %s %O", portaIssuer.issuer, portaIssuer.metadata);
                            }
                            const client = new portaIssuer.Client({
                                client_id: "porta1",
                                client_secret: "secret1",
                                redirect_uris: ["https://bff.local/callback"],
                                response_types: ["code"]
                            });
                            resolve(
                                client.authorizationUrl({
                                    scope: "openid email profile"
                                })
                            );
                        } catch (err: any) {
                            reject(err);
                        }
                    });

                    worker
                        .then((url) => {
                            res.redirect(url);
                        })
                        .catch(next);
                }
            }
        ]
    };
};
