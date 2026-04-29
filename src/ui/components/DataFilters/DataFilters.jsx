import { useStore } from "../../store/useStore";
import { HiArrowPath, HiClipboardDocumentList, HiOutlineClipboardDocumentList } from "react-icons/hi2";
import { IoLeaf, IoLeafOutline } from "react-icons/io5";
import { PiPolygon, PiPolygonFill } from "react-icons/pi";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import styles from "./DataFilters.module.css";

const DataFilters = () => {
  const activeTab = useStore((state) => state.activeTab);
  const isRefreshingFiles = useStore((state) => state.isRefreshingFiles);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const clearSelection = useStore((state) => state.toggleClearSelection);
  const refreshFiles = useStore((state) => state.refreshFiles);
  const searchQuery = useStore((state) => state.searchQuery);
  const setSearchQuery = useStore((state) => state.setSearchQuery);

  const handleClick = (tab) => {
    setActiveTab(tab);
    clearSelection();
  };

  const handleRefresh = async () => {
    await refreshFiles({ clearSelection: true });
  };

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
      <div className={styles.right_group}>
        <div className={styles.search_wrapper}>
          <HiMagnifyingGlass className={styles.search_icon} />
          <input
            className={styles.search_input}
            type="text"
            placeholder="Search by order no. or customer..."
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
          <HiArrowPath className={isRefreshingFiles ? styles.spinning_icon : ""} />
          {isRefreshingFiles ? "Refreshing..." : "Refresh list"}
        </button>
      </div>
    </div>
  );
};

export default DataFilters;
