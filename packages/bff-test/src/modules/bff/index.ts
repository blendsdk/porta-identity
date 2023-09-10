import { formatString } from "@blendsdk/stdlib";
import { IRouter, IStaticFileAppSettings } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import * as fs from "fs";
import * as path from "path";
import { dashboardPage } from "./page";
import { IPortaHTTPRequestContext, renderGetRedirect } from "@porta/webafx-auth";

let indexFile: string = null;

export const BFFRoutes = (): IRouter => {
    return {
        routes: [
            // this needs to be the last one
            {
                method: "get",
                url: "/login/local",
                public: true,
                handlers: (req: HttpRequest, res: HttpResponse, _next: NextFunction) => {
                    res.send(
                        renderGetRedirect(
                            `${req.context.getServerURL().replace(":443", "")}/oidc/porta/login?state=local`
                        )
                    );
                }
            },
            {
                method: "get",
                url: "/login/remote",
                public: true,
                handlers: (req: HttpRequest, res: HttpResponse, _next: NextFunction) => {
                    res.send(
                        renderGetRedirect(
                            `${req.context.getServerURL().replace(":443", "")}/oidc/porta/login?state=remote`
                        )
                    );
                }
            },
            {
                method: "get",
                url: "*",
                public: false,
                handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse, next: NextFunction) => {
                    // cache the location to avoid resolving
                    if (!indexFile) {
                        const { PUBLIC_FOLDER } = req.context.getSettings<IStaticFileAppSettings>();
                        indexFile = fs.readFileSync(path.resolve(PUBLIC_FOLDER, "index.template.html")).toString();
                    }
                    if (req.url === "/" || req.url.startsWith("/fe")) {
                        res.send(formatString(indexFile, { page: dashboardPage({ user: req.context.getUser() }) }));
                    } else {
                        next();
                    }
                }
            }
        ]
    };
};
