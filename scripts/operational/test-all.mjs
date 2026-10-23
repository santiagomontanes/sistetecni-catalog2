import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
function run(command,args,input){const r=spawnSync(command,args,{stdio:input?['pipe','inherit','inherit']:'inherit',input});if(r.status!==0)process.exit(r.status??1);}
run(process.execPath,['--test','--test-concurrency=1','tests/sql/workshop.test.mjs','scripts/operational/shipping.integration.mjs','scripts/operational/station-finishes.test.mjs','scripts/operational/transport.integration.mjs','scripts/operational/notifications.integration.mjs']);
run('docker',['exec','-i','sistetecni-operational-test','psql','-U','postgres','-d','erp_test','-v','ON_ERROR_STOP=1'],readFileSync('scripts/operational/attendance.sql'));
run(process.execPath,['scripts/operational/attendance-concurrency.mjs']);
