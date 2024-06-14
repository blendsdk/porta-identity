import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { MD5, asyncForEach, isNullOrUndef } from "@blendsdk/stdlib";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import { Crypto } from "@peculiar/webcrypto";
import * as x509 from "@peculiar/x509";
import { ISysApplication, ISysClient, ISysRole, ISysSecret, ISysTenant } from "@porta/shared";
import fs from "fs";
import path from "path";
import util from "util";
import { SysApplicationDataService } from "../dataservices/SysApplicationDataService";
import { SysClientDataService } from "../dataservices/SysClientDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysMfaDataService } from "../dataservices/SysMfaDataService";
import { SysProfileDataService } from "../dataservices/SysProfileDataService";
import { SysRoleDataService } from "../dataservices/SysRoleDataService";
import { SysSecretDataService } from "../dataservices/SysSecretDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { SysUserDataService } from "../dataservices/SysUserDataService";
import { SysUserRoleDataService } from "../dataservices/SysUserRoleDataService";
import { application } from "../modules/application/application";
import { CONST_DAY_IN_SECONDS, IPortaApplicationSetting, eClientType, eDatabaseType } from "../types";
import { commonUtils } from "./CommonUtils";

const crypto = new Crypto();
x509.cryptoProvider.set(crypto);

/**
 * @export
 * @interface IInitializeTenant
 */
export interface IInitializeTenant {
    tenantName: string;
    databaseName: string;
    organization: string;
    allow_registration: boolean;
    allow_reset_password: boolean;
    username: string;
    password: string;
    email: string;
    serverURL: string;
}

/**
 * @class DatabaseSeed
 */
export class DatabaseSeed {

    /**
     * @protected
     * @param {string} databaseName
     * @return {*} 
     * @memberof DatabaseSeed
     */
    protected async isSystemInitialized(databaseName: string) {
        const ctx = await dataSourceManager.getDataSource<PostgreSQLDataSource>(eDatabaseType.system).createContext();
        const { data } = await ctx.executeQuery(
            "select * from pg_catalog.pg_database where datname=:datname",
            {
                datname: databaseName
            },
            { single: true }
        );
        return !isNullOrUndef(data);
    }


    /**
     * Generates a public and private key plus certificate to be used
     * as JWK keys
     *
     * @protected
     * @param {string} name
     * @return {*} 
     * @memberof DatabaseSeed
     */
    protected async generateKeyPareAndCertificate(name: string) {
        const alg = {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" },
            publicExponent: new Uint8Array([1, 0, 1]),
            modulusLength: 2048
        };
        const endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 50);
        const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

        const cert = await x509.X509CertificateGenerator.createSelfSigned({
            serialNumber: Date.now().toString(),
            name: `CN=${name}`,
            notBefore: new Date(),
            notAfter: endDate,
            signingAlgorithm: alg,
            keys,
            extensions: [
                new x509.BasicConstraintsExtension(true, 2, true),
                new x509.ExtendedKeyUsageExtension(["1.2.3.4.5.6.7", "2.3.4.5.6.7.8"], true),
                new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
                await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
            ]
        });

        const private_key = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");

