import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { addDays, today } from '../src/domain.mjs';

const schema=readFileSync(new URL('../src/schema.sql',import.meta.url),'utf8');
function database(care=1){
 const db=new DatabaseSync(':memory:'); db.exec(schema);
 db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('owner','Owner');
 db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,0)').run('borrower','Borrower');
 db.prepare('INSERT INTO circles(id,owner_id,title,care_days,invite_hash,created_at) VALUES(?,?,?,?,?,0)').run('circle','owner','Wardrobe',care,'digest');
 db.prepare('INSERT INTO members VALUES(?,?,?,0)').run('circle','borrower','Borrower');
 db.prepare('INSERT INTO garments(id,circle_id,title,category,size_label,asset,created_at) VALUES(?,?,?,?,?,?,0)').run('garment','circle','Blazer','outer','M','jacket.png');
 return db;
}
function insert(db,id,from,to,status='pending'){
 db.prepare('INSERT INTO loans(id,circle_id,garment_id,borrower_id,start_date,end_date,status,client_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,0,0)').run(id,'circle','garment','borrower',from,to,status,id,'hash');
}
test('two pending requests are allowed, but only one overlapping approval succeeds',()=>{
 const db=database();const start=addDays(today(),2),end=addDays(start,2);
 insert(db,'a',start,end);insert(db,'b',start,end);
 db.prepare("UPDATE loans SET status='approved' WHERE id='a'").run();
 assert.throws(()=>db.prepare("UPDATE loans SET status='approved' WHERE id='b'").run(),/DATES_UNAVAILABLE/);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM loans WHERE status='approved'").get().n,1);
 assert.equal(db.prepare("SELECT status FROM loans WHERE id='b'").get().status,'pending'); db.close();
});
test('care-day edges match the calendar and cancellation releases the dates',()=>{
 const db=database(); const start=addDays(today(),3),end=addDays(start,2);
 insert(db,'a',start,end,'approved');
 assert.throws(()=>insert(db,'b',addDays(end,1),addDays(end,2),'approved'),/DATES_UNAVAILABLE/);
 insert(db,'c',addDays(end,2),addDays(end,3),'approved');
 db.prepare("UPDATE loans SET status='cancelled' WHERE id='a'").run();
 insert(db,'d',start,end,'approved'); db.close();
});
test('an actual early return keeps care days and releases later dates',()=>{
 const db=database();const start=today(),end=addDays(start,5);
 insert(db,'a',start,end,'approved'); db.prepare("UPDATE loans SET status='collected' WHERE id='a'").run();
 db.prepare("UPDATE loans SET status='returned',actual_return_date=? WHERE id='a'").run(start);
 assert.throws(()=>insert(db,'b',addDays(start,1),addDays(start,1),'approved'),/DATES_UNAVAILABLE/);
 insert(db,'c',addDays(start,2),addDays(start,3),'approved');db.close();
});
test('an overdue collected garment remains blocked beyond its scheduled return',()=>{
 const db=database();insert(db,'a',addDays(today(),-5),addDays(today(),-2),'collected');
 assert.throws(()=>insert(db,'b',addDays(today(),10),addDays(today(),12),'approved'),/DATES_UNAVAILABLE/);db.close();
});
test('cross-wardrobe garment references and archived pieces are rejected by storage',()=>{
 const db=database();db.prepare('INSERT INTO circles(id,owner_id,title,care_days,invite_hash,created_at) VALUES(?,?,?,?,?,0)').run('other','owner','Other',0,'other');
 assert.throws(()=>db.prepare('INSERT INTO loans(id,circle_id,garment_id,borrower_id,start_date,end_date,client_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,0)').run('a','other','garment','borrower',today(),today(),'a','hash'),/GARMENT_UNAVAILABLE/);
 db.prepare('UPDATE garments SET archived=1').run();assert.throws(()=>insert(db,'b',today(),today()),/GARMENT_UNAVAILABLE/);db.close();
});
test('duplicate client keys are a storage-level invariant',()=>{
 const db=database();insert(db,'a',today(),today());
 assert.throws(()=>db.prepare('INSERT INTO loans(id,circle_id,garment_id,borrower_id,start_date,end_date,client_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,0)').run('b','circle','garment','borrower',today(),today(),'a','hash'),/UNIQUE/);db.close();
});
