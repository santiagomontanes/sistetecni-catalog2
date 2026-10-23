import {spawn} from 'node:child_process';
import {pilotEnvironment} from './pilot-network.mjs';
const env=pilotEnvironment();
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env:{...process.env,...env},stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});