        return {
            publicKey:
                "-----BEGIN PUBLIC KEY-----\n" + cert.publicKey.toString("base64") + "\n-----END PUBLIC KEY-----",
            privateKey: "-----BEGIN PRIVATE KEY-----\n" + private_key + "\n-----END PRIVATE KEY-----",
            certificate: "-----BEGIN CERTIFICATE-----\n" + cert.toString("base64") + "\n-----END CERTIFICATE-----"
        };
    }

    /**
     * Initializes the database schema
     *
     * @protected
     * @param {{ tenant: ISysTenant; isRegistry?: boolean }} { isRegistry, tenant }
     * @returns
     * @memberof DatabaseSeed
     */
    protected async initializeDatabaseSchema({ isRegistry, tenant }: { tenant: ISysTenant; isRegistry?: boolean; }) {
        const defaultDataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(eDatabaseType.system);
        const { DB_USER, DB_HOST, DB_PORT, DB_PASSWORD } = application.getSettings<
            IPortaApplicationSetting & IDatabaseAppSettings
        >();

        // if this is not the registry database then create a tenant record
        // in the registry database
        if (!isRegistry) {
            const tenantDs = new SysTenantDataService({ tenantId: eDatabaseType.registry });
            tenant = await tenantDs.insertIntoSysTenant(tenant);

            dataSourceManager.registerDataSource(() => {
                return new PostgreSQLDataSource({
                    host: DB_HOST,
                    port: DB_PORT,
                    user: DB_USER,
                    password: DB_PASSWORD,
                    database: tenant.database
                });
            }, tenant.id);
        }

        // create the database
        await defaultDataSource.withContext(async (asyncContext) => {
            const ctx = await asyncContext;
            await ctx.executeQuery(`CREATE DATABASE ${tenant.database};`);
            await ctx.executeQuery(`GRANT ALL PRIVILEGES ON DATABASE ${tenant.database} TO ${DB_USER};`);
        });

        const tenantId = isRegistry ? eDatabaseType.registry : tenant.id;

        const dataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(tenantId);

        const readFileAsync = util.promisify(fs.readFile);

        const ctx = await dataSource.createSharedContext();
        await asyncForEach(["schema.sql", "views.sql"], async (file) => {
            const script = (
                await readFileAsync(path.join(__dirname, "..", "..", "resources", "database", file))
            ).toString();
            await ctx.executeQuery(script);
        });
        ctx.disposeContext();

        // insert the same tenant record from the master database to the tenant database
        const tenantDs = new SysTenantDataService({ tenantId });
        tenant = await tenantDs.insertIntoSysTenant(tenant);

        if (isRegistry) {
            dataSourceManager.registerDataSource(() => {
                return new PostgreSQLDataSource({
                    host: DB_HOST,
                    port: DB_PORT,
                    user: DB_USER,
                    password: DB_PASSWORD,
                    database: tenant.database
                });
            }, tenant.id);
        }

        return tenant;
    }

    /**
     * Create JWK keys for a given tenant
     *
     * @protected
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected async createJWKKeys(tenant: ISysTenant) {
        const keysDs = new SysKeyDataService({ tenantId: tenant.id });
        return keysDs.insertIntoSysKey({
            key_type: "JWK",
            key_id: await sha256Hash(tenant.id + Date.now().toString()),
            data: (await this.generateKeyPareAndCertificate(tenant.name)) as any
        });
    }


    /**
     * @param {IInitializeTenant} params
     * @return {*} 
     * @memberof DatabaseSeed
     */
    public async initializeTenant(params: IInitializeTenant) {

        const { AUTH_SESSION_LENGTH_HOURS = 0 } = application.getSettings<
            IPortaApplicationSetting & IDatabaseAppSettings
        >();


        let { allow_registration, allow_reset_password, databaseName, email, organization, password, tenantName, username, serverURL } = params || {};

        // is registry flag
        const isRegistry = tenantName === commonUtils.getPortaRegistryTenant();

        // normalize db name
        databaseName = isRegistry ? databaseName : `porta_${tenantName}`.toLocaleLowerCase();

        const dbInitialized = await this.isSystemInitialized(databaseName);

        let tenant: ISysTenant = undefined;

        if (isRegistry && !dbInitialized) {
            tenant = {
                database: databaseName,
                name: tenantName,
                organization,
                allow_registration: false,
                allow_reset_password: true,
                is_active: true,
                auth_session_length_hours: AUTH_SESSION_LENGTH_HOURS
            };
        } else if (!dbInitialized) {
            tenant = {
                database: databaseName,
                name: tenantName,
                organization,
                allow_registration,
                allow_reset_password,
                is_active: true,
                auth_session_length_hours: AUTH_SESSION_LENGTH_HOURS
            };
        }

        const tenantRecord = tenant ? await this.initializeDatabaseSchema({ tenant, isRegistry }) : undefined;

        // At this point we should have a tenant record and an empty database to seed further
        if (tenantRecord) {
            // create keys
            await this.createJWKKeys(tenantRecord);
            const { userRole, adminRole } = await this.createRoles(tenantRecord);
            await this.createUsers(tenantRecord, userRole, adminRole, username, password, email);
            await this.createCLIApplication(tenantRecord, serverURL);
            await this.createConformanceTestApplication(tenantRecord, serverURL);
            await this.createMFAProviders(tenantRecord);
        }

        return tenantRecord;
    }

    protected createMFAProviders(tenantRecord) {
        const mfaDs = new SysMfaDataService({ tenantId: tenantRecord.id });
        return mfaDs.insertIntoSysMfa({
            name: "portamail"
        });
    }

    protected async createConformanceTestApplication(tenantRecord: ISysTenant, serverURL: string) {

        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = application.getSettings<
            IPortaApplicationSetting & IDatabaseAppSettings
        >();


        if (!process.env.DEBUG) {
            return;
        }

        const app = await this.createApplication(
            {
                tenant_id: tenantRecord.id,
                application_name: "OIDC Conformance Test Suite",
                client_id: "097c6871-fa61-47c8-9840-93482a126b21",
                description: "Demo Application",
            },
            tenantRecord
        );

        const client = await this.createClient(
            {
                client_type: eClientType.confidential,
                application_id: app.id,
                redirect_uri: `https://localhost.emobix.co.uk:8443/test/a/discovery-test/callback`,
                post_logout_redirect_uri: `${serverURL}/fe/auth/${tenantRecord.id}/signout/complete`,
                access_token_length: ACCESS_TOKEN_TTL,
                refresh_token_length: REFRESH_TOKEN_TTL,
                mfa_bypass_days: 1
            },
            app,
            tenantRecord
        );

        const now = Date.now();
        await this.createSecret(
            {
                secret: "secret",
                valid_from: new Date(now).toISOString(),
                valid_to: new Date(commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * 365, now)).toISOString(),
                client_id: client.id
            },
            client,
            tenantRecord
        );
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {string} serverURL
     * @memberof DatabaseSeed
     */
    protected async createCLIApplication(tenantRecord: ISysTenant, serverURL: string) {
        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, BYPASS_MFA_DAYS = 1, } = application.getSettings<
            IPortaApplicationSetting & IDatabaseAppSettings
        >();

        const app = await this.createApplication(
            {
                tenant_id: tenantRecord.id,
                id: MD5(`porta_cli_${tenantRecord.id}`),
                application_name: "CLI",
                client_id: generateRandomUUID(),
                description: "CLI Application",
                is_system: true
            },
            tenantRecord
        );

        await this.createClient(
            {
                client_type: eClientType.public,
                application_id: app.id,
                redirect_uri: `${serverURL}/oidc/${tenantRecord.id}/signin/callback`,
                post_logout_redirect_uri: `${serverURL}/fe/auth/${tenantRecord.id}/signout/complete`,
                access_token_length: ACCESS_TOKEN_TTL,
                refresh_token_length: REFRESH_TOKEN_TTL,
                is_system: true,
                is_back_channel_post_logout: false,
                mfa_bypass_days: BYPASS_MFA_DAYS
            },
            app,
            tenantRecord
        );
    }

    /**
     * @param {ISysSecret} record
     * @param {ISysApplication} app
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof DatabaseSeed
     */
    public createSecret(record: ISysSecret, client: ISysClient, tenantRecord: ISysTenant) {
        const secretDs = new SysSecretDataService({ tenantId: tenantRecord.id });
        return secretDs.insertIntoSysSecret({
            ...record,
            client_id: client.id
        });
    }

    /**
     * @protected
     * @param {ISysClient} record
     * @param {ISysApplication} app
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof DatabaseSeed
     */
    protected createClient(record: ISysClient, app: ISysApplication, tenantRecord: ISysTenant) {
        const clientDs = new SysClientDataService({ tenantId: tenantRecord.id });
        return clientDs.insertIntoSysClient({
            ...record,
            application_id: app.id
        });
    }

    /**
     * @protected
     * @param {ISysApplication} record
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof DatabaseSeed
     */
    protected createApplication(record: ISysApplication, tenantRecord: ISysTenant,) {
        const appDs = new SysApplicationDataService({ tenantId: tenantRecord.id });
        return appDs.insertIntoSysApplication(record);
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {ISysRole} userRole
     * @param {ISysRole} adminRole
     * @param {string} username
     * @param {string} password
     * @param {string} email
     * @memberof DatabaseSeed
     */
    protected async createUsers(tenantRecord: ISysTenant, userRole: ISysRole, adminRole: ISysRole, username: string, password: string, email: string) {
        const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
        const profileDs = new SysProfileDataService({ tenantId: tenantRecord.id });
        const userRoleDs = new SysUserRoleDataService({ tenantId: tenantRecord.id });

        const adminUser = await userDs.insertIntoSysUser({
            username,
            password,
            is_system: true
        });

        await profileDs.insertIntoSysProfile({
            firstname: tenantRecord.name,
            lastname: "Administrator",
            email,
            user_id: adminUser.id
        });

        await userRoleDs.insertIntoSysUserRole({
            role_id: userRole.id,
            user_id: adminUser.id
        });
        await userRoleDs.insertIntoSysUserRole({
            role_id: adminRole.id,
            user_id: adminUser.id
        });
    }

    /**
     * @param tenantRecord 
     * @returns 
     */
    protected async createRoles(tenantRecord: ISysTenant) {
        const roleDs = new SysRoleDataService({ tenantId: tenantRecord.id });
        const userRole = await roleDs.insertIntoSysRole({
            role: "USER",
            description: "System Users",
            is_active: true,
            is_system: true
        });
        const adminRole = await roleDs.insertIntoSysRole({
            role: "ADMINISTRATOR",
            description: "System Administrators",
            is_active: true,
            is_system: true
        });
        return { userRole, adminRole };
    }
}