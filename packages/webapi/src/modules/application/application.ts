import { Application } from "@blendsdk/webafx";
import { RedisCacheModule } from "@blendsdk/webafx-cache-redis";
import { I18NModuleFactory } from "@blendsdk/webafx-i18n";
import { MailerModule } from "@blendsdk/webafx-mailer";
import * as path from "path";
import { ApplicationModule } from "../api/application";
import { AuthorizationModule } from "../api/authorization";
import { PortaSelfAuthSessionProviderModule } from "../auth/selfauth/session";
import { PortaSelfAuthTokenAuthenticationModule } from "../auth/selfauth/token";
import { SPARoutes } from "../spa";
import { DatabaseModule } from "./database";
import { ValidationSchema } from "./validations";

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
        return new RedisCacheModule({ ...config, id: config.PORTA_SSO_COMMON_NAME });
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
        return new PortaSelfAuthSessionProviderModule({ ...config });
    },
    (config) => {
        return new PortaSelfAuthTokenAuthenticationModule({ ...config });
    },
    (config) => {
        return new MailerModule(config);
    }
]);

export { application };
