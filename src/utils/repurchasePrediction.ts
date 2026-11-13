import { Sale, Item } from '../types';
import { startOfDay, format, isSameDay } from 'date-fns';

export type RepurchaseStatus = 'upcoming' | 'due_today' | 'overdue' | 'insufficient_history';
export type PredictionConfidence = 'none' | 'initial' | 'moderate' | 'high';

export interface PurchaseCycle {
  cycleIndex: number;
  fromDate: number;
  toDate: number;
  previousQuantity: number;
  intervalDays: number;
  dailyConsumption: number;
}

export interface ProductRepurchasePrediction {
  itemId: string;
  itemName: string;
  unit: string;
  categoryId?: string;
  sku?: string;

  // Historical counts & totals
  totalPurchasesCount: number;
  distinctPurchaseDatesCount: number;
  completedCyclesCount: number;
  totalQuantityConsumed: number;
  totalCycleDays: number;

  // Cycle details for breakdown
  cycles: PurchaseCycle[];

  // Step 2: Average Daily Consumption
  averageDailyConsumption: number | null; // Quantity per day

  // Step 3: Latest purchase & Next order prediction
  lastPurchaseDate: number;
  lastPurchaseQuantity: number;
  estimatedDaysToNextPurchase: number | null;
  predictedNextPurchaseDate: number | null;

  // Step 4: Dynamic Status Tracking
  status: RepurchaseStatus;
  statusLabel: string;
  daysRemaining: number | null; // e.g. 8 for "Next Order in 8 Days"
  overdueDays: number | null;   // e.g. 10 for "10 Days Overdue"

  // Confidence rating
  confidence: PredictionConfidence;
  confidenceLabel: string;
}

export interface CustomerRepurchaseSummary {
  customerId: string;
  customerName?: string;
  predictions: ProductRepurchasePrediction[];
  totalTrackedProducts: number;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  insufficientHistoryCount: number;
  hasUrgentRepurchases: boolean;
}

interface RawPurchaseEvent {
  timestamp: number;
  quantity: number;
  saleId: string;
}

interface DailyAggregatedPurchase {
  dateKey: string; // YYYY-MM-DD
  timestamp: number; // start of day timestamp
  exactLatestTimestamp: number;
  totalQuantity: number;
  salesCount: number;
}

/**
 * Calculates rolling repurchase predictions for all products purchased by a customer.
 * 
 * Algorithm:
 * Step 1: Sort successful purchase records by purchase date and group same-day purchases.
 * Step 2: Calculate daily consumption for each completed cycle:
 *         Daily Consumption = Previous Purchase Quantity / Days Between Purchases.
 *         Average Daily Consumption = Total Previous Quantities Consumed / Total Completed Cycle Days.
 * Step 3: Predict next order:
 *         Estimated Days to Next Purchase = Latest Purchase Quantity / Average Daily Consumption.
 *         Predicted Next Purchase Date = Latest Purchase Date + Estimated Days to Next Purchase.
 * Step 4: Compare predicted date with referenceDate (today):
 *         Upcoming (Green), Due Today (Amber), Overdue (Red), Insufficient History (Grey).
 */
