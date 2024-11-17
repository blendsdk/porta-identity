import { DbSeeder, TEnumConfig, TInsertRecord } from "@blendsdk/codegen";
import { eSysSecret, ISysSecret } from "../types";

export const CONST_DAY_IN_SECONDS = 60 * 60 * 24;

export class SecretSeeder extends DbSeeder<ISysSecret> {
    getTableName(): string {
        return eSysSecret.$name;
    }

    getEmumConfig(): TEnumConfig<ISysSecret> {
        return null;
    }

    normalizeRecord(record: Partial<ISysSecret>): Partial<ISysSecret> {
        return record;
    }

    prepareDbRecord(record: Partial<ISysSecret>): TInsertRecord<ISysSecret> {
        const { id, application_id, description, is_system, secret, valid_from, valid_to } = record;

        return {
            id: this.toUUID(id),
            application_id: this.toUUID(application_id),
            description: this.toDBString(description),
            is_system,
            secret: this.toDBString(secret),
            valid_from: this.toDBString(valid_from),
            valid_to: this.toDBString(valid_to)
        };
    }

    prepareEnumValue(_record: Partial<ISysSecret>): string | number {
        throw new Error("Method not implemented.");
    }

    /**
     * @param {number} [length]
     * @return {*}  {string}
     * @memberof CommonUtils
     */
    public generateSecret(length: number): string {
        const lowerCase = "abcdefghijklmnopqrstuvwxyz";
        const upperCase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const numbers = "0123456789";
        const specialChars = "!@#$%^&*-_~";
        const allChars = lowerCase + upperCase + numbers + specialChars;

        let password = "";

        // Ensure at least one character from each group
        password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
        password += upperCase[Math.floor(Math.random() * upperCase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += specialChars[Math.floor(Math.random() * specialChars.length)];

        // Fill the remaining characters randomly
        for (let i = password.length; i < length; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }

        // Shuffle the password to prevent predictable patterns
        password = password
            .split("")
            .sort(() => 0.5 - Math.random())
            .join("");

        return password;
    }

    public secondsToMilliseconds(seconds: number) {
        return seconds * 1000;
    }

    public expireSecondsFromNow(seconds: number, now?: number) {
        return (now || Date.now()) + this.secondsToMilliseconds(seconds);
    }
}

export const secretSeeder = new SecretSeeder();
