#!/bin/bash
reset
clear

HERE=`pwd`
echo build codegen
yarn generate && \

echo "" && \
echo "///////////////////////////////////////////////" && \
echo BUILDING THE SHARED LIB && \
echo "///////////////////////////////////////////////" && \
cd ../shared && \
pwd && \
yarn build && \
cd ${HERE}

exit 0;