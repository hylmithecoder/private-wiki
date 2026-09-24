const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Infinity],
];

/** "3 hours ago", from a unix timestamp in seconds. */
export function ago(unix: number): string {
  let delta = unix - Date.now() / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit);
    delta /= size;
  }
  return "";
}

const full = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
export const fullDate = (unix: number) => full.format(new Date(unix * 1000));

const day = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });
export const dayLabel = (unix: number) => day.format(new Date(unix * 1000));