export function calculateRepurchasePredictions(
  sales: Sale[],
  productCatalog: Map<string, Item>,
  customerId: string,
  referenceDate: Date = new Date()
): CustomerRepurchaseSummary {
  // 1. Filter completed, non-cancelled sales for this specific customer
  const validSales = sales.filter(
    (sale) => sale.customerId === customerId && sale.status !== 'cancelled'
  );

  // 2. Extract purchase events per product
  const productEventsMap = new Map<string, RawPurchaseEvent[]>();

  for (const sale of validSales) {
    if (!sale.items || !Array.isArray(sale.items)) continue;
    const saleTimestamp = sale.timestamp;

    for (const line of sale.items) {
      if (!line.itemId) continue;
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) continue;

      let events = productEventsMap.get(line.itemId);
      if (!events) {
        events = [];
        productEventsMap.set(line.itemId, events);
      }
      events.push({
        timestamp: saleTimestamp,
        quantity: qty,
        saleId: sale.id,
      });
    }
  }

  const todayStart = startOfDay(referenceDate).getTime();
  const predictions: ProductRepurchasePrediction[] = [];

  // 3. Process each product independently
  for (const [itemId, rawEvents] of productEventsMap.entries()) {
    const item = productCatalog.get(itemId);
    const itemName = item?.name || `Product #${itemId.slice(-6).toUpperCase()}`;
    const unit = item?.unit || 'Unit';
    const categoryId = item?.categoryId;
    const sku = item?.sku;

    // Sort events chronologically (earliest to latest)
    rawEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Group purchases occurring on the same calendar day
    const dailyMap = new Map<string, DailyAggregatedPurchase>();
    for (const ev of rawEvents) {
      const dateKey = format(new Date(ev.timestamp), 'yyyy-MM-dd');
      const dayStartTs = startOfDay(new Date(ev.timestamp)).getTime();

      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.totalQuantity += ev.quantity;
        existing.salesCount += 1;
        if (ev.timestamp > existing.exactLatestTimestamp) {
          existing.exactLatestTimestamp = ev.timestamp;
        }
      } else {
        dailyMap.set(dateKey, {
          dateKey,
          timestamp: dayStartTs,
          exactLatestTimestamp: ev.timestamp,
          totalQuantity: ev.quantity,
          salesCount: 1,
        });
      }
    }

    const dailyPurchases = Array.from(dailyMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    const totalPurchasesCount = rawEvents.length;
    const distinctPurchaseDatesCount = dailyPurchases.length;
    const lastDailyPurchase = dailyPurchases[dailyPurchases.length - 1];
    const lastPurchaseDate = lastDailyPurchase.exactLatestTimestamp;
    const lastPurchaseQuantity = lastDailyPurchase.totalQuantity;

    // Step 1 Check: Insufficient History if fewer than 2 distinct purchase dates
    if (distinctPurchaseDatesCount < 2) {
      predictions.push({
        itemId,
        itemName,
        unit,
        categoryId,
        sku,
        totalPurchasesCount,
        distinctPurchaseDatesCount,
        completedCyclesCount: 0,
        totalQuantityConsumed: 0,
        totalCycleDays: 0,
        cycles: [],
        averageDailyConsumption: null,
        lastPurchaseDate,
        lastPurchaseQuantity,
        estimatedDaysToNextPurchase: null,
        predictedNextPurchaseDate: null,
        status: 'insufficient_history',
        statusLabel: 'Insufficient History',
        daysRemaining: null,
        overdueDays: null,
        confidence: 'none',
        confidenceLabel: 'Need 2+ Purchases',
      });
      continue;
    }

    // Step 1: Calculate purchase intervals between consecutive purchases
    // For each completed purchase cycle:
    // Cycle i starts at dailyPurchases[i] and completes at dailyPurchases[i+1].
    // Days Between Purchases = (timestamp[i+1] - timestamp[i]) in whole days (minimum 1 day).
    // Previous Purchase Quantity = quantity purchased at dailyPurchases[i].
    const cycles: PurchaseCycle[] = [];
    let totalQuantityConsumed = 0;
    let totalCycleDays = 0;

    for (let i = 0; i < dailyPurchases.length - 1; i++) {
      const prevPurchase = dailyPurchases[i];
      const nextPurchase = dailyPurchases[i + 1];

      const diffMs = nextPurchase.timestamp - prevPurchase.timestamp;
      // Calculate whole calendar days elapsed
      const intervalDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      const dailyConsumption = prevPurchase.totalQuantity / intervalDays;

      cycles.push({
        cycleIndex: i + 1,
        fromDate: prevPurchase.exactLatestTimestamp,
        toDate: nextPurchase.exactLatestTimestamp,
        previousQuantity: prevPurchase.totalQuantity,
        intervalDays,
        dailyConsumption,
      });

      totalQuantityConsumed += prevPurchase.totalQuantity;
      totalCycleDays += intervalDays;
    }

    // Step 2: Calculate weighted average daily consumption
    // Average Daily Consumption = Total Previous Quantities Consumed / Total Completed Cycle Days
    if (totalCycleDays <= 0 || totalQuantityConsumed <= 0) {
      predictions.push({
        itemId,
        itemName,
        unit,
        categoryId,
        sku,
        totalPurchasesCount,
        distinctPurchaseDatesCount,
        completedCyclesCount: cycles.length,
        totalQuantityConsumed: 0,
        totalCycleDays: 0,
        cycles,
        averageDailyConsumption: null,
        lastPurchaseDate,
        lastPurchaseQuantity,
        estimatedDaysToNextPurchase: null,
        predictedNextPurchaseDate: null,
        status: 'insufficient_history',
        statusLabel: 'Insufficient History',
        daysRemaining: null,
        overdueDays: null,
        confidence: 'none',
        confidenceLabel: 'Need More Cycles',
      });
      continue;
    }

    const averageDailyConsumption = totalQuantityConsumed / totalCycleDays;

    // Step 3: Predict the next order
    // Estimated Days to Next Purchase = Latest Purchase Quantity / Average Daily Consumption
    // Predicted Next Purchase Date = Latest Purchase Date + Estimated Days to Next Purchase
    const estimatedDaysToNextPurchase = Math.max(
      1,
      Math.round(lastPurchaseQuantity / averageDailyConsumption)
    );

    // Date addition: add whole calendar days to the latest purchase start of day
    const latestStartDay = lastDailyPurchase.timestamp;
    const predictedNextPurchaseDate = latestStartDay + (estimatedDaysToNextPurchase * 24 * 60 * 60 * 1000);

    // Step 4: Dynamic Status Tracking
    // Compare today's date with predicted next purchase date (date-only comparison)
    const predictedStartDay = startOfDay(new Date(predictedNextPurchaseDate)).getTime();
    const diffDays = Math.round((predictedStartDay - todayStart) / (1000 * 60 * 60 * 24));

    let status: RepurchaseStatus;
    let statusLabel: string;
    let daysRemaining: number | null = null;
    let overdueDays: number | null = null;

    if (diffDays > 0) {
      status = 'upcoming';
      daysRemaining = diffDays;
      statusLabel = diffDays === 1 ? 'Next Order in 1 Day' : `Next Order in ${diffDays} Days`;
    } else if (diffDays === 0) {
      status = 'due_today';
      daysRemaining = 0;
      statusLabel = 'Due Today';
    } else {
      status = 'overdue';
      overdueDays = Math.abs(diffDays);
      statusLabel = overdueDays === 1 ? '1 Day Overdue' : `${overdueDays} Days Overdue`;
    }

    // Confidence determination
    const completedCyclesCount = cycles.length;
    let confidence: PredictionConfidence = 'initial';
    let confidenceLabel = `Based on ${completedCyclesCount} cycle${completedCyclesCount === 1 ? '' : 's'}`;

    if (completedCyclesCount === 1) {
      confidence = 'initial';
      confidenceLabel = 'Initial (1 cycle)';
    } else if (completedCyclesCount >= 2 && completedCyclesCount <= 4) {
      confidence = 'moderate';
      confidenceLabel = `Moderate (${completedCyclesCount} cycles)`;
    } else if (completedCyclesCount >= 5) {
      confidence = 'high';
      confidenceLabel = `High (${completedCyclesCount} cycles)`;
    }

    predictions.push({
      itemId,
      itemName,
      unit,
      categoryId,
      sku,
      totalPurchasesCount,
      distinctPurchaseDatesCount,
      completedCyclesCount,
      totalQuantityConsumed,
      totalCycleDays,
      cycles,
      averageDailyConsumption,
      lastPurchaseDate,
      lastPurchaseQuantity,
      estimatedDaysToNextPurchase,
      predictedNextPurchaseDate,
      status,
      statusLabel,
      daysRemaining,
      overdueDays,
      confidence,
      confidenceLabel,
    });
  }

  // Sort predictions by urgency:
  // 1. Overdue (descending by overdue days: most overdue first)
  // 2. Due Today
  // 3. Upcoming (ascending by days remaining: closest upcoming first)
  // 4. Insufficient History
  const statusPriority: Record<RepurchaseStatus, number> = {
    overdue: 1,
    due_today: 2,
    upcoming: 3,
    insufficient_history: 4,
  };

  predictions.sort((a, b) => {
    if (statusPriority[a.status] !== statusPriority[b.status]) {
      return statusPriority[a.status] - statusPriority[b.status];
    }
    if (a.status === 'overdue' && b.status === 'overdue') {
      return (b.overdueDays || 0) - (a.overdueDays || 0); // most overdue first
    }
    if (a.status === 'upcoming' && b.status === 'upcoming') {
      return (a.daysRemaining || 0) - (b.daysRemaining || 0); // soonest first
    }
    return a.itemName.localeCompare(b.itemName);
  });

  const overdueCount = predictions.filter((p) => p.status === 'overdue').length;
  const dueTodayCount = predictions.filter((p) => p.status === 'due_today').length;
  const upcomingCount = predictions.filter((p) => p.status === 'upcoming').length;
  const insufficientHistoryCount = predictions.filter(
    (p) => p.status === 'insufficient_history'
  ).length;

  return {
    customerId,
    predictions,
    totalTrackedProducts: predictions.length,
    overdueCount,
    dueTodayCount,
    upcomingCount,
    insufficientHistoryCount,
    hasUrgentRepurchases: overdueCount > 0 || dueTodayCount > 0,
  };
}

