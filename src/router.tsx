import { createBrowserRouter } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "./pages/Home";
import Callback from "./pages/Callback";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <>
        <Home />
        <Toaster />
      </>
    ),
  },
  {
    path: "/callback",
    element: <Callback />,
  },
]);