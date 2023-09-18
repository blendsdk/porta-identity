import { Application } from "@blendsdk/webafx";
import { CacheModule } from "@blendsdk/webafx-cache";
import { I18NModuleFactory } from "@blendsdk/webafx-i18n";
import * as path from "path";
import { AuthorizationModule } from "../api/authorization";
import { SPARoutes } from "../spa";
import { DatabaseModule } from "./database";
import { ValidationSchema } from "./validations";
import { MailerModule } from "@blendsdk/webafx-mailer";
import { ApplicationModule } from "../api/application";
import { PortaSelfAuthenticationModule } from "../auth/selfauth";

/**
 * Configuration setting for testing
 */
const getTestConfig = () => {
    const cfg = require(path.join(process.cwd(), "config", "app.config.js"));
    cfg.PORT = 4010;
    cfg.PORTA_SIGNIN_URI = "http://localhost:4020/fe/auth/signin";
    return cfg;
};

/**
 * Instance of the WebApi application configured with
 * modules.
 */
const application = new Application({
    settings: process.env.TEST ? getTestConfig() : {},
    router: [
        //
        ValidationSchema(),
        AuthorizationModule(),
        ApplicationModule(),
        // LocalAuthRoutes(),
        SPARoutes()
    ]
}).addModule([
    //
    (config) => {
        return new CacheModule({ ...config, id: config.PORTA_SSO_COMMON_NAME });
    },
    I18NModuleFactory({
        translationDatabase: [
            path.join(process.cwd(), "resources", "i18n", "*.json"),
            path.join(process.cwd(), "resources", "i18n", "*.html")
        ]
    }),
    (config) => {
        return new DatabaseModule({ ...config });
    },
    (config) => {
        return new PortaSelfAuthenticationModule({ ...config });
    },
    (config) => {
        return new MailerModule(config);
    }
]);

export { application };
