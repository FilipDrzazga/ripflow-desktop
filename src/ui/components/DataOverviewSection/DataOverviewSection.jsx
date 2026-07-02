import ProductionOverviewCard from "./ProductionOverviewCard/ProductionOverviewCard";
import PrintMaterialBreakdownCard from "./PrintMaterialBreakdownCard/PrintMaterialBreakdownCard";
import OverviewPanel from "../OverviewPanel/OverviewPanel";

import styles from "./DataOverviewSection.module.css";

const DataOverviewSection = ({ onNavigate }) => {
  return (
    <div className={styles.carts_container}>
      <ProductionOverviewCard />
      <PrintMaterialBreakdownCard />
      <OverviewPanel onNavigate={onNavigate} />
    </div>
  );
};

export default DataOverviewSection;
