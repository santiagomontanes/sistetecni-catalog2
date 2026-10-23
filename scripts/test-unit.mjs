import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const compile=spawnSync('node',['node_modules/typescript/bin/tsc','-p','tsconfig.test.json','--incremental','false'],{stdio:'inherit'});
if(compile.status!==0)process.exit(compile.status??1);
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const tests=walk('.tmp-test').filter(p=>p.endsWith('.test.js')&&!p.includes('.integration.'));
const test=spawnSync('node',['--test',...tests],{stdio:'inherit'});
process.exit(test.status??1);
