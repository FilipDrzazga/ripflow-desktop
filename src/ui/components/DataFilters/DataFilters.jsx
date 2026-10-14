import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  HiClipboardDocumentList,
  HiOutlineClipboardDocumentList,
  HiMagnifyingGlass,
  HiXMark,
  HiArrowsUpDown,
  HiChevronDown,
  HiChevronUp,
  HiArrowTrendingDown,
  HiClock,
  HiAdjustmentsHorizontal,
} from "react-icons/hi2";
import { LuRefreshCw } from "react-icons/lu";
import { IoLeaf, IoLeafOutline } from "react-icons/io5";
import { PiPolygon, PiPolygonFill } from "react-icons/pi";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
import { withSlotLooks } from "@/utils/materialClasses";
import { printTypeOptions } from "@/utils/printTypeOptions";
import { SORT_ORDER, countByPrintType, activeFilterCount } from "@/utils/printFilters";
import styles from "./DataFilters.module.css";

// The icon pair of each material-class slot (4-types-b): slot 0 = the leaf Cottons always had,
// slot 1 = the polygon of Polyesters. The tab's NAME comes from the shop profile.
const CLASS_TAB_LOOKS = [
  { IconOn: IoLeaf, IconOff: IoLeafOutline },
  { IconOn: PiPolygonFill, IconOff: PiPolygon },
];

const SORT_OPTIONS = [
  { value: null, label: "Default", icon: HiArrowsUpDown },
  { value: SORT_ORDER.METERS_DESC, label: "Meters", icon: HiArrowTrendingDown },
  { value: SORT_ORDER.DATE_ASC, label: "Oldest", icon: HiClock },
];


