#!/bin/bash

DEFAULT_HOST=${1:-"https://porta.local"}

read -p "HOST: (${DEFAULT_HOST})" HOST
if [ -z "${HOST}" ]; then
    HOST=${DEFAULT_HOST}
fi

if [ -z "${PORTA_API_KEY}" ]; then
    echo Please set the PORTA_API_KEY environment variable
    exit 1;
fi


read -p "Email: (${EMAIL}) :"
EMAIL=${EMAIL:-$REPLY}
if [ -z "${EMAIL}" ]; then
    echo An e-mail is required
    exit 1;
fi

read -p "Username: (${EMAIL})"
USERNAME=${REPLY:-$EMAIL}
# if [ -z "${USERNAME}" ]; then
#     USERNAME=${EMAIL}
# fi

read -sp 'Password: '
PASSWORD=${PASSWORD-$REPLY}
if [ -z "${PASSWORD}" ]; then
    echo A passowrd is required
    exit 1;
fi

echo -e "\n"

cd ./packages/webapi && \
yarn db:restart && \
docker exec -it porta_db psql -U postgres -c "DROP DATABASE IF EXISTS registry1" && \
cd ../../

curl -sS -k -X POST "${HOST}/api/initialize" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Authorization: Bearer ${PORTA_API_KEY}" \
    -d "username=${USERNAME}&password=${PASSWORD}&email=${EMAIL}"


