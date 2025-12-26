'use client';

import { useRef } from 'react';
import ControlPanel from '@/components/ControlPanel';
import IframeManager from '@/components/IframeManager';

export default function Home() {
  const doubaoRef = useRef(null);
  const liblibRef = useRef(null);

  return (
    <main className="flex h-screen w-full overflow-hidden font-sans">
      {/* Left Panel: Controls */}
      <div className="w-[400px] min-w-[350px] border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto flex-shrink-0">
        <h1 className="text-xl font-bold mb-4 text-gray-800">Liblib 自动化工作台</h1>
        <ControlPanel doubaoRef={doubaoRef} liblibRef={liblibRef} />
      </div>
      
      {/* Right Panel: Iframes */}
      <div className="flex-1 bg-white relative">
        <IframeManager doubaoRef={doubaoRef} liblibRef={liblibRef} />
      </div>
    </main>
  );
}
