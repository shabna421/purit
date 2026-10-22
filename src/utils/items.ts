import { Item } from '../types';

export function getItemDisplayName(item?: Item | null) {
  if (!item) return 'Unknown Item';
  return item.isDeleted ? `Deleted Item - ${item.name}` : item.name;
}

export function getItemSkuLabel(item?: Item | null) {
  if (!item?.sku) return 'NO-SKU';
  return item.sku;
}
