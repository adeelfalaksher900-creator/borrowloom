import test from 'node:test';
import assert from 'node:assert/strict';
import {imageData,readJSON,rateLimit,validateImage} from '../src/security.mjs';
import {database} from './support/database.mjs';
import {storageURL,priceAndBalance} from '../src/youcam.mjs';
export function fakePNG(w=768,h=1024){const b=new Uint8Array(100);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const d=new DataView(b.buffer);d.setUint32(16,w);d.setUint32(20,h);return b;}
test('images reject SVG, disguised content, undersized and oversized payloads',()=>{
  assert.throws(()=>imageData('data:image/svg+xml;base64,PHN2Zz4='));assert.throws(()=>imageData('data:image/jpeg;base64,'+Buffer.from(fakePNG()).toString('base64')));
  assert.throws(()=>validateImage(fakePNG(100,100)),/512/);assert.throws(()=>validateImage(new Uint8Array(600000)),/smaller/);assert.equal(validateImage(fakePNG()).type,'image/png');
});
test('JSON body parsing enforces stream size, valid UTF-8, object shape and content type',async()=>{
  await assert.rejects(readJSON(new Request('https://site.test',{method:'POST',body:'{}'})),/JSON/);
  for(const body of ['[]','null','{"x":"'+('a'.repeat(100))+'"}'])await assert.rejects(readJSON(new Request('https://site.test',{method:'POST',headers:{'Content-Type':'application/json'},body}),50));
});
test('atomic rate limiting grants exactly the configured allowance',async()=>{const db=database();for(let i=0;i<3;i++)await rateLimit(db,'key',3);await assert.rejects(rateLimit(db,'key',3),e=>e.status===429);db.close();});
test('provider storage is HTTPS and allowlisted, never arbitrary URLs or authenticated redirects',()=>{
  assert.equal(new URL(storageURL('https://yce-task.s3.us-west-2.amazonaws.com/a?token=secret')).hostname,'yce-task.s3.us-west-2.amazonaws.com');
  for(const u of ['http://yce-task.s3.amazonaws.com/a','https://yce-task.s3.amazonaws.com.evil.test/a','https://127.0.0.1/x','https://user:pass@yce-task.s3.amazonaws.com/a'])assert.throws(()=>storageURL(u));
});
test('missing key, ambiguous feature costs and unaffordable units fail closed before inference',async()=>{
  await assert.rejects(priceAndBalance({}),e=>e.code==='PREVIEW_UNAVAILABLE');
  const build=costs=>({YOUCAM_API_KEY:'test-only',FETCH:async url=>Response.json(url.includes('client/credit')?{results:[{type:'ApiPaid',amount:1000}]}:{result:{skus:costs.map(amount=>({run_task_url:'/s2s/v2.0/task/cloth-v4',amount}))}})});
  assert.equal((await priceAndBalance(build([2]))).cost,2);await assert.rejects(priceAndBalance(build([3])),e=>e.code==='PREVIEW_BUDGET');await assert.rejects(priceAndBalance(build([1,2])),e=>e.code==='PROVIDER_PRICE');
});
