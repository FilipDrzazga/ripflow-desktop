import InboxBar from "../OverviewBars/InboxBar";
import PipelineBar from "../OverviewBars/PipelineBar";
import AlertsBar from "../OverviewBars/AlertsBar";

import styles from "./DataOverviewSection.module.css";

const DataOverviewSection = ({ onNavigate }) => {
  return (
    <div className={styles.carts_container}>
      <InboxBar />
      <PipelineBar onNavigate={onNavigate} />
      <AlertsBar onNavigate={onNavigate} />
    </div>
  );
};

export default DataOverviewSection;
