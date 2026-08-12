export { cleanupPackedConsumer, loadPackedSurfaces, preparePackedConsumer } from './consumer.js';
export { digestRegularTree, requireCanonicalChild, sha256Bytes } from './filesystem.js';
export { verifyPackedCliSdkResolution, type PackedCliSdkResolution } from './resolution.js';
export type {
  CurrentTripletIdentity,
  PackedArchiveIdentity,
  PackedConsumerProvenance,
  PackedSurfaceResult,
  PreparedPackedConsumer,
} from './model.js';
