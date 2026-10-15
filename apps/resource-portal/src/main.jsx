import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./AuthProvider";
import { initAnalytics } from "./analytics";
import "./styles/tokens.css";
import "./styles/app.css";

initAnalytics();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
