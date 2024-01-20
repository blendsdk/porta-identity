import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { DataServicesBase } from "./DataServicesBase";

export class DataServices extends DataServicesBase {
    protected initDataSource(): Promise<PostgreSQLDataSource> {
        throw new Error("Method not implemented.");
    }
}
