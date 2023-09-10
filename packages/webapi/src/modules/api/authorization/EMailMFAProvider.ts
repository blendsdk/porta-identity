import { Translator } from "@blendsdk/i18n";
import { IMailer } from "@blendsdk/webafx-mailer";
import { IAuthenticationFlowState, ISysAuthorizationView, ISysTenant, ISysUser, ISysUserProfile } from "@porta/shared";

interface IMfaEmailSettings {
    MFA_EMAIL_FROM: string;
}

export interface IEmailMFAProvider {
    mailer: IMailer;
    settings: IMfaEmailSettings;
    trans: Translator;
    flowState: IAuthenticationFlowState;
    tenantRecord: ISysTenant;
    authRecord: ISysAuthorizationView;
    userRecord: ISysUser;
    profileRecord: ISysUserProfile;
}

export class EmailMFAProvider {
    protected config: IEmailMFAProvider;

    public constructor(config: IEmailMFAProvider) {
        this.config = config;
    }

    public send() {
        const to: string = this.config.profileRecord.email || this.config.userRecord.username;
        const code = [
            Math.floor(Math.random() * new Date().getSeconds()),
            new Date().getMinutes(),
            new Date().getSeconds()
        ].join("");
        const maildata: any = {
            organization: this.config.tenantRecord.organization,
            application: this.config.authRecord.application_name,
            code,
            length: code.length,
            ...this.config.profileRecord
        };
        const subject = this.config.trans.translate("mfa_email_subject", maildata);
        const html = this.config.trans.translate("mfa_email_body", maildata);
        this.config.mailer.sendMail({
            to,
            subject,
            from: this.config.settings.MFA_EMAIL_FROM,
            html,
            priority: "high"
        });
        return code;
    }
}
