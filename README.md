# Porta Identity and Access management System

# DevProxy

This is an Nginx proxy that us sed to run the development webapi and the webclient under and porta.local domain to be
able to run the OIDC conformance test suit.

## SSL Certs

Install the SSL certs from `devproxy/ssl` in your machine using this
[link](https://tosbourn.com/getting-os-x-to-trust-self-signed-ssl-certificates/)

### NOTE:

To recreate the SSL certificates you need to start the nginx container and create the SSL certificates from within the
container!

### Development

1. Run `./restart-dev.sh`
2. Start the webapi `yarn watch:node`
3. Start the webclient `yarn dev`
4. Start the devproxy `cd devproxy && docker compose up`
