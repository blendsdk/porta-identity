import { IDictionaryOf } from "@blendsdk/stdlib";

export interface IFormPostTemplate {
    redirect_uri: string;
    data: IDictionaryOf<any>;
    query?: IDictionaryOf<any>;
    fragment?: IDictionaryOf<any>;
}

export const formPostTemplate = ({ redirect_uri, data, query, fragment }: IFormPostTemplate) => {

    const url = new URL(redirect_uri);

    Object.entries(query || {}).forEach(([k, v]) => {
        url.searchParams.append(k, v);
    });

    if (fragment) {
        url.hash = Object.entries(fragment).map(([k, v]) => {
            return `${k}=${encodeURIComponent(v)}`;
        }).join("&");
    }

    redirect_uri = url.toString();

    const fields = Object.entries(data || {})
        .map(([key, value]) => {
            return `<input type="hidden" name="${key}" value="${value}"/>`;
        })
        .join("\n");

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <noscript>
        <form action="${redirect_uri}" method="post" enctype="application/x-www-form-urlencoded">
            ${fields}
            <button type="submit"></button>
        </form>
    </noscript>
    <form id="form1" action="${redirect_uri}" method="post" enctype="application/x-www-form-urlencoded">
        ${fields}
    <form>
</body>
<script>
        function docReady(fn) {
            if (document.readyState === "complete" || document.readyState === "interactive") {
                setTimeout(fn, 1);
            } else {
                document.addEventListener("DOMContentLoaded", fn);
            }
        }
        docReady(function(){
            document.getElementById("form1").submit();
        })
</script>
</html>
    `;
};
