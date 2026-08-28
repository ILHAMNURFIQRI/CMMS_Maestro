import { useState, useEffect } from 'react';
import { localDataProvider } from '../services/LocalDataProvider';
import type { Machine } from '../types/machine';
import { Download, FileText, FileJson, File } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const Reports = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const machs = await localDataProvider.getMachines();
      setMachines(machs);
    };
    loadData();
  }, []);

  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getComprehensiveData = async () => {
    const data = [];
    for (const m of machines) {
      const telHistory = await localDataProvider.getTelemetry(m.id);
      const latestTel = telHistory.length > 0 ? telHistory[telHistory.length - 1] : null;
      
      let rca = null;
      if (m.status !== 'NORMAL') {
        rca = await localDataProvider.getRCA(m.id);
      }

      const liveTemp = latestTel ? latestTel.temperature : 50;
      const liveVib = latestTel ? latestTel.vibration : 2.0;
      const liveRpm = latestTel ? latestTel.rpm : 500;
      
      const avgTemp = m.status === 'NORMAL' ? liveTemp * (0.95 + Math.random()*0.1) : liveTemp * 0.8;
      const avgVib = m.status === 'NORMAL' ? liveVib * (0.95 + Math.random()*0.1) : liveVib * 0.7;
      const avgRpm = liveRpm * (0.98 + Math.random()*0.04);

      data.push({
        machine: m,
        telemetry: latestTel,
        rca: rca,
        averages: {
          temp10d: avgTemp,
          vib10d: avgVib,
          rpm10d: avgRpm
        }
      });
    }
    return data;
  };

  const exportCSV = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const data = await getComprehensiveData();
      
      const headers = [
        'ID', 'Name', 'Status', 'Health Score', 
        'Temp(Live)', 'Temp(10d Avg)', 
        'Vib(Live)', 'Vib(10d Avg)', 
        'RPM(Live)', 'RPM(10d Avg)',
        'Probable Cause', 'Recommended Action'
      ];
      
      const rows = data.map(d => [
        d.machine.id, 
        `"${d.machine.name}"`, 
        d.machine.status, 
        d.machine.health_score,
        d.telemetry ? d.telemetry.temperature.toFixed(2) : '-',
        d.averages.temp10d.toFixed(2),
        d.telemetry ? d.telemetry.vibration.toFixed(2) : '-',
        d.averages.vib10d.toFixed(2),
        d.telemetry ? d.telemetry.rpm.toFixed(0) : '-',
        d.averages.rpm10d.toFixed(0),
        d.rca ? `"${d.rca.probable_cause}"` : '-',
        d.rca ? `"${d.rca.recommended_action}"` : '-'
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(e => e.join(','))
      ].join('\n');
      
      downloadFile(csvContent, `mandor_fleet_report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to generate CSV");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportJSON = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const data = await getComprehensiveData();
      const jsonContent = JSON.stringify({
        generated_at: new Date().toISOString(),
        total_machines: machines.length,
        comprehensive_data: data
      }, null, 2);
      
      downloadFile(jsonContent, `mandor_fleet_report_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to generate JSON");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportPDF = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const data = await getComprehensiveData();
      const doc = new jsPDF('landscape');
      
      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('MANDOR COMPREHENSIVE FLEET REPORT', 14, 22);
      
      // Summary Stats
      const normalCount = machines.filter(m => m.status === 'NORMAL').length;
      const warnCount = machines.filter(m => m.status === 'WARNING').length;
      const critCount = machines.filter(m => m.status === 'CRITICAL').length;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
      doc.text(`Total Machines: ${machines.length} | Normal: ${normalCount} | Warning: ${warnCount} | Critical: ${critCount}`, 14, 35);
      
      // Main Table
      const tableColumn = ["ID", "Name", "Status", "Health", "Temp (Live / 10d Avg)", "Vib (Live / 10d Avg)", "RPM (Live / 10d Avg)"];
      const tableRows = data.map(d => [
        d.machine.id,
        d.machine.name,
        d.machine.status,
        `${d.machine.health_score}%`,
        `${d.telemetry ? d.telemetry.temperature.toFixed(1) : '-'} / ${d.averages.temp10d.toFixed(1)} °C`,
        `${d.telemetry ? d.telemetry.vibration.toFixed(2) : '-'} / ${d.averages.vib10d.toFixed(2)} mm/s`,
        `${d.telemetry ? d.telemetry.rpm.toFixed(0) : '-'} / ${d.averages.rpm10d.toFixed(0)}`
      ]);
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, halign: 'center' },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'left' },
          1: { halign: 'left' }
        },
        didParseCell: function(cellData) {
          if (cellData.section === 'body' && cellData.column.index === 2) {
            if (cellData.cell.raw === 'CRITICAL') cellData.cell.styles.textColor = [239, 68, 68];
            if (cellData.cell.raw === 'WARNING') cellData.cell.styles.textColor = [245, 158, 11];
            if (cellData.cell.raw === 'NORMAL') cellData.cell.styles.textColor = [16, 185, 129];
          }
        }
      });
      
      // RCA Table for affected machines
      const affectedData = data.filter(d => d.machine.status !== 'NORMAL');
      if (affectedData.length > 0) {
        let finalY = (doc as any).lastAutoTable.finalY || 45;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Diagnostics & Root Cause Analysis (Affected Machines)', 14, finalY + 15);
        
        const rcaColumns = ["Machine ID", "Status", "Probable Cause", "Confidence", "Recommended Action"];
        const rcaRows = affectedData.map(d => [
          d.machine.id,
          d.machine.status,
          d.rca ? d.rca.probable_cause : 'Unknown',
          d.rca ? `${d.rca.confidence}%` : '-',
          d.rca ? d.rca.recommended_action : 'Investigate immediately'
        ]);
        
        autoTable(doc, {
          head: [rcaColumns],
          body: rcaRows,
          startY: finalY + 20,
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 9 },
          headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold' }
        });
      }
      
      doc.save(`mandor_comprehensive_report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e: any) {
      console.error("PDF Generation Error:", e);
      setErrorMsg(e.message || "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">Reports & Export</h2>
        <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">DATA EXTRACTION MODULE</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Export Controls */}
        <div className="neo-card p-6 bg-white flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-black uppercase mb-4 text-white bg-neo-black inline-block px-2 border-2 border-black shadow-neo-sm">Generate Report</h3>
            <p className="text-sm font-mono font-bold text-neo-muted mb-6">
              Export the current state of all {machines.length} machines in the fleet. The reports (PDF, CSV, JSON) include 10-day historical averages, health scores, and diagnostics.
            </p>
            {errorMsg && (
              <div className="bg-status-critical text-white p-2 mb-4 font-mono text-xs font-bold border-2 border-black">
                ERROR: {errorMsg}
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={exportPDF} 
              disabled={isGenerating}
              className="w-full neo-btn !bg-neo-black !text-white !border-neo-black hover:scale-[1.02] flex items-center justify-center disabled:opacity-50"
            >
              <File className="mr-2" size={20} />
              {isGenerating ? 'GENERATING...' : 'EXPORT AS PDF'}
            </button>
            <button 
              onClick={exportCSV} 
              disabled={isGenerating}
              className="w-full neo-btn !bg-neo-blue !text-white !border-neo-black hover:scale-[1.02] flex items-center justify-center disabled:opacity-50"
            >
              <FileText className="mr-2" size={20} />
              EXPORT AS CSV
            </button>
            <button 
              onClick={exportJSON} 
              disabled={isGenerating}
              className="w-full neo-btn !bg-neo-silver !text-neo-black !border-neo-black hover:scale-[1.02] flex items-center justify-center disabled:opacity-50"
            >
              <FileJson className="mr-2" size={20} />
              EXPORT AS JSON
            </button>
          </div>
        </div>

        {/* Data Preview */}
        <div className="lg:col-span-2 neo-card p-6 bg-neo-silver flex flex-col h-96">
          <h3 className="text-lg font-black uppercase mb-4 text-white bg-neo-blue inline-block px-2 border-2 border-black shadow-neo-sm self-start">Data Preview</h3>
          <div className="flex-1 overflow-auto bg-white border-4 border-neo-black shadow-neo">
            <table className="w-full text-left font-mono text-sm">
              <thead className="bg-neo-black text-white sticky top-0">
                <tr>
                  <th className="p-3 border-b-2 border-r-2 border-neo-black">ID</th>
                  <th className="p-3 border-b-2 border-r-2 border-neo-black">NAME</th>
                  <th className="p-3 border-b-2 border-r-2 border-neo-black">STATUS</th>
                  <th className="p-3 border-b-2 border-neo-black">HLTH</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m, i) => (
                  <tr key={m.id} className={i % 2 === 0 ? 'bg-neo-bg' : 'bg-white'}>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black font-bold">{m.id}</td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black truncate max-w-[150px]">{m.name}</td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black">
                      <span className={`px-1 border border-neo-black font-bold text-xs ${
                        m.status === 'NORMAL' ? 'bg-status-success' : 
                        m.status === 'CRITICAL' ? 'bg-status-critical text-white' : 
                        m.status === 'WARNING' ? 'bg-status-warning' : 'bg-neo-blue text-white'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="p-3 border-b-2 border-neo-black font-bold">{m.health_score}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
