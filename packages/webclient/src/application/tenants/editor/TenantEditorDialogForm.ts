import { RouterStore, makeForm, yup } from "@blendsdk/react";
import { ISysTenant } from "@porta/shared";
import { ApplicationApi } from "../../../system/api";
import { IRouterCommonParams } from "../../../system/session/types";

/**
 * Interface describing the TenantEditorDialog
 * dialog model
 *
 * @export
 * @interface ITenantEditorDialogModel
 */
export interface ITenantEditorDialogModel
    extends Pick<ISysTenant, "name" | "organization" | "allow_registration" | "allow_reset_password" | "is_active"> {
    email: string;
    password: string;
}

/**
 * Implements a validation schema for TenantEditorDialog
 */
export const validationSchema = (router: RouterStore) => {
    const vs: yup.ObjectSchema<ITenantEditorDialogModel> = yup.object({
        email: yup.string().email().required(),
        password: yup.string().min(5).required(),
        name: yup
            .string()
            .required()
            .test({
                name: "singleWord",
                message: "tenant_must_be_one_word",
                test: (value: string) => {
                    const re = /^\b\w+$/;
                    return re.test(value);
                }
            })
            .test({
                name: "checkExistingTenant",
                message: "tenant_already_exists",
                test: (value) => {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const { tenant } = router.getParameters<IRouterCommonParams>();
                            const { data } = await ApplicationApi.openIdTenant.getOpenIdTenant({ tenant, id: value });
                            resolve(data === null);
                        } catch (err) {
                            reject(err);
                        }
                    });
                }
            }),
        organization: yup.string().required(),
        allow_registration: yup.boolean(),
        allow_reset_password: yup.boolean(),
        is_active: yup.boolean()
    });
    return vs;
};

/**
 * Create a Formik form base on ITenantEditorDialogModel
 */
export const useTenantEditorDialogForm = makeForm<ITenantEditorDialogModel>();
