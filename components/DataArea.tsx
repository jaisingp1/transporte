import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Machine } from '../types';
import ExcelJS from 'exceljs';
import { LayoutGrid, Table as TableIcon, Ship, MapPin, Anchor, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet } from 'lucide-react';

export type ViewMode = 'TABLE' | 'CARD' | undefined;

interface DataAreaProps {
  machines: Machine[];
  isLoading: boolean;
  sql: string | null;
  viewMode?: ViewMode;
}

const ITEMS_PER_PAGE = 10;

export const DataArea: React.FC<DataAreaProps> = ({ machines, isLoading, sql, viewMode: propViewMode }) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState< 'TABLE' | 'CARD'>('TABLE');
  const [sortColumn, setSortColumn] = useState<keyof Machine>('machine');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(0);
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

  // Set view mode based on prop or result count
  useEffect(() => {
    if (propViewMode) {
      setViewMode(propViewMode);
    } else if (machines.length === 1 && machines[0] && 'machine' in machines[0]) {
      setViewMode('CARD');
    } else {
      setViewMode('TABLE');
    }
  }, [machines, propViewMode]);

  const handleSort = (column: keyof Machine) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(0);
  };

  const sortedMachines = useMemo(() => {
    const sorted = [...machines].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal);
      }

      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [machines, sortColumn, sortDirection]);

  const paginatedMachines = useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE;
    return sortedMachines.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedMachines, currentPage]);

  const totalPages = Math.ceil(sortedMachines.length / ITEMS_PER_PAGE);

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

  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Machines');

    // Headers
    const headers = Object.entries(visibleColumns)
      .filter(([, visible]) => visible)
      .map(([key]) => t(`columns.${key}`));
    worksheet.addRow(headers);

    // Data
    sortedMachines.forEach(machine => {
      const row = Object.entries(visibleColumns)
        .filter(([, visible]) => visible)
        .map(([key]) => machine[key as keyof Machine]);
      worksheet.addRow(row);
    });

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'machines.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-epiroc-medium-grey flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-epiroc-grey">
            {t('data.total')}: <span className="text-epiroc-dark-blue font-bold">{machines.length}</span>
          </span>

          {totalPages > 1 && (
            <div className="flex items-center text-sm">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-2 py-1 rounded disabled:opacity-50 hover:bg-epiroc-light-grey"
              >
                &lt;
              </button>
              <span className="px-2 font-medium">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="px-2 py-1 rounded disabled:opacity-50 hover:bg-epiroc-light-grey"
              >
                &gt;
              </button>
            </div>
          )}
        </div>

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
          <button
            onClick={handleExport}
            className="text-xs font-semibold uppercase tracking-wider text-epiroc-grey hover:text-epiroc-dark-blue flex items-center gap-1"
          >
            <FileSpreadsheet size={14} />
            {t('data.export')}
          </button>

          <div className="flex bg-epiroc-light-grey rounded p-0.5">
            <button 
              onClick={() => setViewMode('CARD')}
              className={`p-1.5 rounded ${viewMode === 'CARD' ? 'bg-white shadow text-epiroc-yellow' : 'text-epiroc-grey'}`}
              title={t('data.cardView')}
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('TABLE')}
              className={`p-1.5 rounded ${viewMode === 'TABLE' ? 'bg-white shadow text-epiroc-yellow' : 'text-epiroc-grey'}`}
              title={t('data.tableView')}
            >
              <TableIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'TABLE' ? (
          <div className="bg-white rounded shadow overflow-hidden border border-epiroc-medium-grey">
            <table className="w-full text-sm text-left">
              <thead className="bg-epiroc-dark-blue text-white uppercase text-xs font-bold tracking-wider">
                <tr>
                  {Object.entries(visibleColumns).map(([key, visible]) => 
                    visible ? (
                      <th key={key} className="px-4 py-3 cursor-pointer" onClick={() => handleSort(key as keyof Machine)}>
                        <div className="flex items-center gap-2">
                          {t(`columns.${key}`)}
                          {sortColumn === key ? (
                            sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                          ) : (
                            <ArrowUpDown size={14} className="opacity-30" />
                          )}
                        </div>
                      </th>
                    ) : null
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-epiroc-light-grey">
                {paginatedMachines.map((machine, idx) => (
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
            {paginatedMachines.map((machine, idx) => (
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
