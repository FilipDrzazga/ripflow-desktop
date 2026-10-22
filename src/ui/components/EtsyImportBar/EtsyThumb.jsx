import { useEffect, useState } from "react";
import { LuImage } from "react-icons/lu";
import { getEtsyListingImage } from "../../services/etsyImportService";
import styles from "./EtsyImportBar.module.css";

// The listing's small picture at the start of a bar line (FILIP 2026-10-22). It asks only while the bar is OPEN
// (`enabled`): the lines stay mounted while it is closed (a3b906d), and an Etsy call counts against the app's
// daily allowance - main keeps each answer (helpers/etsyThumbnail.js), so a re-open or a poll costs no Etsy call.
// No picture (none on the listing, no Etsy key on this station, Etsy away) is the grey square, silently: a missing
// picture is not something the person has to act on.
const EtsyThumb = ({ listingId, enabled }) => {
  const [loaded, setLoaded] = useState({ id: null, image: null });

  useEffect(() => {
    if (!enabled || !listingId) return undefined;
    let cancelled = false;
    getEtsyListingImage(listingId)
      .then((res) => {
        if (!cancelled) setLoaded({ id: listingId, image: res?.success && typeof res.image === "string" ? res.image : null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id: listingId, image: null });
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, enabled]);

  // A result belongs to the listing it was asked for; any other one is not shown (no reset inside the effect).
  const image = loaded.id === listingId ? loaded.image : null;
  return (
    <span className={styles.thumb} aria-hidden="true">
      {image ? <img className={styles.thumb_img} src={image} alt="" draggable={false} /> : <LuImage size={16} className={styles.thumb_none} />}
    </span>
  );
};

export default EtsyThumb;
