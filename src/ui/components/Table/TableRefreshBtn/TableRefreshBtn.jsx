import { useState } from "react";
import { Button } from "@chakra-ui/react";
import { LuRefreshCcw } from "react-icons/lu";
import { useStore } from "../../../store/useStore";
import styles from './TableRefreshBtn.module.css';

const TableRefreshBtn = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { setFolders } = useStore();

    const handleRefresh = () => {
        setIsLoading(true);
        console.log('loading...')
              const getFolders = async () => {
                const res = await window.api.readFolder();
                if (!res) {
                  setIsLoading(false);
                  return;
                }
                setFolders(res);
                setIsLoading(false);
                console.log('loaded')
              };
              getFolders();
    }

    return (
        <Button className={styles.button} loading={isLoading} onClick={handleRefresh}>
            <LuRefreshCcw/>
        </Button>
    )
}

export default TableRefreshBtn;