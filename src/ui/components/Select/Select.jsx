import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown } from "react-icons/hi2";
import { useFloatingClose } from "../../hooks/useFloatingClose";
import { filterOptions } from "../../utils/selectSearch";
import styles from "./Select.module.css";

const OPTION_HEIGHT = 38; // px, one row of the menu - only used to decide whether it fits below
const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 360; // px, a longer list (the whole Fabrics catalogue) scrolls inside the menu
const SEARCH_ROW_HEIGHT = 48; // px, the search field on top of a searchable menu

// The app's own dropdown, in the look of the Print filter menus (DataFilters), for places where a
// native <select> would show the operating system's list. options: [{ value, label, short? }] -
// `short` is what the closed button shows when the full label is too long for it. The menu is
// rendered in a portal, positioned from the button, so a card with overflow: hidden cannot clip it.
// `searchable` adds a search field on top of the menu (a long list - the Fabrics catalogue): typing leaves the options
// whose label has every typed word (utils/selectSearch.js), Enter takes the first one.
const Select = ({ value, options, onChange, title, warn = false, disabled = false, ariaLabel, searchable = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = Math.min(options.length * OPTION_HEIGHT + 12, MENU_MAX_HEIGHT) + (searchable ? SEARCH_ROW_HEIGHT : 0);
    const fitsBelow = rect.bottom + MENU_GAP + menuHeight <= window.innerHeight;
    setPlace({
      left: rect.left,
      minWidth: rect.width,
      ...(fitsBelow ? { top: rect.bottom + MENU_GAP } : { bottom: window.innerHeight - rect.top + MENU_GAP }),
    });
  }, [open, options.length, searchable]);

  // Ctrl+F opening the order search closes every floating layer (D59)
  useFloatingClose(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const handleMouseDown = (e) => {
      if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close();
    };
    const handleKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    // the menu is positioned once, from the button: a scroll of the page or a resize would leave it behind. The menu's OWN
    // scrolling (a long list, capped in height) is the person choosing, and must not close it - the capturing listener
    // below sees the scroll events of every element, so it looks where the event came from.
    const handleScroll = (e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  // The search field takes the keyboard the moment the menu opens.
  const focusSearch = useCallback((el) => {
    if (el) el.focus();
  }, []);

  const shown = searchable ? filterOptions(options, query) : options;

  const pick = (option) => {
    setOpen(false);
    buttonRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.button} ${open ? styles.button_open : ""} ${warn ? styles.button_warn : ""}`}
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.button_label}>{selected ? (selected.short ?? selected.label) : ""}</span>
        <HiChevronDown className={`${styles.chevron} ${open ? styles.chevron_open : ""}`} />
      </button>
      {open &&
        place &&
        createPortal(
          <div ref={menuRef} className={styles.menu} style={place} role="listbox">
            {searchable && (
              <div className={styles.search_row}>
                <input
                  ref={focusSearch}
                  type="text"
                  className={styles.search}
                  value={query}
                  placeholder="Search..."
                  aria-label="Search the list"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && shown.length > 0) {
                      e.preventDefault();
                      pick(shown[0]);
                    }
                  }}
                />
              </div>
            )}
            {searchable && shown.length === 0 && <div className={styles.empty}>Nothing matches</div>}
            {shown.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${styles.option} ${isSelected ? styles.option_selected : ""}`}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
};

export default Select;
