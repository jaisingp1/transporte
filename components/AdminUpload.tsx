import React, { useCallback, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';

export const AdminUpload: React.FC = () => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File) => {
    setStatus('uploading');
    setErrorMessage('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData
      });

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        throw new Error("Server response was not JSON");
      }

      if (response.ok) {
        setStatus('success');
      } else {
        setErrorMessage(data.error || 'Upload failed');
        setStatus('error');
      }
    } catch (e: any) {
      console.error("Upload error:", e);
      setErrorMessage(e.message || 'Network error. Check console.');
      setStatus('error');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.xlsx')) {
      uploadFile(files[0]);
    } else {
      alert("Please upload only .xlsx files");
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-epiroc-light-grey p-8">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-epiroc-dark-blue mb-6">{t('admin.title')}</h2>
        
        <div 
          className={`border-4 border-dashed rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            isDragging ? 'border-epiroc-yellow bg-epiroc-yellow/10' : 'border-epiroc-medium-grey hover:border-epiroc-dark-grey'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept=".xlsx" 
            onChange={handleFileInput} 
          />
          
          {status === 'idle' && (
            <>
              <Upload size={48} className="text-epiroc-grey mb-4" />
              <p className="text-epiroc-dark-blue font-medium">{t('admin.dropzone')}</p>
            </>
          )}

          {status === 'uploading' && (
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-epiroc-yellow mb-4"></div>
              <p className="text-epiroc-dark-blue">{t('admin.uploading')}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center text-epiroc-green">
              <CheckCircle size={48} className="mb-4" />
              <p className="font-bold">{t('admin.success')}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); setStatus('idle'); }}
                className="mt-4 text-sm underline text-epiroc-grey"
              >
                Upload another
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center text-epiroc-red">
              <AlertCircle size={48} className="mb-4" />
              <p className="font-bold">{t('admin.error')}</p>
              {errorMessage && <p className="text-xs mt-1 max-w-md font-mono bg-red-50 p-1 rounded">{errorMessage}</p>}
              <button 
                onClick={(e) => { e.stopPropagation(); setStatus('idle'); }}
                className="mt-4 text-sm underline text-epiroc-grey"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 text-left bg-epiroc-light-grey p-4 rounded border border-epiroc-medium-grey">
          <h4 className="font-bold text-xs uppercase text-epiroc-grey mb-2">Requirements</h4>
          <ul className="text-sm space-y-1 text-epiroc-dark-blue">
            <li className="flex items-center gap-2"><FileSpreadsheet size={14}/> .xlsx files only</li>
            <li className="flex items-center gap-2"><CheckCircle size={14}/> First row (headers) is skipped automatically</li>
            <li className="flex items-center gap-2"><CheckCircle size={14}/> Columns A-K mapped strictly by position</li>
          </ul>
        </div>
      </div>
    </div>
  );
};