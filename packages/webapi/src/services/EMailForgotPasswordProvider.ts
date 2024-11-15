import { Translator } from "@blendsdk/i18n";
import { IMailer } from "@blendsdk/webafx-mailer";
import { ISysAuthorizationView, ISysProfile, ISysTenant, ISysUser } from "@porta/shared";
import { IPortaApplicationSetting } from "../types";

export interface IEMailForgotPasswordProvider {
    mailer: IMailer;
    settings: IPortaApplicationSetting;
    trans: Translator;
    tenantRecord: ISysTenant;
    authRecord: ISysAuthorizationView;
    user: ISysUser;
    profile: ISysProfile;
    locale: string;
    ttl: number;
    url: string;
}

export class EMailForgotPasswordProvider {

    protected config: IEMailForgotPasswordProvider;

    public constructor(config: IEMailForgotPasswordProvider) {
        this.config = config;
    }

    public async send() {

        const { user, profile, tenantRecord, authRecord, ttl, url } = this.config;

        this.config.trans.setLocale(this.config.locale);

        const to: string = profile.email || user.username;
        const maildata: any = {
            ttl,
            url,
            organization: tenantRecord.organization,
            application: authRecord.application_name,
            length: ttl,
            ...profile
        };
        const subject = this.config.trans.translate("mail_reset_password_subject", maildata);
        const html = this.config.trans.translate("mail_reset_password_body", maildata);
        await this.config.mailer.sendMail({
            to,
            subject,
            from: this.config.settings.MFA_EMAIL_FROM,
            html,
            priority: "high"
        });
    }
}
