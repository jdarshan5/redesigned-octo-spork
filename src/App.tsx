import React from "react";
import MidArea from "./components/MidArea.tsx";
import PreviewArea from "./components/PreviewArea.tsx";
import Sidebar from "./components/Sidebar.tsx";
import TopBar from "./components/TopBar.tsx";
import { DragProvider } from "./dnd/DragProvider.tsx";
import { StoreProvider } from "./state/store.tsx";

export default function App() {
  return (
    <StoreProvider>
      <DragProvider>
        <div className="min-h-screen lg:h-screen flex flex-col">
          <TopBar />
          <main className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3">
            <section className="card editor-card flex-none lg:flex-1 min-w-0 flex flex-col sm:flex-row overflow-hidden" aria-label="Code editor">
              <Sidebar />
              <MidArea />
            </section>
            <PreviewArea />
          </main>
        </div>
      </DragProvider>
    </StoreProvider>
  );
}
