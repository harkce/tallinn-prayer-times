import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { TodayPage } from "./pages/TodayPage";
import { MonthPage } from "./pages/MonthPage";
import { useViewportInsets } from "./hooks/useViewportInsets";

export default function App() {
  useViewportInsets();
  const location = useLocation();
  const isMonth = location.pathname.startsWith("/month");

  useEffect(() => {
    document.documentElement.classList.toggle("month-page", isMonth);
    document.body.classList.toggle("month-page", isMonth);
    document.title = isMonth
      ? "This month · Prayer Times"
      : "Prayer Times";
  }, [isMonth]);

  return (
    <Routes>
      <Route path="/" element={<TodayPage />} />
      <Route path="/month" element={<MonthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
