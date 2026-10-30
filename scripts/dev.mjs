import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.mjs';
import './build.mjs';
const port=Number(process.env.PORT||3080),origin=`http://localhost:${port}`,root=resolve('dist');
await mkdir('.local',{recursive:true});
const sqlite=new DatabaseSync('.local/borrowloom.sqlite');sqlite.exec(await readFile('src/schema.sql','utf8'));
const d1=row=>row?Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Array.from(v):v])):null;
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return d1(sqlite.prepare(this.sql).get(...this.args));}async all(){return {results:sqlite.prepare(this.sql).all(...this.args).map(d1)};}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}}
const DB={prepare:s=>new Statement(s),async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const env={DB,SITE_ORIGINS:origin,ASSET_ORIGIN:origin,YOUCAM_API_KEY:process.env.YOUCAM_API_KEY,YOUCAM_MIN_BALANCE:process.env.YOUCAM_MIN_BALANCE||500};
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await worker.fetch(request,env,{waitUntil:p=>p.catch(console.error)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
  let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')&&path!==root)throw new Error('Bad path');if(path===root)path+='/index.html';else if(!extname(path))path+='.html';try{await stat(path);}catch{path=root+'/404.html';res.statusCode=404;}res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('Unable to serve this request.');}}).listen(port,()=>console.log('Borrowloom development server: '+origin));
