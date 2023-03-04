#!/bin/bash

HERE=`pwd`
echo build codegen
yarn generate && \

echo building shared libs && \
cd ../shared && \
yarn build && \
cd ${HERE}

exit 0;