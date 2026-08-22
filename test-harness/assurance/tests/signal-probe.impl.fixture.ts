import { writeFileSync } from 'node:fs';

const pidFile = process.env.PORTA_ASSURANCE_SIGNAL_PROBE_PID_FILE;
if (pidFile === undefined) throw new Error('signal probe requires an owned PID file');
writeFileSync(pidFile, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx' });
setInterval(() => undefined, 1_000);
