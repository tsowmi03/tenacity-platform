// A no-login preview of the portal for design work and screenshots. The real
// App runs against sample data: vite.harness.config.js swaps the backend,
// sign-in and analytics modules for the mocks in ./mocks. Never built for
// production. Add ?role=tutor to the URL for the tutor's view.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { AuthProvider } from "../src/AuthProvider";
import "../src/styles/tokens.css";
import "../src/styles/app.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
