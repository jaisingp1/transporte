import React from 'react';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  currentView: 'app' | 'admin';
  onChangeView: (view: 'app' | 'admin') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onChangeView }) => {
  const { t, i18n } = useTranslation();

  return (
    <header className="h-16 bg-epiroc-dark-blue text-white flex items-center justify-between px-6 shadow-md shrink-0 z-50">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => onChangeView('app')}>
        <div className="w-8 h-8 bg-epiroc-yellow rounded-full flex items-center justify-center text-epiroc-dark-blue font-bold">
          E
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t('header.title')}</h1>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-epiroc-medium-grey uppercase">{t('header.lang')}</span>
          <select 
            className="bg-epiroc-grey text-white text-sm rounded px-2 py-1 border border-epiroc-dark-grey focus:outline-none focus:border-epiroc-yellow"
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="sv">Svenska</option>
          </select>
        </div>

        <nav className="flex bg-epiroc-grey rounded p-1">
          <button 
            onClick={() => onChangeView('app')}
            className={`px-4 py-1 text-sm rounded transition-colors ${currentView === 'app' ? 'bg-epiroc-yellow text-epiroc-dark-blue font-bold' : 'text-white hover:text-epiroc-yellow'}`}
          >
            {t('header.tracker')}
          </button>
          <button 
             onClick={() => onChangeView('admin')}
            className={`px-4 py-1 text-sm rounded transition-colors ${currentView === 'admin' ? 'bg-epiroc-yellow text-epiroc-dark-blue font-bold' : 'text-white hover:text-epiroc-yellow'}`}
          >
            {t('header.admin')}
          </button>
        </nav>
      </div>
    </header>
  );
};