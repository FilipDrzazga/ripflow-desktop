import ProductionOverviewCard from "./ProductionOverviewCard/ProductionOverviewCard";

import styles from "./DataOverviewSection.module.css";

const DataOverviewSection = () => {
  return (
    <div className={styles.carts_container}>
      <ProductionOverviewCard />
    </div>
  );
};

export default DataOverviewSection;
