#!/bin/bash
SERVER=$1
SUBDOMAIN=$2
MODE=$3
SSHOPTS="-o StrictHostKeyChecking=no"

ssh ${SSHOPTS} ${SERVER} "mkdir -p ~/containers/${SUBDOMAIN}.portaidentity.com/docker/app"
rsync -avz -e "ssh ${SSHOPTS}" --progress ./dist-bundle/ ${SERVER}:/home/truesoftware/containers/${SUBDOMAIN}.portaidentity.com/docker/app
ssh ${SSHOPTS} ${SERVER} "mkdir -p ~/containers/${SUBDOMAIN}.portaidentity.com && cd ~/containers/${SUBDOMAIN}.portaidentity.com && touch ./porta_${MODE}.json && ./porta up -c ./porta_${mode}.json -i app"