import { LuMessageSquareText } from "react-icons/lu";
import styles from "./BuyerNoteBubble.module.css";

// The buyer's note of an Etsy order (plan MSG-2): a small bubble beside the "Ship by" badge. The tooltip is the browser's
// own `title` with the FULL note (a customer's words, rendered as React text - never markup, never logged or notified);
// a click opens the order's page on Etsy with the buyer conversation expanded through `onOpen` (the caller's
// openEtsyConversation, MSG-3). It sits inside a label (Inbox) and a clickable card (Production), so the click must neither toggle the
// row's checkbox nor select the card: preventDefault stops the label's activation, stopPropagation the card's handler.
// Nothing to show (no note, the feature off) renders nothing - no empty space.
const BuyerNoteBubble = ({ note, onOpen, className = "" }) => {
  if (typeof note !== "string" || note === "") return null;
  return (
    <button
      type="button"
      className={`${styles.bubble} ${className}`.trim()}
      title={note}
      aria-label={`Buyer's note: ${note}`}
      data-buyer-note
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen?.();
      }}
    >
      <LuMessageSquareText size={13} />
    </button>
  );
};

export default BuyerNoteBubble;
