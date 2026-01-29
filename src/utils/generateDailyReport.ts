import html2pdf from 'html2pdf.js';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Professional {
  id: string;
  name: string;
  role: string;
}

interface Appointment {
  id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  description?: string;
  type?: 'appointment' | 'absence';
  contacts?: {
    push_name?: string;
    number?: string;
  };
  contact_name?: string;
  contact_phone?: string;
  products_services?: {
    name?: string;
  };
  service_name?: string;
}

const getStatusInfo = (status: string): { label: string; color: string; borderColor: string; textColor: string } => {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmado',
        color: '#E9D5FF',
        borderColor: '#A855F7',
        textColor: '#7C3AED'
      };
    case 'rescheduled':
      return {
        label: 'Reagendado',
        color: '#FEF3C7',
        borderColor: '#F59E0B',
        textColor: '#D97706'
      };
    case 'completed':
      return {
        label: 'Concluído',
        color: '#D1FAE5',
        borderColor: '#10B981',
        textColor: '#059669'
      };
    case 'canceled':
      return {
        label: 'Cancelado',
        color: '#FEE2E2',
        borderColor: '#EF4444',
        textColor: '#DC2626'
      };
    case 'pending':
    default:
      return {
        label: 'Pendente',
        color: '#DBEAFE',
        borderColor: '#3B82F6',
        textColor: '#2563EB'
      };
  }
};

const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Format Brazilian phone number
  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }

  return phone;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

export const generateDailyReport = async (
  date: Date,
  professionals: Professional[],
  appointments: Appointment[]
) => {
  // Filter appointments: only type='appointment' (no absences)
  const validAppointments = appointments.filter(apt => apt.type !== 'absence');

  // Group appointments by professional
  const appointmentsByProfessional = new Map<string, Appointment[]>();

  validAppointments.forEach(apt => {
    const existing = appointmentsByProfessional.get(apt.professional_id) || [];
    appointmentsByProfessional.set(apt.professional_id, [...existing, apt]);
  });

  // Filter professionals who have appointments and sort alphabetically
  const professionalsWithAppointments = professionals
    .filter(prof => appointmentsByProfessional.has(prof.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Sort appointments by start time for each professional
  professionalsWithAppointments.forEach(prof => {
    const apts = appointmentsByProfessional.get(prof.id) || [];
    apts.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  // Generate formatted date
  const formattedDate = format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  // Build HTML content
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório Diário - ${format(date, 'dd/MM/yyyy')}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #FFFFFF;
          color: #000000;
          padding: 20px;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 3px solid #000000;
        }
        
        .header h1 {
          font-size: 16.8pt;
          font-weight: bold;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .header .date {
          font-size: 11.9pt;
          color: #333333;
          font-weight: 500;
        }
        
        .professional-section {
          margin-bottom: 30px;
          page-break-inside: avoid;
        }
        
        .professional-header {
          background: #F3F4F6;
          padding: 12px 15px;
          border-left: 5px solid #1F2937;
          margin-bottom: 15px;
        }
        
        .professional-name {
          font-size: 16pt;
          font-weight: bold;
          color: #000000;
        }
        
        .professional-role {
          font-size: 11pt;
          color: #4B5563;
          margin-top: 4px;
        }
        
        .appointment-card {
          margin-bottom: 12px;
          padding: 15px;
          border: 2px solid;
          border-radius: 8px;
          page-break-inside: avoid;
        }
        
        .appointment-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        
        .appointment-time {
          font-size: 14pt;
          font-weight: bold;
          color: #000000;
        }
        
        .appointment-status {
          font-size: 11pt;
          font-weight: bold;
          padding: 4px 12px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.7);
        }
        
        .appointment-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        
        .info-item {
          display: flex;
          flex-direction: column;
        }
        
        .info-label {
          font-size: 9pt;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 3px;
          font-weight: 600;
        }
        
        .info-value {
          font-size: 11pt;
          color: #000000;
          font-weight: 500;
        }
        
        .info-value.large {
          font-size: 12pt;
          font-weight: bold;
        }
        
        .empty-message {
          text-align: center;
          padding: 40px;
          color: #6B7280;
          font-size: 12pt;
          font-style: italic;
        }
        
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          padding-bottom: 15px;
          border-top: 2px solid #E5E7EB;
          text-align: center;
          color: #6B7280;
          font-size: 9pt;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 Relatório Diário de Agendamentos</h1>
        <div class="date">${capitalizedDate}</div>
      </div>
      
      ${professionalsWithAppointments.length === 0 ? `
        <div class="empty-message">
          Nenhum agendamento encontrado para esta data.
        </div>
      ` : professionalsWithAppointments.map(prof => {
    const apts = appointmentsByProfessional.get(prof.id) || [];

    return `
          <div class="professional-section">
            <div class="professional-header">
              <div class="professional-name">👤 ${prof.name}</div>
              ${prof.role ? `<div class="professional-role">${prof.role}</div>` : ''}
            </div>
            
            ${apts.map(apt => {
      const statusInfo = getStatusInfo(apt.status);
      const clientName = apt.contacts?.push_name || apt.contact_name || 'Cliente não identificado';
      const clientPhone = apt.contacts?.number || apt.contact_phone || 'Não informado';
      const serviceName = apt.products_services?.name || apt.service_name || 'Serviço não especificado';
      const startTime = format(new Date(apt.start_time), 'HH:mm');
      const endTime = format(new Date(apt.end_time), 'HH:mm');
      const price = formatCurrency(apt.price || 0);

      return `
                <div class="appointment-card" style="background: ${statusInfo.color}; border-color: ${statusInfo.borderColor};">
                  <div class="appointment-header">
                    <div class="appointment-time">🕐 ${startTime} - ${endTime}</div>
                    <div class="appointment-status" style="color: ${statusInfo.textColor};">
                      ${statusInfo.label}
                    </div>
                  </div>
                  
                  <div class="appointment-info">
                    <div class="info-item">
                      <div class="info-label">Cliente</div>
                      <div class="info-value large">${clientName}</div>
                    </div>
                    
                    <div class="info-item">
                      <div class="info-label">Telefone</div>
                      <div class="info-value">${formatPhoneNumber(clientPhone)}</div>
                    </div>
                    
                    <div class="info-item">
                      <div class="info-label">Serviço</div>
                      <div class="info-value">${serviceName}</div>
                    </div>
                    
                    <div class="info-item">
                      <div class="info-label">Valor</div>
                      <div class="info-value large">${price}</div>
                    </div>
                    
                    ${apt.description ? `
                      <div class="info-item" style="grid-column: 1 / -1;">
                        <div class="info-label">Observações</div>
                        <div class="info-value">${apt.description}</div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        `;
  }).join('')}
      
      <div class="footer">
        Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
      </div>
    </body>
    </html>
  `;

  // Configure html2pdf options
  const opt = {
    margin: [15, 15, 25, 15] as [number, number, number, number], // top, right, bottom, left - increased bottom margin
    filename: `relatorio-diario-${format(date, 'yyyy-MM-dd')}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      logging: false
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait' as const
    }
  };

  // Generate and download PDF
  const element = document.createElement('div');
  element.innerHTML = htmlContent;

  try {
    await html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Falha ao gerar o PDF. Por favor, tente novamente.');
  }
};
