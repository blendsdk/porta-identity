/**
 * Static application fixtures for predictable test scenarios.
 *
 * These provide application input shapes — they do NOT insert into the
 * database. Use with factory `createTestApplication()` or repository.
 *
 * Each fixture represents a well-known application configuration that
 * tests can reference by name for clarity.
 */

import type { InsertApplicationData } from '../../src/applications/repository.js';

/** Standard web application — the most common application type */
export const WEB_APP: InsertApplicationData = {
  name: 'Web Portal',
  slug: 'web-portal',
  description: 'Primary web application',
};

/** API service application — backend service without a UI */
export const API_APP: InsertApplicationData = {
  name: 'API Service',
  slug: 'api-service',
  description: 'Backend API service',
};

/** Mobile application — native mobile app */
export const MOBILE_APP: InsertApplicationData = {
  name: 'Mobile App',
  slug: 'mobile-app',
  description: 'Native mobile application',
};
