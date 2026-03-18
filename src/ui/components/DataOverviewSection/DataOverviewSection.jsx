import ProductionOverviewCard from "./ProductionOverviewCard/ProductionOverviewCard";
import PrintMaterialBreakdownCard from "./PrintMaterialBreakdownCard/PrintMaterialBreakdownCard";

import styles from "./DataOverviewSection.module.css";

const DataOverviewSection = () => {
  return (
    <div className={styles.carts_container}>
      <ProductionOverviewCard />
      <PrintMaterialBreakdownCard />
    </div>
  );
};

export default DataOverviewSection;
