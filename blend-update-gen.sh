rm /Users/gevik/Workspace/github/TrueSoftwarNL/porta/yarn.lock

cd /Users/gevik/Workspace/github/TrueSoftwarNL/porta/packages/webapi
yarn add   --exact @blendsdk/clientkit@next \
@blendsdk/crypto@next \
@blendsdk/datakit@next \
@blendsdk/expression@next \
@blendsdk/jsonschema@next \
@blendsdk/postgresql@next \
@blendsdk/stdlib@next \
@blendsdk/webafx@next \
@blendsdk/webafx-auth@next \
@blendsdk/webafx-auth-linkedin@next \
@blendsdk/webafx-cache@next \
@blendsdk/webafx-common@next \
@blendsdk/webafx-i18n@next


cd /Users/gevik/Workspace/github/TrueSoftwarNL/porta/packages/shared
yarn add   --exact @blendsdk/stdlib@next


cd /Users/gevik/Workspace/github/TrueSoftwarNL/porta/packages/codegen
yarn add   --exact @blendsdk/codegen@next \
@blendsdk/datakit@next \
@blendsdk/jsonschema@next \
@blendsdk/logger@next \
@blendsdk/postgresql@next \
@blendsdk/stdlib@next


