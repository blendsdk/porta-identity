import { errorObjectInfo } from "@blendsdk/stdlib";
import { IRouter } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse } from "@blendsdk/webafx-common";
import { databaseUtils } from "../../services";
import { IPortaApplicationSetting } from "../../types";

export const RedirectRoutes = (): IRouter => {
    return {
        routes: [
            {
                method: "get",
                public: true,
                url: "/oauth2/.well-known/openid-configuration",
                handlers: (req: HttpRequest, res: HttpResponse) => {
                    const worker = () => {
                        return new Promise<string>(async (resolve, reject) => {
                            try {
                                const { PORTA_REGISTRY_TENANT } = req.context.getSettings<IPortaApplicationSetting>();
                                const tenantRecord = await databaseUtils.findTenant(PORTA_REGISTRY_TENANT);
                                resolve(`${req.context.getServerURL()}/${tenantRecord.id}/oauth2/.well-known/openid-configuration`);
                            } catch (err) {
                                reject(err);
                            }
                        });
                    };
                    worker().then((url) => {
                        res.redirect(url);
                    }).catch(err => {
                        res.status(500).json(errorObjectInfo(err));
                    });
                }
            }
        ]
    };
};
