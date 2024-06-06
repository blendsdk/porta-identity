import { sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { asyncForEach, isNullOrUndef } from "@blendsdk/stdlib";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import * as x509 from "@peculiar/x509";
import { ISysTenant } from "@porta/shared";
import fs from "fs";
import path from "path";
import util from "util";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { application } from "../modules";
import { IPortaApplicationSetting, eDatabaseType } from "../types";
import { commonUtils } from "./CommonUtils";

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
class DatabaseSeed {

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
     * Initializes a tenant
     *
     * @param {IInitializeTenant} {
     *         tenantName,
     *         databaseName,
     *         organization,
     *         allow_registration,
     *         allow_reset_password,
     *         username,
     *         password,
     *         email,
     *         serverURL
     *     }
     * @returns
     * @memberof DatabaseSeed
     */
    public async initializeTenant({
        tenantName,
        databaseName,
        organization,
        allow_registration,
        allow_reset_password,
    }: IInitializeTenant) {
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
                is_active: true
            };
        } else if (!dbInitialized) {
            tenant = {
                database: databaseName,
                name: tenantName,
                organization,
                allow_registration,
                allow_reset_password,
                is_active: true
            };
        }

        const tenantRecord = tenant ? await this.initializeDatabaseSchema({ tenant, isRegistry }) : undefined;

        // At this point we should have a tenant record and an empty database to seed further
        if (tenantRecord) {
            // create keys
            await this.createJWKKeys(tenantRecord);
        }

        return tenantRecord;
    }
}

export const databaseSeed = new DatabaseSeed();