import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App, { type Catalog } from "./App";
import "./style.css";
let initialCatalog: Catalog | undefined;
try { initialCatalog = JSON.parse(document.getElementById('public-catalog')?.textContent || 'null') || undefined; } catch { /* Use the empty state if saved public catalogue is invalid. */ }
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App initialCatalog={initialCatalog} />
    </BrowserRouter>
  </React.StrictMode>,
);
