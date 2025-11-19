import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Machine } from '../types';
import { LayoutGrid, Table as TableIcon, Ship, MapPin, Anchor } from 'lucide-react';

interface DataAreaProps {
  machines: Machine[];
  isLoading: boolean;
  sql: string | null;
}

export const DataArea: React.FC<DataAreaProps> = ({ machines, isLoading, sql }) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [visibleColumns, setVisibleColumns] = useState({
    machine: true,
    customs: true,
    eta_port: true,
    eta_epiroc: true,
    ship: true,
    status: true,
    reference: false,
    pn: false,
    etd: false,
    bl: false,
    division: false
  });

  // Auto-switch view mode based on result count
  useEffect(() => {
    if (machines.length === 1) {
      setViewMode('card');
    } else if (machines.length > 1) {
      setViewMode('table');
    }
  }, [machines]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-epiroc-light-grey">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-epiroc-yellow"></div>
      </div>
    );
  }

  if (machines.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-epiroc-light-grey text-epiroc-grey">
        <Ship size={64} className="mb-4 opacity-20" />
        <p className="text-lg font-light">{t('data.noData')}</p>
      </div>
    );
  }

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-epiroc-medium-grey flex items-center justify-between px-4">
        <span className="text-sm font-medium text-epiroc-grey">
          {t('data.total')}: <span className="text-epiroc-dark-blue font-bold">{machines.length}</span>
        </span>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <button className="text-xs font-semibold uppercase tracking-wider text-epiroc-grey hover:text-epiroc-dark-blue flex items-center gap-1">
              {t('data.toggleCols')}
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-epiroc-medium-grey shadow-xl rounded z-50 hidden group-hover:block p-2">
              {Object.keys(visibleColumns).map(col => (
                <label key={col} className="flex items-center gap-2 p-1 hover:bg-epiroc-light-grey rounded cursor-pointer text-sm">
                  <input 
                    type="checkbox" 
                    checked={visibleColumns[col as keyof typeof visibleColumns]} 
                    onChange={() => toggleColumn(col as keyof typeof visibleColumns)}
                    className="rounded text-epiroc-yellow focus:ring-epiroc-yellow"
                  />
                  {t(`columns.${col}`)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex bg-epiroc-light-grey rounded p-0.5">
            <button 
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded ${viewMode === 'card' ? 'bg-white shadow text-epiroc-yellow' : 'text-epiroc-grey'}`}
              title={t('data.cardView')}
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-epiroc-yellow' : 'text-epiroc-grey'}`}
              title={t('data.tableView')}
            >
              <TableIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'table' ? (
          <div className="bg-white rounded shadow overflow-hidden border border-epiroc-medium-grey">
            <table className="w-full text-sm text-left">
              <thead className="bg-epiroc-dark-blue text-white uppercase text-xs font-bold tracking-wider">
                <tr>
                  {Object.entries(visibleColumns).map(([key, visible]) => 
                    visible ? <th key={key} className="px-4 py-3">{t(`columns.${key}`)}</th> : null
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-epiroc-light-grey">
                {machines.map((machine, idx) => (
                  <tr key={idx} className="hover:bg-epiroc-light-grey transition-colors">
                    {Object.entries(visibleColumns).map(([key, visible]) => 
                      visible ? (
                        <td key={key} className="px-4 py-3 border-r border-transparent last:border-0">
                          {key === 'status' ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              machine.status?.toLowerCase().includes('transito') ? 'bg-epiroc-electric-green text-epiroc-dark-green' :
                              machine.status?.toLowerCase().includes('entregada') ? 'bg-epiroc-light-grey text-epiroc-grey' :
                              'bg-epiroc-yellow text-epiroc-dark-blue'
                            }`}>
                              {machine[key as keyof Machine] || '-'}
                            </span>
                          ) : (
                            machine[key as keyof Machine] || '-'
                          )}
                        </td>
                      ) : null
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {machines.map((machine, idx) => (
              <div key={idx} className="bg-white rounded-lg border border-epiroc-medium-grey shadow-sm hover:shadow-md transition-shadow p-0 overflow-hidden">
                <div className="bg-epiroc-dark-blue text-white px-4 py-3 flex justify-between items-center">
                  <h3 className="font-bold truncate">{machine.machine}</h3>
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded">{machine.division || 'N/A'}</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Ship size={16} className="text-epiroc-yellow mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-epiroc-grey uppercase">{t('columns.ship')}</p>
                      <p className="font-medium text-sm">{machine.ship || '-'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-start gap-2">
                      <Anchor size={16} className="text-epiroc-light-blue mt-1 shrink-0" />
                      <div>
                        <p className="text-xs text-epiroc-grey uppercase">{t('columns.eta_port')}</p>
                        <p className="font-medium text-sm">{machine.eta_port || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin size={16} className="text-epiroc-green mt-1 shrink-0" />
                      <div>
                        <p className="text-xs text-epiroc-grey uppercase">{t('columns.eta_epiroc')}</p>
                        <p className="font-medium text-sm">{machine.eta_epiroc || '-'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-epiroc-light-grey pt-2 mt-2">
                    <p className="text-xs text-epiroc-grey uppercase mb-1">{t('columns.status')}</p>
                    <span className={`block w-full text-center py-1 rounded text-sm font-bold ${
                       machine.status?.toLowerCase().includes('transito') ? 'bg-epiroc-electric-green text-epiroc-dark-green' : 'bg-epiroc-light-grey text-epiroc-grey'
                    }`}>
                      {machine.status || '-'}
                    </span>
                  </div>

                  {/* Collapsible extra details for Card */}
                  <div className="text-xs text-epiroc-grey space-y-1 pt-2">
                    <div className="flex justify-between"><span>{t('columns.reference')}:</span> <span>{machine.reference || '-'}</span></div>
                    <div className="flex justify-between"><span>{t('columns.pn')}:</span> <span>{machine.pn || '-'}</span></div>
                    <div className="flex justify-between"><span>{t('columns.customs')}:</span> <span>{machine.customs || '-'}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};