// The ship-by date of an Etsy order line (plan ETA): the transaction's expected_ship_date, epoch SECONDS, as Etsy
// sends it in the receipt the import already fetches. Used by both processes: main decides what it stores, the
// renderer (ETA-2) what it shows.

// Above this a value is not seconds (1e11 s is the year 5138): most likely milliseconds, which would read as a date
// tens of thousands of years away. Refused like any other value Etsy did not mean.
export const ETSY_SHIP_BY_MAX = 1e11;

// -> the value as a whole number of seconds above 0 (and below ETSY_SHIP_BY_MAX), or null for anything else
// (missing, 0, a string, a fraction, milliseconds). null is "Etsy said nothing usable" - never a reason to clear a
// date already stored.
export const etsyShipByOf = (value) => (Number.isSafeInteger(value) && value > 0 && value < ETSY_SHIP_BY_MAX ? value : null);

// The most order numbers one "ship dates" question may carry (plan ETA-2). The renderer cuts its list to this and
// main refuses a longer one, so the SQL placeholder list stays small whatever the Inbox / Production hold.
export const ETSY_SHIP_DATES_MAX = 500;
