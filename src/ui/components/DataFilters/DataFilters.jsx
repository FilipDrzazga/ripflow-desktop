import { useStore } from "../../store/useStore";
import { HiArrowPath, HiClipboardDocumentList, HiOutlineClipboardDocumentList } from "react-icons/hi2";
import { IoLeaf, IoLeafOutline } from "react-icons/io5";
import { PiPolygon, PiPolygonFill } from "react-icons/pi";
import styles from "./DataFilters.module.css";

const DataFilters = () => {
  const store = useStore();

  const handleClick = (tab) => {
    store.setActiveTab(tab);
    store.toggleClearSelection();
  };

  const handleRefresh = async () => {
    await store.refreshFiles({ clearSelection: true });
  };

  return (
    <div className={styles.filters_container}>
      <button
        onClick={() => handleClick("All")}
        className={`${styles.filter_button} ${store.activeTab === "All" ? styles.active : ""}`}
      >
        {store.activeTab === "All" ? <HiClipboardDocumentList /> : <HiOutlineClipboardDocumentList />}All
      </button>
      <button
        onClick={() => handleClick("Cottons")}
        className={`${styles.filter_button} ${store.activeTab === "Cottons" ? styles.active : ""}`}
      >
        {store.activeTab === "Cottons" ? <IoLeaf /> : <IoLeafOutline />}Cottons
      </button>
      <button
        onClick={() => handleClick("Polyesters")}
        className={`${styles.filter_button} ${store.activeTab === "Polyesters" ? styles.active : ""}`}
      >
        {store.activeTab === "Polyesters" ? <PiPolygonFill /> : <PiPolygon />}Polyesters
      </button>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={store.isRefreshingFiles}
        className={`${styles.filter_button} ${styles.refresh_button}`}
      >
        <HiArrowPath className={store.isRefreshingFiles ? styles.spinning_icon : ""} />
        {store.isRefreshingFiles ? "Refreshing..." : "Refresh list"}
      </button>
    </div>
  );
};

export default DataFilters;
