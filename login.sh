KEY=$(echo -n "cli:secret12" | base64)


ACCESS_TOKEN=$(curl -sS -k -X POST "https://porta.local/registry/oauth2/token?scope=email+profile" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Authorization: Basic ${KEY}" \
    -d "grant_type=client_credentials&client_id=cli" | jq -r ".access_token")

ME=$(curl -sS -k -X POST "https://porta.local/registry/oauth2/me" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq ".")

echo ${ME}