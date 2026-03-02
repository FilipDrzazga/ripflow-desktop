import { useState } from "react";
import { useStore } from "../../store/useStore";
import { HiClipboardDocumentList, HiOutlineClipboardDocumentList } from "react-icons/hi2";
import { IoLeaf, IoLeafOutline } from "react-icons/io5";
import { PiPolygon, PiPolygonFill } from "react-icons/pi";
import styles from "./DataFilters.module.css";

const DataFilters = () => {
  const store = useStore();
  const [isActive, setIsActive] = useState("All");

  const handleClick = (e) => {
    const parentButton = e.target.closest("button");
    if (!parentButton) return;

    const buttonText = parentButton.innerText.trim();
    setIsActive(buttonText);

    const filteredFiles = store.files.filter((file) => {
      return file.items.filter((item) => item.materialType === buttonText).length > 0;
    });
    if (buttonText === "All") return store.setFilteredFiles(store.files);
    store.setFilteredFiles(filteredFiles);

    store.toggleClearSelection();
  };
  return (
    <div className={styles.filters_container}>
      <button
        onClick={(e) => handleClick(e)}
        className={`${styles.filter_button} ${isActive === "All" ? styles.active : ""}`}
      >
        {isActive === "All" ? <HiClipboardDocumentList /> : <HiOutlineClipboardDocumentList />}All
      </button>
      <button
        onClick={(e) => handleClick(e)}
        className={`${styles.filter_button} ${isActive === "Cottons" ? styles.active : ""}`}
      >
        {isActive === "Cottons" ? <IoLeaf /> : <IoLeafOutline />}Cottons
      </button>
      <button
        onClick={(e) => handleClick(e)}
        className={`${styles.filter_button} ${isActive === "Polyesters" ? styles.active : ""}`}
      >
        {isActive === "Polyesters" ? <PiPolygonFill /> : <PiPolygon />}Polyesters
      </button>
    </div>
  );
};

export default DataFilters;
