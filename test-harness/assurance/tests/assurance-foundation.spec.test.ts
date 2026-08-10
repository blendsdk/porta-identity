import { registerSchemaCases } from './schema-cases.js';
import * as schema from '../schema.js';

// The foundation selector executes the immutable schema cases without collecting later components.
registerSchemaCases(schema);
