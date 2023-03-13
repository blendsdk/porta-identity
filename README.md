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

### TODO

get rid of the sys_client_type and determine the client type of redirect url. This can be done by looking at at the
ios/android or redirect_uri columns.

We need something like this to automatically determine PKCE for mobile and HTML5 clients (TokenEndpointController) We
also have the Confidential Client to handle. the CC do not need PKCE We also need to take care of the logout mechanism.
We also need to take care of session refresh and extension. (this is going to be a challenge)

[security] the OTA should not be the same as the flowId

READ! https://datatracker.ietf.org/doc/html/draft-sakimura-oauth-wmrm-00
