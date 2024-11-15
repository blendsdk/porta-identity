RUNTEST="./scripts/run-test-plan.py --verbose"

DISABLE_SSL_VERIFY=true ${RUNTEST} oidcc-basic-certification-test-plan[client_registration=static_client][server_metadata=discovery] ./plans/oidcc-basic-certification-test-plan.json 
#&& \
#DISABLE_SSL_VERIFY=true ${RUNTEST} oidcc-config-certification-test-plan ./plans/registry-by-id-discovery.json && \
#DISABLE_SSL_VERIFY=true ${RUNTEST} oidcc-config-certification-test-plan ./plans/registry-discovery.json && \
echo "ALL GOOD"