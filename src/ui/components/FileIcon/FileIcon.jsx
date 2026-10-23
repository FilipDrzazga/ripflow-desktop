import { LuFileText } from "react-icons/lu";
import { SiEtsy } from "react-icons/si";
import { isEtsyOrder } from "../../utils/orderLink";
import styles from "./FileIcon.module.css";

// The icon in front of a file name: the Etsy mark for an Etsy order, the plain file icon for the rest. The caller's
// `className` carries the list's own size and colour, so only the colour of the Etsy mark is set here (FileIcon.module.css).
// The Inbox (DataList) draws the same mark itself; keep the two in step.
const FileIcon = ({ orderId = null, fileName = null, className = "", ...rest }) =>
  isEtsyOrder(orderId, fileName) ? (
    <SiEtsy className={`${className} ${styles.etsy}`} title="Etsy order" aria-label="Etsy order" {...rest} />
  ) : (
    <LuFileText className={className} {...rest} />
  );

export default FileIcon;
