import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  es: {
    translation: {
      header: {
        title: "Monitor de Maquinaria Epiroc",
        admin: "Admin",
        tracker: "Rastreador",
        lang: "Idioma"
      },
      chat: {
        placeholder: "Escribe tu consulta aquí... (ej. ¿Dónde está la CT2?)",
        welcome: "Hola. Soy tu asistente logístico. Pregúntame sobre el estado, ubicación o detalles de las máquinas.",
        thinking: "Procesando...",
        error: "Hubo un error al procesar tu solicitud."
      },
      data: {
        noData: "No hay datos seleccionados",
        total: "Total encontrados",
        toggleCols: "Columnas",
        cardView: "Vista Ficha",
        tableView: "Vista Tabla"
      },
      columns: {
        machine: "Máquina",
        customs: "Aduana",
        eta_port: "ETA Puerto",
        eta_epiroc: "ETA Epiroc",
        ship: "Buque",
        status: "Estado",
        reference: "Referencia",
        pn: "Part Number",
        etd: "ETD",
        bl: "BL",
        division: "División"
      },
      admin: {
        title: "Administración de Datos",
        dropzone: "Arrastra tu archivo Excel (.xlsx) aquí o haz clic para seleccionar",
        uploading: "Subiendo...",
        success: "Base de datos actualizada correctamente.",
        error: "Error al actualizar. Verifica el formato o tu token.",
        tokenPlaceholder: "Ingresa Token de Admin"
      }
    }
  },
  en: {
    translation: {
      header: {
        title: "Epiroc Machine Tracker",
        admin: "Admin",
        tracker: "Tracker",
        lang: "Language"
      },
      chat: {
        placeholder: "Type your query here... (e.g., Where is the CT2?)",
        welcome: "Hello. I am your logistics assistant. Ask me about machine status, location, or details.",
        thinking: "Thinking...",
        error: "There was an error processing your request."
      },
      data: {
        noData: "No data selected",
        total: "Total found",
        toggleCols: "Columns",
        cardView: "Card View",
        tableView: "Table View"
      },
      columns: {
        machine: "Machine",
        customs: "Customs",
        eta_port: "ETA Port",
        eta_epiroc: "ETA Epiroc",
        ship: "Ship",
        status: "Status",
        reference: "Reference",
        pn: "Part Number",
        etd: "ETD",
        bl: "BL",
        division: "Division"
      },
      admin: {
        title: "Data Administration",
        dropzone: "Drag your Excel file (.xlsx) here or click to select",
        uploading: "Uploading...",
        success: "Database updated successfully.",
        error: "Update failed. Check format or token.",
        tokenPlaceholder: "Enter Admin Token"
      }
    }
  },
  pt: {
    translation: {
      header: {
        title: "Rastreador de Máquinas Epiroc",
        admin: "Admin",
        tracker: "Rastreador",
        lang: "Língua"
      },
      chat: {
        placeholder: "Digite sua consulta aqui... (ex: Onde está o CT2?)",
        welcome: "Olá. Sou seu assistente de logística. Pergunte-me sobre o status, localização ou detalhes das máquinas.",
        thinking: "Pensando...",
        error: "Ocorreu um erro ao processar sua solicitação."
      },
      data: {
        noData: "Nenhum dado selecionado",
        total: "Total encontrado",
        toggleCols: "Colunas",
        cardView: "Vista de Cartão",
        tableView: "Vista de Tabela"
      },
      columns: {
        machine: "Máquina",
        customs: "Alfândega",
        eta_port: "ETA Porto",
        eta_epiroc: "ETA Epiroc",
        ship: "Navio",
        status: "Status",
        reference: "Referência",
        pn: "Número da Peça",
        etd: "ETD",
        bl: "BL",
        division: "Divisão"
      },
      admin: {
        title: "Administração de Dados",
        dropzone: "Arraste seu arquivo Excel (.xlsx) aqui ou clique para selecionar",
        uploading: "Enviando...",
        success: "Banco de dados atualizado com sucesso.",
        error: "Falha na atualização. Verifique o formato ou token.",
        tokenPlaceholder: "Insira Token de Admin"
      }
    }
  },
  sv: {
    translation: {
      header: {
        title: "Epiroc Maskinspårare",
        admin: "Admin",
        tracker: "Spårare",
        lang: "Språk"
      },
      chat: {
        placeholder: "Skriv din fråga här... (t.ex. Var är CT2?)",
        welcome: "Hej. Jag är din logistikassistent. Fråga mig om maskinstatus, plats eller detaljer.",
        thinking: "Tänker...",
        error: "Det uppstod ett fel när din begäran behandlades."
      },
      data: {
        noData: "Inga data valda",
        total: "Totalt hittades",
        toggleCols: "Kolumner",
        cardView: "Kortvy",
        tableView: "Tabellvy"
      },
      columns: {
        machine: "Maskin",
        customs: "Tull",
        eta_port: "ETA Hamn",
        eta_epiroc: "ETA Epiroc",
        ship: "Fartyg",
        status: "Status",
        reference: "Referens",
        pn: "Artikelnummer",
        etd: "ETD",
        bl: "BL",
        division: "Division"
      },
      admin: {
        title: "Dataadministration",
        dropzone: "Dra din Excel-fil (.xlsx) hit eller klicka för att välja",
        uploading: "Laddar upp...",
        success: "Databasen uppdaterades framgångsrikt.",
        error: "Uppdateringen misslyckades. Kontrollera format eller token.",
        tokenPlaceholder: "Ange Admin Token"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "es", 
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;