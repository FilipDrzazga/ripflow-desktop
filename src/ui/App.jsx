import RipflowTable from "./components/Table/RipflowTable";
import Sidebar from "./components/Sidebar/Sidebar";

const App = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        padding: "20px",
        backgroundColor: "#eff1f5",
      }}
    >
      <Sidebar />
      <RipflowTable />
    </div>
  );
};

export default App;
