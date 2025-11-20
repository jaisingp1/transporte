import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatArea } from './components/ChatArea';
import { DataArea, ViewMode } from './components/DataArea';
import { AdminUpload } from './components/AdminUpload';
import { Header } from './components/Header';
import { Machine } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<'app' | 'admin'>('app');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSql, setCurrentSql] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>();

  // Shared state for data interaction
  const handleQuerySuccess = (data: Machine[], sql: string | null, view?: 'TABLE' | 'CARD') => {
    setMachines(data);
    setCurrentSql(sql);
    setViewMode(view);
  };

  return (
    <div className="min-h-screen bg-epiroc-light-grey flex flex-col text-epiroc-dark-blue overflow-hidden">
      <Header 
        currentView={view} 
        onChangeView={setView} 
      />

      <main className="flex-1 flex overflow-hidden relative">
        {view === 'admin' ? (
          <AdminUpload />
        ) : (
          <div className="flex w-full h-full">
            {/* Left: Chat (33%) */}
            <div className="w-1/3 border-r border-epiroc-medium-grey bg-white flex flex-col shadow-lg z-10 overflow-hidden">
              <ChatArea 
                onQuerySuccess={handleQuerySuccess}
                setIsLoading={setIsLoading}
              />
            </div>

            {/* Right: Data (67%) */}
            <div className="w-2/3 bg-epiroc-light-grey relative overflow-hidden flex flex-col">
               <DataArea 
                 machines={machines} 
                 isLoading={isLoading} 
                 sql={currentSql}
                 viewMode={viewMode}
               />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;