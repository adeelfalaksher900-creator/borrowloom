export class Problem extends Error {
  constructor(code, message, status = 400, field = '') {
    super(message);
    this.name = 'Problem';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export function text(value, label, maximum = 120, required = true) {
  if (typeof value !== 'string') {
    if (!required && value == null) return '';
    throw new Problem('INVALID_FIELD', `Enter ${label}.`, 400, label);
  }
  const result = value.trim();
  if ((required && !result) || result.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    throw new Problem('INVALID_FIELD', `${label} must be ${required ? '1' : '0'}–${maximum} characters.`, 400, label);
  }
  return result;
}

export function object(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Problem('INVALID_BODY', 'Send a valid form.');
  return value;
}

export function identifier(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Problem('NOT_FOUND', 'That record could not be found.', 404);
  }
  return value;
}

export function calendarDate(value, label = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Problem('INVALID_DATE', `Choose a valid ${label}.`, 400, label);
  const d = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Problem('INVALID_DATE', `Choose a valid ${label}.`, 400, label);
  return value;
}

export function today(now = new Date()) { return now.toISOString().slice(0, 10); }
export function addDays(value, count) {
  const d = new Date(calendarDate(value) + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

export function loanDates(input, currentDay = today()) {
  const from = calendarDate(input.start_date, 'collection date');
  const to = calendarDate(input.end_date, 'return date');
  if (from < currentDay) throw new Problem('PAST_DATE', 'Choose a collection date from today onwards.', 400, 'start_date');
  if (to < from) throw new Problem('DATE_ORDER', 'The return date must be on or after collection.', 400, 'end_date');
  if (to > addDays(from, 20)) throw new Problem('LOAN_TOO_LONG', 'Choose a borrowing window of at most 21 days.', 400, 'end_date');
  if (to > addDays(currentDay, 365)) throw new Problem('DATE_TOO_FAR', 'Choose dates within the next year.', 400, 'end_date');
  return { start_date: from, end_date: to };
}

export const CATEGORIES = Object.freeze({ full_body: 'Dresses & full outfits', upper_body: 'Tops & shirts', outer: 'Jackets & outerwear' });

export function garmentFields(input) {
  object(input);
  if (!Object.hasOwn(CATEGORIES, input.category)) throw new Problem('INVALID_CATEGORY', 'Choose a supported garment category.', 400, 'category');
  return {
    title: text(input.title, 'garment name', 100),
    category: input.category,
    size_label: text(input.size_label, 'size label', 40),
    colour: text(input.colour, 'colour', 40, false),
    measurements: text(input.measurements, 'measurements', 400, false),
    condition_note: text(input.condition_note, 'condition', 400, false),
    care_note: text(input.care_note, 'care instructions', 400, false)
  };
}

export function circleFields(input) {
  object(input);
  const care = Number(input.care_days);
  if (!Number.isInteger(care) || care < 0 || care > 3) throw new Problem('INVALID_CARE_DAYS', 'Choose zero to three care days.');
  return { title: text(input.title, 'wardrobe name', 80), description: text(input.description, 'description', 300, false), rules: text(input.rules, 'lending instructions', 800, false), care_days: care };
}

export function availability(windows, from, to, careDays = 0) {
  calendarDate(from); calendarDate(to);
  if (to < from) return false;
  const holdTo = addDays(to, careDays);
  return !windows.some(w => from <= w.blocked_to && holdTo >= w.start_date);
}

const OWNER_TRANSITIONS = Object.freeze({ pending: ['approved', 'declined'], approved: ['collected', 'cancelled'], collected: ['returned'] });

export function canTransition(loan, next, role, currentDay = today()) {
  const options = role === 'owner' ? OWNER_TRANSITIONS[loan.status] || [] : ['pending', 'approved'].includes(loan.status) ? ['cancelled'] : [];
  if (!options.includes(next)) return false;
  if (next === 'approved' && loan.start_date < currentDay) return false;
  if (next === 'collected' && (loan.start_date > currentDay || loan.end_date < currentDay)) return false;
  return true;
}

export function requireTransition(loan, next, role, currentDay = today()) {
  if (!canTransition(loan, next, role, currentDay)) throw new Problem('INVALID_TRANSITION', 'This request has changed or that action is not available. Refresh the page and review it.', 409);
}

export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function csvCell(value) {
  const s = String(value ?? '');
  const guarded = /^[\s\u0000-\u001f]*[=+@-]/u.test(s) ? "'" + s : s;
  return '"' + guarded.replaceAll('"', '""') + '"';
}

export function statusLabel(status) {
  return ({ pending: 'Awaiting owner', approved: 'Dates confirmed', collected: 'With borrower', returned: 'Returned', declined: 'Declined', cancelled: 'Cancelled' })[status] || 'Unknown';
}

export const EXAMPLE_GARMENTS = Object.freeze([
  { title: 'Burgundy satin dress', category: 'full_body', size_label: 'M', colour: 'Burgundy', measurements: 'Example measurements: chest 92 cm, waist 76 cm, length 118 cm.', condition_note: 'Fictional example piece. Not available for real-world borrowing.', care_note: 'Example care: owner arranges cleaning.', asset: 'dress.png' },
  { title: 'Navy tailored blazer', category: 'outer', size_label: 'L', colour: 'Navy', measurements: 'Example measurements: chest 108 cm, shoulder 46 cm, length 74 cm.', condition_note: 'Fictional example piece. Not available for real-world borrowing.', care_note: 'Example care: hang after use and agree cleaning with the owner.', asset: 'jacket.png' },
  { title: 'Ivory pleated blouse', category: 'upper_body', size_label: 'S', colour: 'Ivory', measurements: 'Example measurements: chest 88 cm, length 62 cm.', condition_note: 'Fictional example piece. Not available for real-world borrowing.', care_note: 'Example care: delicate fabric; ask the owner before washing.', asset: 'blouse.png' }
]);
