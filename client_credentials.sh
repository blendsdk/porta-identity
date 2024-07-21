#!/bin/bash

curl -k --request POST \
  --url 'https://porta.local/d688a663-ec2b-04a0-ff80-b4a900b9a41f/oauth2/token' \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data grant_type=client_credentials \
  --data client_id='097c6871-fa61-47c8-9840-93482a126b21' \
  --data client_secret='secret'