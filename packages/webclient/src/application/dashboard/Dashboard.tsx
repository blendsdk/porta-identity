import { Authenticated, useRouter } from "@blendsdk/react";

export const Dashboard = () => {
    const router = useRouter<{ tenant: string }>();
    const { tenant } = router.getParameters();
    return (
        <Authenticated>
            <div>{tenant}</div>
        </Authenticated>
    );
};
