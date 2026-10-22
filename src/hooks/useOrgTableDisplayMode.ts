import { useEffect, useState } from 'react';
import { useTenancy } from '../contexts';
import { orgService } from '../services/orgService';
import { OrganizationSettings } from '../types';

type TableDisplayMode = OrganizationSettings['tableDisplayMode'];

export function useOrgTableDisplayMode() {
  const { currentOrg } = useTenancy();
  const [mode, setMode] = useState<TableDisplayMode>(currentOrg?.settings.tableDisplayMode ?? 'table');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(currentOrg?.settings.tableDisplayMode ?? 'table');
  }, [currentOrg?.id, currentOrg?.settings.tableDisplayMode]);

  const updateMode = async (nextMode: TableDisplayMode) => {
    if (!currentOrg || nextMode === mode) return;

    const previousMode = mode;
    setMode(nextMode);
    setSaving(true);

    try {
      await orgService.updateSettings(currentOrg.id, {
        ...currentOrg.settings,
        tableDisplayMode: nextMode,
      });
    } catch (error) {
      console.error('Error saving table display mode:', error);
      setMode(previousMode);
    } finally {
      setSaving(false);
    }
  };

  return {
    tableDisplayMode: mode,
    setTableDisplayMode: updateMode,
    savingTableDisplayMode: saving,
  };
}
