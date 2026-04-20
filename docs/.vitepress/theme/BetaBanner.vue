<template>
  <div class="beta-banner">
    ⚠️ Porta is in <strong>beta</strong> — APIs and features may change before v1.0
  </div>
</template>

<style scoped>
.beta-banner {
  background-color: #fff3cd;
  color: #664d03;
  text-align: center;
  padding: 8px 16px;
  font-size: 14px;
  border-bottom: 1px solid #ffecb5;
  line-height: 1.5;
}

/* Dark mode support */
.dark .beta-banner {
  background-color: #332701;
  color: #ffda6a;
  border-bottom-color: #664d03;
}
</style>
