import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app/app";
import { Providers } from "./app/providers";
import "./app/globals.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing app root");

createRoot(root).render(
  <BrowserRouter>
    <Providers>
      <App />
    </Providers>
  </BrowserRouter>,
);
