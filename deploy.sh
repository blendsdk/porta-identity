#!/bin/bash
SERVER=$1
SUBDOMAIN=$2
SSHOPTS="-o StrictHostKeyChecking=no"

ssh ${SSHOPTS} ${SERVER} "mkdir -p ~/containers/${SUBDOMAIN}.portaidentity.com/docker/app"
rsync -avz -e "ssh ${SSHOPTS}" --progress ./dist-bundle/ ${SERVER}:/home/truesoftware/containers/${SUBDOMAIN}.portaidentity.com/docker/app
# ssh ${SSHOPTS} ${SERVER} "mkdir -p ~/containers/${SUBDOMAIN}.portaidentity.com && cd ~/containers/${SUBDOMAIN}.portaidentity.com && touch ./porta_${SUBDOMAIN}.json && ./porta up -c ./porta_${SUBDOMAIN}.json -i app"

# ssh ${SSHOPTS} ${SERVER} "mkdir -p ~/containers/${SUBDOMAIN}.portaidentity.com && cd ~/containers/${SUBDOMAIN}.portaidentity.com && ./build-app-image.sh porta dev && ./swap.sh porta dev"
