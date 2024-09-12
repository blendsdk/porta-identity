import { useGlobalTranslation } from "@blendsdk/react";

export const AccessDeniedContent = () => {
    const gt = useGlobalTranslation();
    //TODO: FIX AccessDeniedContent, fix the types
    return <div>
        {gt.translate("access_denied")}
    </div>;
};