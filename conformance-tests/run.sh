RUNTEST="./scripts/run-test-plan.py"

DISABLE_SSL_VERIFY=true ${RUNTEST} oidcc-config-certification-test-plan ./plans/registry-by-id-discovery.json && \
DISABLE_SSL_VERIFY=true ${RUNTEST} oidcc-config-certification-test-plan ./plans/registry-discovery.json && \
echo "ALL GOOD"