import { Button } from "@chakra-ui/react"
import styles from "./TableRefresh.module.css";
import { TbRefresh } from "react-icons/tb";


const TableRefresh = () => {
  return (
      <Button loading loadingText='Refreshing...' className={styles.refresh_btn}>
        Refresh
      </Button>
  )
}

export default TableRefresh;

// spinner={<BeatLoader size={8} color="white" />}
// loading loadingText="Saving..."