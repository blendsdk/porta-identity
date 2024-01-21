import Cookies from "js-cookie";

export const isFlowExpired = (key: string) => {
    const now = Date.now();
    const _ls = Cookies.get(key);

    let expire = now - 1;

    if (_ls) {
        try {
            expire = parseInt(_ls);
        } catch {
            //no-op
        }
    }

    // edge case
    if (isNaN(expire)) {
        expire = now - 1;
    }

    return expire - Date.now() <= 0;
};
