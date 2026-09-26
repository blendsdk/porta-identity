<script setup lang="ts">
import { useData } from 'vitepress';

const { theme } = useData();
</script>

<template>
  <div class="version-banner">Porta v{{ theme.portaVersion }}</div>
</template>

<style scoped>
.version-banner {
  background-color: #eef2ff;
  color: #3730a3;
  text-align: center;
  padding: 8px 16px;
  font-size: 14px;
  border-bottom: 1px solid #c7d2fe;
  line-height: 1.5;
}

/* Dark mode support */
.dark .version-banner {
  background-color: #1e1b4b;
  color: #c7d2fe;
  border-bottom-color: #312e81;
}
</style>