const DataFilters = () => {
  const activeTab = useStore((state) => state.activeTab);
  const isRefreshingFiles = useStore((state) => state.isRefreshingFiles);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const clearSelection = useStore((state) => state.toggleClearSelection);
  const refreshInbox = useStore((state) => state.refreshInbox);
  const inboxNewCount = useStore((state) => state.inboxWatch.added.length);
  const searchQuery = useStore((state) => state.searchQuery);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const sortOrder = useStore((state) => state.sortOrder);
  const setSortOrder = useStore((state) => state.setSortOrder);
  const printTypeFilter = useStore((state) => state.printTypeFilter);
  const setPrintTypeFilter = useStore((state) => state.setPrintTypeFilter);
  const shopProfile = useStore((state) => state.shopProfile);
  // one tab per material class of the profile, in its order (4-types-b)
  const classTabs = withSlotLooks(shopProfile, CLASS_TAB_LOOKS);
  // the print types this shop has (4-types-f): fixed-size ones only from the profile
  const typeOptions = printTypeOptions(shopProfile);

  const files = useStore((state) => state.files);
  // what each type chip would show: the current tab + search, the type filter left out
  const typeCounts = useMemo(() => countByPrintType(files, activeTab, searchQuery), [files, activeTab, searchQuery]);
  const filterCount = activeFilterCount(printTypeFilter, sortOrder);

  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!panelOpen) return;
    const handleClick = (e) => {
      if (!panelRef.current?.contains(e.target)) setPanelOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [panelOpen]);

  const handleClick = (tab) => {
    setActiveTab(tab);
    clearSelection();
  };

  // the same refresh as the inbox pill's click (store.refreshInbox, 4-inbox)
  const handleRefresh = () => refreshInbox();

  const handleTypeToggle = (value) => {
    const next = printTypeFilter.includes(value)
      ? printTypeFilter.filter((v) => v !== value)
      : [...printTypeFilter, value];
    setPrintTypeFilter(next);
    clearSelection();
  };

  // "Clear all": types and sort at once; the selection goes with the types, as on a toggle
  const handleClearAll = () => {
    if (printTypeFilter.length > 0) {
      setPrintTypeFilter([]);
      clearSelection();
    }
    setSortOrder(null);
  };

  const activeSortOption = SORT_OPTIONS.find((o) => o.value === sortOrder) ?? SORT_OPTIONS[0];
  const ActiveSortIcon = activeSortOption.icon;
  const activeTypeOptions = typeOptions.filter((o) => printTypeFilter.includes(o.value));

  return (
    <div className={styles.filters_container}>
      <button
        onClick={() => handleClick("All")}
        className={`${styles.filter_button} ${activeTab === "All" ? styles.active : ""}`}
      >
        {activeTab === "All" ? <HiClipboardDocumentList /> : <HiOutlineClipboardDocumentList />}All
      </button>
      {classTabs.map(({ name, IconOn, IconOff }) => (
        <button
          key={name}
          onClick={() => handleClick(name)}
          className={`${styles.filter_button} ${activeTab === name ? styles.active : ""}`}
        >
          {activeTab === name ? <IconOn /> : <IconOff />}
          {name}
        </button>
      ))}
      <div className={styles.filter_separator} />
      <div className={styles.sort_wrapper} ref={panelRef}>
        <button
          type="button"
          className={`${styles.filter_button} ${styles.panel_button} ${filterCount > 0 ? styles.active : ""}`}
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
        >
          <span className={styles.sort_btn_label}>
            <HiAdjustmentsHorizontal />
            Filter
          </span>
          <span className={styles.sort_chevron}>{panelOpen ? <HiChevronUp /> : <HiChevronDown />}</span>
        </button>
        {panelOpen && (
          <div className={styles.filter_panel}>
            <div className={styles.panel_label}>Sort</div>
            <div
              className={styles.segmented}
              role="radiogroup"
              aria-label="Sort"
              style={{ "--segment-count": SORT_OPTIONS.length, "--segment-index": SORT_OPTIONS.indexOf(activeSortOption) }}
            >
              {/* one white thumb under the segments; it slides to the active one */}
              <span className={styles.segment_thumb} aria-hidden="true" />
              {SORT_OPTIONS.map((opt) => {
                const OptIcon = opt.icon;
                const isOn = sortOrder === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="radio"
                    aria-checked={isOn}
                    className={`${styles.segment} ${isOn ? styles.segment_on : ""}`}
                    onClick={() => setSortOrder(opt.value)}
                  >
                    <OptIcon />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className={styles.panel_label}>Types</div>
            <div className={styles.type_chips}>
              {typeOptions.map((opt) => {
                const isOn = printTypeFilter.includes(opt.value);
                const def = PRINT_TYPE_MAP[opt.value];
                const Icon = def?.Icon;
                const count = typeCounts[opt.value] ?? 0;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isOn}
                    className={`${styles.type_chip} ${isOn ? styles.type_chip_on : ""} ${count === 0 && !isOn ? styles.type_chip_empty : ""}`}
                    onClick={() => handleTypeToggle(opt.value)}
                  >
                    {Icon && <Icon size={14} className={styles.type_chip_icon} />}
                    <span className={styles.type_chip_label}>{opt.label}</span>
                    <span className={styles.type_chip_count}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.panel_footer}>
              <button type="button" className={styles.clear_all} onClick={handleClearAll} disabled={filterCount === 0}>
                Clear all
              </button>
            </div>
          </div>
        )}
      </div>
      {filterCount > 0 && (
        <div className={styles.active_chips}>
          {sortOrder && (
            <button
              key={sortOrder}
              type="button"
              className={styles.active_chip}
              onClick={() => setSortOrder(null)}
              title="Remove sort"
            >
              <ActiveSortIcon />
              {activeSortOption.label}
              <HiXMark className={styles.active_chip_x} />
            </button>
          )}
          {activeTypeOptions.map((opt) => {
            const def = PRINT_TYPE_MAP[opt.value];
            const Icon = def?.Icon;
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.active_chip} ${styles.active_chip_type}`}
                style={{ "--chip-color": def?.color ?? "#6b7280" }}
                onClick={() => handleTypeToggle(opt.value)}
                title={`Remove ${opt.label}`}
              >
                {Icon && <Icon size={14} />}
                {opt.label}
                <HiXMark className={styles.active_chip_x} />
              </button>
            );
          })}
        </div>
      )}
      <div className={styles.right_group}>
        <div className={styles.search_wrapper}>
          <HiMagnifyingGlass className={styles.search_icon} />
          <input
            className={styles.search_input}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.search_clear} type="button" onClick={() => setSearchQuery("")}>
              <HiXMark />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshingFiles}
          className={`${styles.filter_button} ${styles.refresh_button}`}
        >
          {isRefreshingFiles ? <span className={styles.spinner} /> : <LuRefreshCw size={15} />}
          {!isRefreshingFiles && inboxNewCount > 0 && <span className={styles.refresh_dot}>{inboxNewCount > 99 ? "99+" : inboxNewCount}</span>}
        </button>
      </div>
    </div>
  );
};

export default DataFilters;
