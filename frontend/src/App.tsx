import { BrowserRouter, Routes, Route } from "react-router-dom";
import Box from "@mui/material/Box";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import EvidenceList from "./pages/EvidenceList";
import SubmitEvidence from "./pages/SubmitEvidence";
import SubmissionHistory from "./pages/SubmissionHistory";
import AgentRunner from "./pages/AgentRunner";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Box component="main" sx={{ maxWidth: 1200, mx: "auto", px: 3, py: 4 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/evidence" element={<EvidenceList />} />
          <Route path="/submit" element={<SubmitEvidence />} />
          <Route path="/history" element={<SubmissionHistory />} />
          <Route path="/agent" element={<AgentRunner />} />
        </Routes>
      </Box>
    </BrowserRouter>
  );
}
