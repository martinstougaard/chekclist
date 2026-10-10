const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

/** 'YYYY-MM-DD' → lokal Date (undgår tidszoneskred). */
function parseDateOnly(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(value) {
  if (!value) return '–';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateOnly(value) : new Date(value);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(value) {
  const d = new Date(value);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(value)} ${time}`;
}

export function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Antal dage fra i dag til deadline (negativt = overskredet). */
export function daysUntil(deadline) {
  if (!deadline) return null;
  const today = parseDateOnly(todayString());
  return Math.round((parseDateOnly(deadline) - today) / 86400000);
}

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g;

/** Deler tekst i dele, hvor links er markeret – bruges til at gøre URL'er klikbare. */
export function splitLinks(text) {
  return String(text)
    .split(URL_RE)
    .map((part, i) => ({ text: part, link: i % 2 === 1 }))
    .filter((p) => p.text);
}
