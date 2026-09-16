import dayjs from "dayjs";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function addBusinessDays(d: dayjs.Dayjs, n: number) {
  let out = d;
  let left = n;
  while (left > 0) {
    out = out.add(1, "day");
    if (out.day() !== 0 && out.day() !== 6) left -= 1;
  }
  return out;
}

function nextWeekday(day: number, from = dayjs().startOf("day")) {
  let d = from.add(1, "day");
  while (d.day() !== day) d = d.add(1, "day");
  return d;
}

/**
 * Parses human phrases like "within 7–10 business days", "by Friday", "in 3 days", "next week",
 * "20 September", "Sep 18", "end of month", "tomorrow". Ranges resolve to the LATEST date.
 * Returns a dayjs at 18:00 local, or null when not understood.
 */
export function parseExpectedPhrase(input?: string | null, from = dayjs().startOf("day")): dayjs.Dayjs | null {
  if (!input) return null;
  const s = input.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const at = (d: dayjs.Dayjs) => d.startOf("day").hour(18);

  if (/\btoday\b/.test(s)) return at(from);
  if (/\btomorrow\b/.test(s)) return at(from.add(1, "day"));
  if (/\bday after tomorrow\b/.test(s)) return at(from.add(2, "day"));

  // "within 7-10 business days", "in 3 days", "7 to 10 working days", "2 weeks"
  const range = s.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(business|working)?\s*(day|week|month)s?/);
  const single = s.match(/(?:within|in|after|next)?\s*(\d+)\s*(business|working)?\s*(day|week|month)s?/);
  const m = range ?? single;
  if (m) {
    const n = parseInt(range ? range[2] : single![1], 10);
    const business = !!(range ? range[3] : single![2]);
    const unit = (range ? range[4] : single![3]) as "day" | "week" | "month";
    if (unit === "day") return at(business ? addBusinessDays(from, n) : from.add(n, "day"));
    if (unit === "week") return at(from.add(n, "week"));
    return at(from.add(n, "month"));
  }

  if (/\bnext week\b/.test(s)) return at(from.add(7, "day"));
  if (/\bnext month\b/.test(s)) return at(from.add(1, "month"));
  if (/\bend of (the )?(this )?month\b/.test(s)) return at(from.endOf("month"));
  if (/\bend of (the )?(this )?week\b/.test(s)) return at(nextWeekday(5, from.subtract(1, "day")));
  if (/\bthis weekend\b|\bweekend\b/.test(s)) return at(nextWeekday(6, from.subtract(1, "day")));

  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b|\\b${WEEKDAYS[i].slice(0, 3)}\\b`).test(s)) {
      const next = /\bnext\b/.test(s);
      let d = nextWeekday(i, from);
      if (next && d.diff(from, "day") < 7) d = d.add(7, "day");
      return at(d);
    }
  }

  // "20 september", "sep 18", "18 sep 2026", "september 20th"
  for (let mi = 0; mi < 12; mi++) {
    const name = MONTHS[mi];
    const rx = new RegExp(`(?:(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:${name}|${name.slice(0, 3)})\\b|\\b(?:${name}|${name.slice(0, 3)})\\s*(\\d{1,2})(?:st|nd|rd|th)?)(?:,?\\s*(\\d{4}))?`);
    const mm = s.match(rx);
    if (mm) {
      const day = parseInt(mm[1] ?? mm[2], 10);
      const year = mm[3] ? parseInt(mm[3], 10) : from.year();
      let d = dayjs(new Date(year, mi, day));
      if (!mm[3] && d.isBefore(from, "day")) d = d.add(1, "year");
      return d.isValid() ? at(d) : null;
    }
  }

  // ISO / numeric dates
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = dayjs(`${iso[1]}-${iso[2]}-${iso[3]}`);
    return d.isValid() ? at(d) : null;
  }
  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    const d = dayjs(new Date(y, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10)));
    return d.isValid() ? at(d) : null;
  }
  return null;
}
