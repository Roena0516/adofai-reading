import { useEffect, useState } from 'react';
import { loadFiles } from './chart/loader';
import { ChartContext, useChartModel } from './chart/model';
import { DropScreen } from './components/DropScreen';
import { Header } from './components/Header';
import { Sidebar, SidebarHandle } from './components/Sidebar';
import { TimelineStrip } from './components/TimelineStrip';
import { Stage } from './components/Stage';
import { Transport } from './components/Transport';
import { useLevel } from './stores/level';
import { useSettings } from './stores/settings';

function useFileDrop(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void loadFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over;
}

export function App() {
  const model = useChartModel();
  const dragging = useFileDrop();
  const error = useLevel((s) => s.error);
  const loading = useLevel((s) => s.loading);
  const sidebarOpen = useSettings((s) => s.sidebarOpen);
  return (
    <div className="flex h-full flex-col">
      <Header />
      {model ? (
        <ChartContext.Provider value={model}>
          <TimelineStrip />
          <div className="relative flex min-h-0 flex-1">
            {sidebarOpen && <Sidebar />}
            <Stage />
            <SidebarHandle />
          </div>
          <Transport />
        </ChartContext.Provider>
      ) : (
        <DropScreen />
      )}
      {model && error && (
        <div className="fixed right-4 bottom-20 max-w-sm rounded-lg border border-wrong/30 bg-surface p-3 text-sm text-wrong shadow-xl">
          {error}
        </div>
      )}
      {(dragging || loading) && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent/60 px-10 py-8 text-lg font-medium text-accent-soft">
            {loading ? '레벨을 읽는 중…' : '놓으면 레벨을 엽니다'}
          </div>
        </div>
      )}
    </div>
  );
}
