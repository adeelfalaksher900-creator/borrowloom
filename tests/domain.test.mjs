import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, addDays, loanDates, availability, canTransition, garmentFields, circleFields, escapeHTML, csvCell } from '../src/domain.mjs';

test('calendar validation rejects impossible dates and handles leap days', () => {
  assert.equal(calendarDate('2028-02-29'),'2028-02-29');
  for (const d of ['2026-02-29','2026-04-31','2026-1-02','not a date']) assert.throws(()=>calendarDate(d));
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
test('borrowing windows are inclusive and bounded', () => {
  assert.deepEqual(loanDates({start_date:'2026-10-30',end_date:'2026-11-19'},'2026-10-30'),{start_date:'2026-10-30',end_date:'2026-11-19'});
  for (const input of [{start_date:'2026-10-29',end_date:'2026-11-01'},{start_date:'2026-11-01',end_date:'2026-10-30'},{start_date:'2026-10-30',end_date:'2026-11-20'}]) assert.throws(()=>loanDates(input,'2026-10-30'));
});
test('care days block adjacent reservations from either direction', () => {
  const windows=[{start_date:'2026-11-04',blocked_to:'2026-11-08'}];
  assert.equal(availability(windows,'2026-11-01','2026-11-03',0),true);
  assert.equal(availability(windows,'2026-11-01','2026-11-03',1),false);
  assert.equal(availability(windows,'2026-11-08','2026-11-09',1),false);
  assert.equal(availability(windows,'2026-11-09','2026-11-10',1),true);
});
test('every role and state transition is bounded', () => {
  const loan={status:'pending',start_date:'2026-11-01',end_date:'2026-11-04'};
  assert.equal(canTransition(loan,'approved','owner','2026-10-30'),true);
  assert.equal(canTransition(loan,'approved','borrower','2026-10-30'),false);
  assert.equal(canTransition(loan,'cancelled','borrower','2026-10-30'),true);
  assert.equal(canTransition({...loan,status:'collected'},'cancelled','borrower','2026-11-02'),false);
  assert.equal(canTransition({...loan,status:'approved'},'collected','owner','2026-10-30'),false);
  assert.equal(canTransition({...loan,status:'approved'},'collected','owner','2026-11-02'),true);
  assert.equal(canTransition(loan,'approved','owner','2026-11-02'),false);
  assert.equal(canTransition({...loan,status:'returned'},'collected','owner','2026-11-02'),false);
});
test('known fields reject prototype names, missing size and overlong instructions', () => {
  const g={title:'Occasion blouse',category:'upper_body',size_label:'M'};
  assert.equal(garmentFields(g).colour,'');
  assert.throws(()=>garmentFields({...g,category:'__proto__'}));
  assert.throws(()=>garmentFields({...g,size_label:''}));
  assert.throws(()=>circleFields({title:'Weekend wardrobe',care_days:1,rules:'x'.repeat(801)}));
  assert.throws(()=>circleFields({title:'Weekend wardrobe',care_days:4}));
});
test('display text and spreadsheet cells are escaped without changing stored values', () => {
  assert.equal(escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('  +SUM(A1)'),'"\'  +SUM(A1)"');
  assert.equal(csvCell('A, B'),'"A, B"');
});
