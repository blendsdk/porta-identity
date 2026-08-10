import { resolve } from 'node:path';

import * as commands from '../commands.js';
import * as redaction from '../scripts/redact-evidence.js';
import * as rendering from '../scripts/render-summary.js';
import * as validation from '../scripts/validate-assurance.js';
import * as schema from '../schema.js';
import { registerEvidenceAndCommandCases } from './evidence-and-command-cases.js';
import { registerSchemaCases } from './schema-cases.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

// The foundation selector composes pre-authored case registrars without defining expectations.
registerSchemaCases(schema);
registerEvidenceAndCommandCases({ commands, rendering, redaction, validation }, repositoryRoot);
