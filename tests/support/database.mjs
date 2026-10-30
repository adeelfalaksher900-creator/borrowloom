import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../src/schema.sql',import.meta.url),'utf8'));
  const d1=row=>row?Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Array.from(v):v])):null;
  class Statement{
    constructor(sql,params=[]){this.sql=sql;this.params=params;}
    bind(...params){return new Statement(this.sql,params);}
    async first(){return d1(sqlite.prepare(this.sql).get(...this.params));}
    async all(){return {results:sqlite.prepare(this.sql).all(...this.params).map(d1)};}
    async run(){const r=sqlite.prepare(this.sql).run(...this.params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  }
  let tail=Promise.resolve();
  return {sqlite,prepare:sql=>new Statement(sql),batch(statements){const pending=tail.then(async()=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}});tail=pending.catch(()=>{});return pending;},close(){sqlite.close();}};
}
export const ORIGIN='https://borrowloom.test';
export function env(){return {DB:database(),SITE_ORIGINS:ORIGIN,ASSET_ORIGIN:ORIGIN};}
