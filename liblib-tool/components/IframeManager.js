'use client';

import { useState } from 'react';

export default function IframeManager({ doubaoRef, liblibRef }) {
  const [activeTab, setActiveTab] = useState('doubao');

  return (
    <div className="flex flex-col h-full w-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setActiveTab('doubao')}
          className={`px-6 py-2 text-sm font-medium ${
            activeTab === 'doubao'
              ? 'bg-white border-t-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Doubao (豆包)
        </button>
        <button
          onClick={() => setActiveTab('liblib')}
          className={`px-6 py-2 text-sm font-medium ${
            activeTab === 'liblib'
              ? 'bg-white border-t-2 border-purple-500 text-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Liblib.ai
        </button>
      </div>

      {/* Iframes Container */}
      <div className="flex-1 relative w-full h-full bg-gray-100">
        <iframe
          ref={doubaoRef}
          src="https://www.doubao.com/chat/"
          className={`absolute inset-0 w-full h-full border-none bg-white ${
            activeTab === 'doubao' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
          }`}
          title="Doubao"
        />
        <iframe
          ref={liblibRef}
          src="https://www.liblib.art/" 
          className={`absolute inset-0 w-full h-full border-none bg-white ${
            activeTab === 'liblib' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
          }`}
          title="Liblib"
        />
      </div>
    </div>
  );
}
