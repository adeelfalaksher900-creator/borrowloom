import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const files=[...await walk('src'),...await walk('public'),...await walk('scripts'),...await walk('tests')];let count=0;
for(const f of files.filter(x=>x.endsWith('.mjs'))){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status){process.stderr.write(r.stderr);process.exit(1);}count++;}
for(const f of files.filter(x=>x!=='scripts/check.mjs'&&/\.(mjs|css|sql)$/.test(x))){const text=await readFile(f,'utf8');if(/(?:sk_live_[A-Za-z0-9]{12}|ghp_[A-Za-z0-9]{20}|service_role.{0,8}eyJ)/.test(text))throw new Error('Potential embedded credential: '+f);}
console.log(`Syntax checked ${count} JavaScript modules; no known credential patterns found. This is not a comprehensive secret scanner.`);
