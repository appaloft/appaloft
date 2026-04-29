import { createRoot } from "react-dom/client";

function App() {
  return <main>React fixture ready</main>;
}

createRoot(document.querySelector("#root")).render(<App />);
