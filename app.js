import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AddCustomer from "./pages/AddCustomer";
import AddSale from "./pages/AddSale";
import Pending from "./components/Pending";
import Reports from "./components/Reports";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/customers" element={<AddCustomer />} />
        <Route path="/add-sale" element={<AddSale />} />
        <Route path="/pending" element={<Pending />} />
        <Route path="/reports" element={<Reports />} />
      </Routes>
    </Router>
  );
}
