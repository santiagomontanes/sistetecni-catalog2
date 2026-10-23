import {spawn} from 'node:child_process';
import {appEnv} from './browser-env.mjs';
// Artefacto sintético LOCAL. Nunca desplegar este build: contiene URLs loopback.
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env:{...process.env,...appEnv},stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});
