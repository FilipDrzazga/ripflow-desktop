import ProductionOverviewCard from "./ProductionOverviewCard/ProductionOverviewCard";
import PrintMaterialBreakdownCard from "./PrintMaterialBreakdownCard/PrintMaterialBreakdownCard";
import LastBatchCard from "../LastBatchCard/LastBatchCard";

import styles from "./DataOverviewSection.module.css";

const DataOverviewSection = () => {
  return (
    <div className={styles.carts_container}>
      <ProductionOverviewCard />
      <PrintMaterialBreakdownCard />
      <LastBatchCard />
    </div>
  );
};

export default DataOverviewSection;
