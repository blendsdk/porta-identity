import { Translator } from "@blendsdk/i18n";
import { IMailer } from "@blendsdk/webafx-mailer";
import { ISysProfile, ISysUser } from "@porta/shared";
import { IAuthorizationFlow, IPortaApplicationSetting } from "../types";

/**
 * @export
 * @interface IAuthEmailProvider
 */
export interface IAuthEmailProvider {
    /**
     * @type {IMailer}
     * @memberof IAuthEmailProvider
     */
    mailer: IMailer;
    /**
     * @type {IPortaApplicationSetting}
     * @memberof IAuthEmailProvider
     */
    settings: IPortaApplicationSetting;
    /**
     * @type {Translator}
     * @memberof IAuthEmailProvider
     */
    trans: Translator;
    /**
     * @type {IAuthorizationFlow}
     * @memberof IAuthEmailProvider
     */
    flow: IAuthorizationFlow;
}

/**
 * @export
 * @class AuthEmailProvider
 */
export class AuthEmailProvider {
    /**
     * @protected
     * @type {IAuthEmailProvider}
     * @memberof AuthEmailProvider
     */
    protected config: IAuthEmailProvider;

    /**
     * Creates an instance of AuthEmailProvider.
     * @param {IAuthEmailProvider} config
     * @memberof AuthEmailProvider
     */
    public constructor(config: IAuthEmailProvider) {
        this.config = config;
    }

    /**
     * @param {ISysUser} user
     * @param {ISysProfile} profile
     * @param {number} ttl
     * @param {string} url
     * @memberof AuthEmailProvider
     */
    public async sendPasswordInstructionsEmail(user: ISysUser, profile: ISysProfile, ttl: number, url: string) {
        const { authRecord, tenantRecord } = this.config.flow;

        const to: string = profile.email || user.username;
        const maildata: any = {
            organization: tenantRecord.organization,
            application: authRecord.application_name,
            ...profile,
            ttl,
            url
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

    public async sendPasswordChangedEmail(user: ISysUser, profile: ISysProfile) {
        const { authRecord, tenantRecord } = this.config.flow;

        const to: string = profile.email || user.username;
        const maildata: any = {
            organization: tenantRecord.organization,
            application: authRecord.application_name,
            ...profile
        };

        const subject = this.config.trans.translate("mail_password_changed_subject", maildata);
        const html = this.config.trans.translate("mail_password_changed_body", maildata);
        await this.config.mailer.sendMail({
            to,
            subject,
            from: this.config.settings.MFA_EMAIL_FROM,
            html,
            priority: "high"
        });
    }

    /**
     * @return {*}
     * @memberof AuthEmailProvider
     */
    public async sendMFAEmail() {
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
