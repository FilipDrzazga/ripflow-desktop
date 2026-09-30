import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown } from "react-icons/hi2";
import styles from "./Select.module.css";

const OPTION_HEIGHT = 38; // px, one row of the menu - only used to decide whether it fits below
const MENU_GAP = 6;

// The app's own dropdown, in the look of the Print filter menus (DataFilters), for places where a
// native <select> would show the operating system's list. options: [{ value, label, short? }] -
// `short` is what the closed button shows when the full label is too long for it. The menu is
// rendered in a portal, positioned from the button, so a card with overflow: hidden cannot clip it.
const Select = ({ value, options, onChange, title, warn = false, disabled = false, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = options.length * OPTION_HEIGHT + 12;
    const fitsBelow = rect.bottom + MENU_GAP + menuHeight <= window.innerHeight;
    setPlace({
      left: rect.left,
      minWidth: rect.width,
      ...(fitsBelow ? { top: rect.bottom + MENU_GAP } : { bottom: window.innerHeight - rect.top + MENU_GAP }),
    });
  }, [open, options.length]);

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
    // the menu is positioned once, from the button: any scroll or resize would leave it behind
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

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
        onClick={() => setOpen((v) => !v)}
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
            {options.map((option) => {
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
