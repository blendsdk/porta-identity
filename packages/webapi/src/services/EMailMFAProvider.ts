import { Translator } from "@blendsdk/i18n";
import { IMailer } from "@blendsdk/webafx-mailer";
import { IAuthorizationFlow, IPortaApplicationSetting } from "../types";

export interface IEmailMFAProvider {
    mailer: IMailer;
    settings: IPortaApplicationSetting;
    trans: Translator;
    flow: IAuthorizationFlow;
}

export class EmailMFAProvider {

    protected config: IEmailMFAProvider;

    public constructor(config: IEmailMFAProvider) {
        this.config = config;
    }

    public async send() {

        const { profile, user, authRecord, tenantRecord } = this.config.flow;

        const to: string = profile.email || user.username;
        const code = [
            Math.floor(Math.random() * new Date().getSeconds()),
            new Date().getMinutes(),
            new Date().getSeconds()
        ].join("");
        const maildata: any = {
            organization: tenantRecord.organization,
            application: authRecord.application_name,
            code,
            length: code.length,
            ...profile
        };
        const subject = this.config.trans.translate("mfa_email_subject", maildata);
        const html = this.config.trans.translate("mfa_email_body", maildata);
        await this.config.mailer.sendMail({
            to,
            subject,
            from: this.config.settings.MFA_EMAIL_FROM,
            html,
            priority: "high"
        });
        return code;
    }
}
