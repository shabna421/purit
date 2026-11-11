import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTenancy } from '../../contexts';
import { OrganizationSettings } from '../../types';
import {
  GstPeriodOption,
  getPeriodOptions,
  getDefaultPeriodKey,
  GstFilingReport,
  exportCompleteGstReportExcel,
  exportGstr1JsonFile,
} from '../../utils/gstUtils';
import { gstFilingService } from '../../services/gstFilingService';
import { GstProfileCard } from './GstProfileCard';
import { GstPeriodSelector } from './GstPeriodSelector';
import { GstWarningsPanel } from './GstWarningsPanel';
import { GstSummaryCards } from './GstSummaryCards';
import { GstGstr1Tab } from './GstGstr1Tab';
import { GstGstr3bTab } from './GstGstr3bTab';
import { GstFilingModal } from './GstFilingModal';
import { useNotifications } from '../../notifications';
import { FileSpreadsheet, Layers, ShieldCheck, AlertCircle, RefreshCw, BarChart2, CheckCircle2 } from 'lucide-react';

export const GstFilingHelper: React.FC = () => {
  const { currentOrg, updateCurrentOrgSettings } = useTenancy();
  const { success, error: notifyError } = useNotifications();

  const settings = currentOrg?.settings;
  const frequency = settings?.filingFrequency || 'monthly';

  // Periods list
  const periods = useMemo(() => getPeriodOptions(frequency), [frequency]);

  // Selected period key (defaults to previous month/quarter)
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>(() => {
    return getDefaultPeriodKey(frequency);
  });

  const selectedPeriod = useMemo(() => {
    return periods.find((p) => p.key === selectedPeriodKey) || periods[0];
  }, [periods, selectedPeriodKey]);

  // Report state
  const [report, setReport] = useState<GstFilingReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'gstr1' | 'gstr3b'>('summary');

  // Filing modal state
  const [isFilingModalOpen, setIsFilingModalOpen] = useState(false);

  // Fetch report
  const loadReport = useCallback(async () => {
    if (!currentOrg?.id || !selectedPeriod) return;
    setLoading(true);
    try {
      const data = await gstFilingService.fetchPeriodReport({
        orgId: currentOrg.id,
        periodOption: selectedPeriod,
        settings,
      });
      setReport(data);
    } catch (err: any) {
      console.error('Failed to compile GST filing report:', err);
      notifyError('Failed to load GST data for this period: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id, selectedPeriod, settings, notifyError]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Handle settings update
  const handleUpdateSettings = async (updated: Partial<OrganizationSettings>) => {
    if (!currentOrg) return;
    await updateCurrentOrgSettings(updated);
  };

  // Handle Mark as filed
  const handleSaveFiling = async (filingInfo: { filedAt: number; arn?: string; notes?: string }) => {
    if (!currentOrg || !settings || !selectedPeriodKey) return;
    try {
      const nextSettings = await gstFilingService.markPeriodAsFiled(
        currentOrg.id,
        settings,
        selectedPeriodKey,
        filingInfo
      );
      await updateCurrentOrgSettings(nextSettings);
      success(`Marked ${selectedPeriod?.label} as filed successfully`);
      loadReport();
    } catch (err: any) {
      console.error('Error marking as filed:', err);
      notifyError('Failed to update filing status: ' + (err.message || ''));
    }
  };

  // Handle Unmark as filed
  const handleUnmarkFiling = async () => {
    if (!currentOrg || !settings || !selectedPeriodKey) return;
    try {
      const nextSettings = await gstFilingService.unmarkPeriodAsFiled(
        currentOrg.id,
        settings,
        selectedPeriodKey
      );
      await updateCurrentOrgSettings(nextSettings);
      success(`Unmarked ${selectedPeriod?.label} as filed`);
      loadReport();
    } catch (err: any) {
      console.error('Error unmarking filed period:', err);
      notifyError('Failed to unmark: ' + (err.message || ''));
    }
  };

  // Export handlers
  const handleExportAllExcel = () => {
    if (!report) return;
    try {
      exportCompleteGstReportExcel(report);
      success('Exported complete multi-sheet GST Excel workbook');
    } catch (err: any) {
      console.error('Export error:', err);
      notifyError('Failed to export Excel file');
    }
  };

  const handleExportGstr1Json = () => {
    if (!report) return;
    try {
      const filename = `GSTR1_${report.businessGstin || 'PURIT'}_${report.periodKey}.json`;
      exportGstr1JsonFile(filename, report);
      success('Exported GSTR-1 JSON file in GST Offline Tool format');
    } catch (err: any) {
      console.error('JSON export error:', err);
      notifyError('Failed to export GSTR-1 JSON');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. GST Profile Card */}
      {settings && (
        <GstProfileCard
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />
      )}

      {/* 2. Period Selector & Global Actions Bar */}
      {selectedPeriod && (
        <GstPeriodSelector
          periods={periods}
          selectedPeriodKey={selectedPeriodKey}
          onSelectPeriod={setSelectedPeriodKey}
          frequency={frequency}
          isFiled={Boolean(report?.isFiled)}
          filingDetails={report?.filingDetails}
          onOpenFilingModal={() => setIsFilingModalOpen(true)}
          onExportAllExcel={handleExportAllExcel}
          onExportGstr1Json={handleExportGstr1Json}
          onRefresh={loadReport}
          loading={loading}
        />
      )}

      {/* 3. Validation Warnings Panel */}
      {report && (
        <GstWarningsPanel warnings={report.warnings} />
      )}

      {/* 4. Tab Navigation for Helper Views */}
      <div className="flex gap-2 rounded-2xl bg-zinc-100 p-1.5 overflow-x-auto shadow-2xs border border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-all ${
            activeTab === 'summary'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <BarChart2 className="w-4 h-4 text-orange-500" />
          <span>Dashboard & Rate Breakdown</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gstr1')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-all ${
            activeTab === 'gstr1'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          <span>GSTR-1 Outward Supplies</span>
          {report && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-bold">
              {report.summary.totalBillsCount} Invoices
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gstr3b')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-all ${
            activeTab === 'gstr3b'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>GSTR-3B Summary & Tax Payable</span>
        </button>
      </div>

      {/* 5. Main Content Area */}
      {loading ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-zinc-200 space-y-3">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-zinc-700">Compiling GST figures for {selectedPeriod?.label}...</p>
          <p className="text-xs text-zinc-400">Aggregating taxable values, state codes, and rate breakdowns</p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {activeTab === 'summary' && <GstSummaryCards report={report} />}
          {activeTab === 'gstr1' && <GstGstr1Tab report={report} />}
          {activeTab === 'gstr3b' && <GstGstr3bTab report={report} />}
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200 text-zinc-500">
          No data available for this tax period.
        </div>
      )}

      {/* 6. Mark as Filed Modal */}
      {selectedPeriod && (
        <GstFilingModal
          isOpen={isFilingModalOpen}
          onClose={() => setIsFilingModalOpen(false)}
          periodLabel={selectedPeriod.label}
          periodKey={selectedPeriodKey}
          isFiled={Boolean(report?.isFiled)}
          initialFilingDetails={report?.filingDetails}
          onSave={handleSaveFiling}
          onUnmark={handleUnmarkFiling}
        />
      )}
    </div>
  );
};
