import { BrowserRouter, Routes, Route } from "react-router-dom";
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
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/evidence" element={<EvidenceList />} />
          <Route path="/submit" element={<SubmitEvidence />} />
          <Route path="/history" element={<SubmissionHistory />} />
          <Route path="/agent" element={<AgentRunner />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