/**
 * Format helper for daily consumption rate.
 */
export function formatConsumptionRate(rate: number | null, unit: string = 'unit'): string {
  if (rate === null || rate === undefined || isNaN(rate)) {
    return 'Insufficient History';
  }
  // If rate is integer, show 1 decimal; else show 2 decimals
  const formatted = rate >= 10 ? rate.toFixed(1) : rate.toFixed(2);
  return `${formatted} ${unit}/day`;
}

export interface ProductPurchaseTransaction {
  saleId: string;
  invoiceNumber?: string;
  timestamp: number;
  dateFormatted: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalAmount?: number;
  daysSincePrevious: number | null; // null for first purchase, number of days for subsequent
  dailyConsumptionForCycle?: number | null;
  paymentMethod?: string;
}

/**
 * Extracts the full chronological purchase history for a specific customer and product.
 * Calculates intervals between purchases and the daily consumption for each cycle.
 */
export function getProductPurchaseHistory(
  sales: Sale[],
  customerId: string,
  itemId: string,
  unit: string = 'unit'
): ProductPurchaseTransaction[] {
  // 1. Filter sales for this customer
  const validSales = sales.filter(
    (sale) => sale.customerId === customerId && sale.status !== 'cancelled'
  );

  // 2. Extract item lines
  const rawRecords: {
    saleId: string;
    invoiceNumber?: string;
    timestamp: number;
    quantity: number;
    unitPrice?: number;
    totalAmount?: number;
    paymentMethod?: string;
  }[] = [];

  for (const s of validSales) {
    if (!s.items || !Array.isArray(s.items)) continue;
    for (const line of s.items) {
      if (line.itemId === itemId) {
        const qty = Number(line.quantity) || 0;
        if (qty <= 0) continue;
        const price = Number(line.unitPrice) || 0;
        rawRecords.push({
          saleId: s.id,
          invoiceNumber: s.gstBillNumber || s.id.slice(-6).toUpperCase(),
          timestamp: s.timestamp,
          quantity: qty,
          unitPrice: price,
          totalAmount: qty * price,
          paymentMethod: s.paymentType,
        });
      }
    }
  }

  // 3. Sort chronologically (earliest to latest)
  rawRecords.sort((a, b) => a.timestamp - b.timestamp);

  // 4. Calculate intervals between consecutive purchases
  const history: ProductPurchaseTransaction[] = [];
  for (let i = 0; i < rawRecords.length; i++) {
    const cur = rawRecords[i];
    let daysSincePrevious: number | null = null;
    let dailyConsumptionForCycle: number | null = null;

    if (i > 0) {
      const prev = rawRecords[i - 1];
      const startCur = startOfDay(new Date(cur.timestamp)).getTime();
      const startPrev = startOfDay(new Date(prev.timestamp)).getTime();
      const diffDays = Math.max(0, Math.round((startCur - startPrev) / (1000 * 60 * 60 * 24)));
      daysSincePrevious = diffDays;
      if (diffDays > 0) {
        dailyConsumptionForCycle = prev.quantity / diffDays;
      }
    }

    history.push({
      saleId: cur.saleId,
      invoiceNumber: cur.invoiceNumber,
      timestamp: cur.timestamp,
      dateFormatted: format(new Date(cur.timestamp), 'dd MMM yyyy, hh:mm a'),
      quantity: cur.quantity,
      unit,
      unitPrice: cur.unitPrice,
      totalAmount: cur.totalAmount,
      daysSincePrevious,
      dailyConsumptionForCycle,
      paymentMethod: cur.paymentMethod,
    });
  }

  return history;
}
