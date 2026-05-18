import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import {
  HiArrowPath,
  HiClipboardDocumentList,
  HiOutlineClipboardDocumentList,
  HiMagnifyingGlass,
  HiXMark,
  HiArrowsUpDown,
  HiChevronDown,
  HiChevronUp,
  HiArrowTrendingDown,
  HiClock,
  HiFunnel,
} from "react-icons/hi2";
import { IoLeaf, IoLeafOutline } from "react-icons/io5";
import { PiPolygon, PiPolygonFill } from "react-icons/pi";
import styles from "./DataFilters.module.css";

const SORT_OPTIONS = [
  { value: null, label: "Sort by", icon: HiArrowsUpDown },
  { value: "meters_desc", label: "Meters", icon: HiArrowTrendingDown },
  { value: "date_asc", label: "Oldest", icon: HiClock },
];

const PRINT_TYPE_OPTIONS = [
  { value: null, label: "All Types" },
  { value: "LM", label: "Linear Meter" },
  { value: "FQ", label: "Fat Quarter" },
  { value: "SAMPLE", label: "Sample" },
  { value: "CUSHION", label: "Cushion" },
  { value: "TEA_TOWEL", label: "Tea Towel" },
];

const DataFilters = () => {
  const activeTab = useStore((state) => state.activeTab);
  const isRefreshingFiles = useStore((state) => state.isRefreshingFiles);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const clearSelection = useStore((state) => state.toggleClearSelection);
  const refreshFiles = useStore((state) => state.refreshFiles);
  const loadHeldFiles = useStore((state) => state.loadHeldFiles);
  const searchQuery = useStore((state) => state.searchQuery);
  const setSearchQuery = useStore((state) => state.setSearchQuery);
  const sortOrder = useStore((state) => state.sortOrder);
  const setSortOrder = useStore((state) => state.setSortOrder);
  const printTypeFilter = useStore((state) => state.printTypeFilter);
  const setPrintTypeFilter = useStore((state) => state.setPrintTypeFilter);

  const [sortOpen, setSortOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const sortRef = useRef(null);
  const typeRef = useRef(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClick = (e) => {
      if (!sortRef.current?.contains(e.target)) setSortOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sortOpen]);

  useEffect(() => {
    if (!typeOpen) return;
    const handleClick = (e) => {
      if (!typeRef.current?.contains(e.target)) setTypeOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeOpen]);

  const handleClick = (tab) => {
    setActiveTab(tab);
    clearSelection();
  };

  const handleRefresh = async () => {
    await loadHeldFiles();
    await refreshFiles({ clearSelection: true });
  };

  const activeSortOption = SORT_OPTIONS.find((o) => o.value === sortOrder) ?? SORT_OPTIONS[0];
  const ActiveSortIcon = activeSortOption.icon;
  const activePrintTypeOption = PRINT_TYPE_OPTIONS.find((o) => o.value === printTypeFilter) ?? PRINT_TYPE_OPTIONS[0];

  return (
    <div className={styles.filters_container}>
      <button
        onClick={() => handleClick("All")}
        className={`${styles.filter_button} ${activeTab === "All" ? styles.active : ""}`}
      >
        {activeTab === "All" ? <HiClipboardDocumentList /> : <HiOutlineClipboardDocumentList />}All
      </button>
      <button
        onClick={() => handleClick("Cottons")}
        className={`${styles.filter_button} ${activeTab === "Cottons" ? styles.active : ""}`}
      >
        {activeTab === "Cottons" ? <IoLeaf /> : <IoLeafOutline />}Cottons
      </button>
      <button
        onClick={() => handleClick("Polyesters")}
        className={`${styles.filter_button} ${activeTab === "Polyesters" ? styles.active : ""}`}
      >
        {activeTab === "Polyesters" ? <PiPolygonFill /> : <PiPolygon />}Polyesters
      </button>
      <div className={styles.filter_separator} />
      <div className={styles.sort_wrapper} ref={typeRef}>
        <button
          type="button"
          className={`${styles.filter_button} ${styles.type_button} ${printTypeFilter !== null ? styles.active : ""}`}
          onClick={() => setTypeOpen((v) => !v)}
        >
          <span className={styles.sort_btn_label}>
            <HiFunnel />
            {activePrintTypeOption.label}
          </span>
          <span className={styles.sort_chevron}>{typeOpen ? <HiChevronUp /> : <HiChevronDown />}</span>
        </button>
        {typeOpen && (
          <div className={`${styles.sort_dropdown} ${styles.type_dropdown}`}>
            {PRINT_TYPE_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                className={`${styles.sort_option} ${printTypeFilter === opt.value ? styles.sort_option_active : ""}`}
                onClick={() => {
                  setPrintTypeFilter(opt.value);
                  clearSelection();
                  setTypeOpen(false);
                }}
              >
                <span className={styles.sort_option_content}>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
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
        <div className={styles.sort_wrapper} ref={sortRef}>
          <button
            type="button"
            className={`${styles.filter_button} ${styles.sort_button} ${sortOrder !== null ? styles.active : ""}`}
            onClick={() => setSortOpen((v) => !v)}
          >
            <span className={styles.sort_btn_label}>
              <ActiveSortIcon />
              {activeSortOption.label}
            </span>
            <span className={styles.sort_chevron}>{sortOpen ? <HiChevronUp /> : <HiChevronDown />}</span>
          </button>
          {sortOpen && (
            <div className={styles.sort_dropdown}>
              {SORT_OPTIONS.map((opt) => {
                const OptIcon = opt.icon;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    className={`${styles.sort_option} ${sortOrder === opt.value ? styles.sort_option_active : ""}`}
                    onClick={() => {
                      setSortOrder(opt.value);
                      setSortOpen(false);
                    }}
                  >
                    <span className={styles.sort_option_content}>
                      <OptIcon />
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshingFiles}
          className={`${styles.filter_button} ${styles.refresh_button}`}
        >
          {isRefreshingFiles ? <span className={styles.spinner} /> : <HiArrowPath />}
          {isRefreshingFiles ? "Refreshing..." : "Refresh list"}
        </button>
      </div>
    </div>
  );
};

export default DataFilters;
