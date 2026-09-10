// Indian fiscal year: April 1 - March 31. Quarters follow the same
// calendar: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar. These
// helpers compute the date windows the Performance Evaluation screen
// compares a branch's live business figure against — "as on 31 March
// last FY", "target for next month/quarter", "target for this FY's
// year-end" — all relative to whatever "now" actually is, never
// hardcoded to a specific year.
//
// Everything here is built with Date.UTC, not the local-timezone Date
// constructor. Prisma reads/writes DateTime columns (stored as
// Postgres "timestamp without time zone") by treating the raw value as
// UTC — using the local constructor would silently produce different
// window boundaries on a machine running in IST (local dev) vs one
// running in UTC (Render), breaking the exact-timestamp match against
// BranchPerformance.periodStart.

export interface DateWindow {
  start: Date;
  end: Date;
}

function utcMidnight(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day, 0, 0, 0, 0));
}

function utcEndOfDay(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day, 23, 59, 59, 999));
}

// The calendar year in which the fiscal year containing `now` begins
// (e.g. for any date in Apr 2026 - Mar 2027, this returns 2026).
function currentFiscalYearStartYear(now: Date): number {
  return now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function fiscalYearWindow(startYear: number): DateWindow {
  return {
    start: utcMidnight(startYear, 3, 1),
    end: utcEndOfDay(startYear + 1, 2, 31),
  };
}

export function getCurrentFiscalYearWindow(now: Date = new Date()): DateWindow {
  return fiscalYearWindow(currentFiscalYearStartYear(now));
}

export function getPreviousFiscalYearWindow(now: Date = new Date()): DateWindow {
  return fiscalYearWindow(currentFiscalYearStartYear(now) - 1);
}

export function getNextMonthWindow(now: Date = new Date()): DateWindow {
  const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    start: utcMidnight(year, month, 1),
    end: utcEndOfDay(year, month, lastDay),
  };
}

// Quarter start months, 0-indexed: Apr=3, Jul=6, Oct=9, Jan=0.
const QUARTER_START_MONTHS = [3, 6, 9, 0];

function currentQuarterIndex(month0: number): number {
  if (month0 >= 3 && month0 <= 5) return 0; // Apr-Jun
  if (month0 >= 6 && month0 <= 8) return 1; // Jul-Sep
  if (month0 >= 9 && month0 <= 11) return 2; // Oct-Dec
  return 3; // Jan-Mar
}

export function getNextQuarterWindow(now: Date = new Date()): DateWindow {
  const currentIdx = currentQuarterIndex(now.getUTCMonth());
  const nextIdx = (currentIdx + 1) % 4;
  const startMonth = QUARTER_START_MONTHS[nextIdx];
  // Only Oct-Dec -> Jan-Mar crosses into the next calendar year.
  const year = currentIdx === 2 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const endMonth = startMonth + 3; // exclusive
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    start: utcMidnight(year, startMonth, 1),
    end: utcEndOfDay(year, endMonth - 1, lastDay),
  };
}
