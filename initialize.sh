#!/bin/bash

PORTA_HOST="${PORTA_HOST:-${1:-https://porta.local}}"

read -p "HOST: (${PORTA_HOST})" HOST
if [ -z "${HOST}" ]; then
    HOST=${PORTA_HOST}
fi

if [ -z "${PORTA_API_KEY}" ]; then
    echo Please set the PORTA_API_KEY environment variable
    exit 1;
fi


read -p "Email: (${PORTA_EMAIL}) :"
PORTA_EMAIL=${PORTA_EMAIL:-$REPLY}
if [ -z "${PORTA_EMAIL}" ]; then
    echo An e-mail is required
    exit 1;
fi

read -p "Username: (${PORTA_EMAIL})"
USERNAME=${REPLY:-$PORTA_EMAIL}
# if [ -z "${USERNAME}" ]; then
#     USERNAME=${PORTA_EMAIL}
# fi

read -sp 'Password: '
PASSWORD=${PASSWORD-$REPLY}
if [ -z "${PASSWORD}" ]; then
    echo A passowrd is required
    exit 1;
fi

echo -e "\n"

# cd ./packages/webapi && \
# yarn db:restart && \
# docker exec -it porta_db psql -U postgres -c "DROP DATABASE IF EXISTS registry1" && \
# cd ../../

curl -sS -k -X POST "${HOST}/api/initialize" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "Authorization: Bearer ${PORTA_API_KEY}" \
    -d "username=${USERNAME}&password=${PASSWORD}&email=${PORTA_EMAIL}"


