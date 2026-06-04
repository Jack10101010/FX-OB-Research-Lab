import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SessionLabPage from "@/pages/SessionLab/SessionLabPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/session-lab" replace />} />
          <Route path="/session-lab" element={<SessionLabPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
