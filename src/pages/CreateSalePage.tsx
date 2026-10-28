import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenancy } from '../contexts';
import { useAuth } from '../contexts';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { Customer, Item, Sale, SaleLine, InventoryLocation, StockSummary, PaymentRecord } from '../types';
import { Plus, Minus, Trash2, Search, Loader2, ShoppingCart, X, Barcode, Camera, CheckCircle2, Printer, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { getItemDisplayName, getItemSkuLabel } from '../utils/items';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import { format } from 'date-fns';
import { createInvoicePdfBlob, downloadInvoicePdf, printPdfBlob } from '../utils/reporting';
import {
  getMinimumQuantity,
  getQuantityAdjustStep,
  getQuantityInputStep,
  isValidQuantityForUnit,
  supportsDecimalQuantity,
} from '../utils/quantity';
import { getNextInvoiceNumber } from '../utils/invoice';

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type CameraCapabilityMap = MediaTrackCapabilities & {
  exposureMode?: string[];
  focusMode?: string[];
  whiteBalanceMode?: string[];
};

type FocusAwareMediaTrack = MediaStreamTrack & {
  getCapabilities?: () => CameraCapabilityMap;
  applyConstraints: (constraints?: MediaTrackConstraints) => Promise<void>;
};

const createScannerConstraints = (facingMode: 'environment' | 'user'): MediaStreamConstraints[] => {
  const preferredVideo: MediaTrackConstraints = {
    facingMode:
      facingMode === 'environment'
        ? { exact: 'environment' }
        : { ideal: 'user' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    aspectRatio: { ideal: 4 / 3 },
  };

  return [
    { video: preferredVideo, audio: false },
    {
      video: {
        ...preferredVideo,
        facingMode:
          facingMode === 'environment'
            ? { ideal: 'environment' }
            : { ideal: 'user' },
      },
      audio: false,
    },
    { video: true, audio: false },
  ];
};

const applyAdaptiveFocusMode = async (
  track: FocusAwareMediaTrack,
  preferredModes: string[]
) => {
  const capabilities =
    typeof track.getCapabilities === 'function'
      ? (track.getCapabilities() as CameraCapabilityMap)
      : undefined;
  const supportedModes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];

  for (const mode of preferredModes) {
    if (!supportedModes.includes(mode)) continue;

    try {
      await track.applyConstraints({
        advanced: [{ focusMode: mode } as MediaTrackConstraintSet],
      });
      return true;
    } catch {
      // Try the next supported focus mode.
    }
  }

  return false;
};

const configureScannerStream = async (
  stream: MediaStream,
  facingMode: 'environment' | 'user'
) => {
  const [track] = stream.getVideoTracks() as FocusAwareMediaTrack[];
  if (!track) return false;

  const capabilities =
    typeof track.getCapabilities === 'function'
      ? (track.getCapabilities() as CameraCapabilityMap)
      : undefined;
  const advancedConstraints: MediaTrackConstraintSet[] = [];

  if (Array.isArray(capabilities?.focusMode)) {
    if (capabilities.focusMode.includes('continuous')) {
      advancedConstraints.push({ focusMode: 'continuous' } as MediaTrackConstraintSet);
    } else if (capabilities.focusMode.includes('single-shot')) {
      advancedConstraints.push({ focusMode: 'single-shot' } as MediaTrackConstraintSet);
    }
  }

  if (Array.isArray(capabilities?.exposureMode) && capabilities.exposureMode.includes('continuous')) {
    advancedConstraints.push({ exposureMode: 'continuous' } as MediaTrackConstraintSet);
  }

  if (Array.isArray(capabilities?.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
    advancedConstraints.push({ whiteBalanceMode: 'continuous' } as MediaTrackConstraintSet);
  }

  try {
    await track.applyConstraints({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      aspectRatio: { ideal: 4 / 3 },
      facingMode: { ideal: facingMode },
      advanced: advancedConstraints.length ? advancedConstraints : undefined,
    });
  } catch {
    if (advancedConstraints.length) {
      try {
        await track.applyConstraints({
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: facingMode },
        });
      } catch {
        // Leave the browser-selected defaults when the device rejects custom constraints.
      }
    }
  }

  return applyAdaptiveFocusMode(track, ['continuous', 'single-shot']);
};

const emptyCustomerForm: Partial<Customer> = {
  name: '',
  shopName: '',
  phone: '',
  email: '',
  address: '',
  route: '',
  balance: 0,
  gstin: '',
};

export const CreateSalePage: React.FC = () => {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const [searchParams] = useSearchParams();
  const initialLocationId = searchParams.get('locationId');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [locationStock, setLocationStock] = useState<StockSummary[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(initialLocationId || '');
  const [saleItems, setSaleItems] = useState<Partial<SaleLine>[]>([]);
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>(emptyCustomerForm);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [completedSaleData, setCompletedSaleData] = useState<{
    sale: Sale;
    customer: Customer | null;
    location: InventoryLocation | null;
  } | null>(null);
  const [invoiceActionLoading, setInvoiceActionLoading] = useState<'download' | 'print' | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [lastScanFeedback, setLastScanFeedback] = useState('');
  const [duplicateScanPrompt, setDuplicateScanPrompt] = useState<{
    itemId: string;
    itemName: string;
  } | null>(null);
  const [duplicateScanQuantityInput, setDuplicateScanQuantityInput] = useState('2');
  const [scannerFacingMode, setScannerFacingMode] = useState<'environment' | 'user'>('environment');
  const [scannerState, setScannerState] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [scannerError, setScannerError] = useState('');
  const [scannerSupportsDetection, setScannerSupportsDetection] = useState(true);
  const multiLocationEnabled = currentOrg?.settings?.multiLocationEnabled ?? false;
  const barcodeEnabled = currentOrg?.settings?.enableBarcode ?? false;

  const [isScannerOpen, setIsScannerOpen] = useState(searchParams.get('scanner') === 'true');
  const barcodeBuffer = React.useRef('');
  const barcodeTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const lastScannedRef = React.useRef<{code: string, time: number}>({code: '', time: 0});
  const scannerDetectedCodeRef = React.useRef('');
  const scannerVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = React.useRef<MediaStream | null>(null);
  const scanLoopRef = React.useRef<number | null>(null);
  const scannerFocusRefreshRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (currentOrg) {
      saleService.getCustomers(currentOrg.id).then(setCustomers);
      inventoryService.getItems(currentOrg.id).then(setItems);
      inventoryService.getLocations(currentOrg.id).then(locs => {
        setLocations(locs);
        if (!selectedLocation) {
          const def = locs.find(l => l.isDefault);
          if (def) setSelectedLocation(def.id);
        }
      });
    }
  }, [currentOrg]);

  useEffect(() => {
    if (!currentOrg || !selectedLocation) {
      setLocationStock([]);
      return;
    }

    inventoryService.getStockByLocation(currentOrg.id, selectedLocation)
      .then(setLocationStock)
      .catch((error) => {
        console.error('Error loading location stock:', error);
        setLocationStock([]);
      });
  }, [currentOrg, selectedLocation]);

  useEffect(() => {
    setSaleItems(currentItems =>
      currentItems
        .map((line) => {
          const unit = items.find((entry) => entry.id === line.itemId)?.unit;
          const quantity = Math.max(getMinimumQuantity(unit), line.quantity ?? 1);
          const unitPrice = line.unitPrice || 0;

          return {
            ...line,
            quantity,
            subtotal: quantity * unitPrice,
          };
        }) as Partial<SaleLine>[]
    );
  }, [items, locationStock]);

  const [isGstBill, setIsGstBill] = useState(false);
  const [gstBillNumber, setGstBillNumber] = useState('');
  const isTaxEnabled = currentOrg?.settings?.taxEnabled ?? false;
  const settingsTaxRate = currentOrg?.settings?.taxRate ?? 0;

  const totalAmount = saleItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const gstAmount = (isTaxEnabled && isGstBill) ? (totalAmount * settingsTaxRate) / 100 : 0;
  const finalTotal = (isTaxEnabled && isGstBill) ? totalAmount + gstAmount : totalAmount;
  const taxAmount = gstAmount;

  const getAvailableStock = (itemId: string) => {
    return locationStock.find(stock => stock.itemId === itemId)?.quantity || 0;
  };

  const addItem = (item: Item) => {
    const existing = saleItems.find(si => si.itemId === item.id);
    if (existing) return;

    const initialQuantity = 1;

    setSaleItems([...saleItems, {
      itemId: item.id,
      quantity: initialQuantity,
      unitPrice: item.sellingPrice,
      subtotal: initialQuantity * item.sellingPrice
    }]);
    setSearchTerm('');
  };

  const playBeep = () => {
    try {
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, actx.currentTime);
      gain.gain.setValueAtTime(0.1, actx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, actx.currentTime + 0.1);
      osc.stop(actx.currentTime + 0.1);
      if (navigator.vibrate) navigator.vibrate(100);
    } catch(e) {}
  };

  const handleBarcodeScan = React.useCallback((scannedCode: string) => {
    if (duplicateScanPrompt) return;

    const normalizedCode = scannedCode.trim();
    if (!normalizedCode) return;

    const now = Date.now();
    if (normalizedCode === lastScannedRef.current.code && (now - lastScannedRef.current.time) < 250) {
      return;
    }
    lastScannedRef.current = { code: normalizedCode, time: now };

    const item = items.find(i => i.barcode === normalizedCode || i.sku === normalizedCode);
    if (!item) {
      setLastScanFeedback(`Not found: ${normalizedCode}`);
      notifyError(`Product not found for barcode/SKU: ${normalizedCode}`);
      return;
    }

    setSaleItems(prev => {
      const existingIndex = prev.findIndex(si => si.itemId === item.id);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        playBeep();
        const step = getQuantityAdjustStep(item.unit);
        const minimumQuantity = getMinimumQuantity(item.unit);
        const suggestedQuantity = Math.max((existing.quantity || 1) + step, minimumQuantity + step);
        setDuplicateScanPrompt({
          itemId: item.id,
          itemName: item.name,
        });
        setDuplicateScanQuantityInput(String(suggestedQuantity));
        setLastScanFeedback(`Adjust quantity for ${item.name}`);
        return prev;
      } else {
        playBeep();
        setLastScanFeedback(`Scanned ${item.name} (1)`);
        success(`Added to cart: ${item.name}`);
        return [...prev, {
          itemId: item.id,
          quantity: 1,
          unitPrice: item.sellingPrice,
          subtotal: item.sellingPrice
        }];
      }
    });
  }, [duplicateScanPrompt, items, notifyError, success]);

  const confirmDuplicateScanQuantity = React.useCallback(() => {
    if (!duplicateScanPrompt) return;

    const item = items.find((entry) => entry.id === duplicateScanPrompt.itemId);
    const nextQuantity = Math.max(
      getMinimumQuantity(item?.unit),
      parseNumericInput(duplicateScanQuantityInput) || getMinimumQuantity(item?.unit)
    );
    setSaleItems((prev) =>
      prev.map((line) => {
        if (line.itemId !== duplicateScanPrompt.itemId) return line;
        const unitPrice = line.unitPrice || 0;
        return {
          ...line,
          quantity: nextQuantity,
          subtotal: nextQuantity * unitPrice,
        };
      })
    );
    setLastScanFeedback(`Set ${duplicateScanPrompt.itemName} to ${nextQuantity}`);
    success(`${duplicateScanPrompt.itemName} quantity set to ${nextQuantity}`);
    setDuplicateScanPrompt(null);
    setDuplicateScanQuantityInput('2');
  }, [duplicateScanPrompt, duplicateScanQuantityInput, items, success]);

  const closeDuplicateScanPrompt = React.useCallback(() => {
    setDuplicateScanPrompt(null);
    setDuplicateScanQuantityInput('2');
  }, []);

  useEffect(() => {
    if (!barcodeEnabled || !isScannerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      
      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 3) {
          handleBarcodeScan(barcodeBuffer.current);
          barcodeBuffer.current = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer.current += e.key;
        if (barcodeTimeout.current) clearTimeout(barcodeTimeout.current);
        barcodeTimeout.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [barcodeEnabled, handleBarcodeScan, isScannerOpen]);

  useEffect(() => {
    if (!isScannerOpen) return;

    let cancelled = false;
    setScannerState('starting');
    setScannerError('');
    setScannerSupportsDetection(true);

    const startScanner = async () => {
      if (typeof window === 'undefined' || !navigator.mediaDevices) {
        setScannerState('error');
        setScannerError('Camera scanning is not supported on this device/browser.');
        return;
      }

      const videoElement = scannerVideoRef.current;
      if (!videoElement) {
        setScannerState('error');
        setScannerError('Scanner view could not be prepared. Please reopen scanner.');
        return;
      }

      const mediaConfigs = createScannerConstraints(scannerFacingMode);

      let stream: MediaStream | null = null;
      for (const constraints of mediaConfigs) {
        if (cancelled) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
          break;
        } catch (error) {
          if (constraints === mediaConfigs[mediaConfigs.length - 1]) {
            console.error(error);
          }
        }
      }

      if (!stream || cancelled) {
        if (!cancelled) {
          setScannerState('error');
          setScannerError('Could not start the camera. Please allow camera access and try again.');
        }
        return;
      }

      scannerStreamRef.current = stream;
      videoElement.srcObject = stream;
      const focusModeWasConfigured = await configureScannerStream(stream, scannerFacingMode);

      try {
        await videoElement.play();
      } catch (error) {
        console.error(error);
      }

      if (cancelled) return;
      setScannerState('active');
      if (!focusModeWasConfigured && scannerFacingMode === 'environment') {
        setScannerError('Camera opened, but this device did not expose autofocus controls. Move the phone slowly until the barcode looks sharp.');
      }

      scannerFocusRefreshRef.current = window.setInterval(() => {
        const activeStream = scannerStreamRef.current;
        if (!activeStream) return;
        void configureScannerStream(activeStream, scannerFacingMode);
      }, 1800) as unknown as number;

      const DetectorCtor = (window as any).BarcodeDetector as
        | (new (options?: { formats?: string[] }) => BarcodeDetectorLike)
        | undefined;

      if (!DetectorCtor) {
        setScannerSupportsDetection(false);
        return;
      }

      const formats =
        currentOrg?.settings?.barcodeFormat === 'qrcode'
          ? ['qr_code']
          : ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'code_93', 'codabar', 'itf'];

      const detector = new DetectorCtor({ formats });

      const scanFrame = async () => {
        if (cancelled || !scannerVideoRef.current || scannerVideoRef.current.readyState < 2) {
          scanLoopRef.current = window.setTimeout(scanFrame, 250) as unknown as number;
          return;
        }

        try {
          const detections = await detector.detect(scannerVideoRef.current);
          const detectedCode = detections.find((entry) => entry.rawValue)?.rawValue;
          if (detectedCode) {
            if (scannerDetectedCodeRef.current === detectedCode) {
              scanLoopRef.current = window.setTimeout(scanFrame, 280) as unknown as number;
              return;
            }
            scannerDetectedCodeRef.current = detectedCode;
            handleBarcodeScan(detectedCode);
          } else {
            scannerDetectedCodeRef.current = '';
          }
        } catch {
          // Ignore frame-level detection errors to keep scanner responsive.
        }

        scanLoopRef.current = window.setTimeout(scanFrame, 280) as unknown as number;
      };

      scanLoopRef.current = window.setTimeout(scanFrame, 350) as unknown as number;
    };

    startScanner();

    return () => {
      cancelled = true;
      setScannerState('idle');
      setScannerError('');
      if (scanLoopRef.current) {
        window.clearTimeout(scanLoopRef.current);
        scanLoopRef.current = null;
      }
      if (scannerFocusRefreshRef.current) {
        window.clearInterval(scannerFocusRefreshRef.current);
        scannerFocusRefreshRef.current = null;
      }
      if (scannerVideoRef.current) {
        scannerVideoRef.current.pause();
        scannerVideoRef.current.srcObject = null;
      }
      scannerDetectedCodeRef.current = '';
      scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    };
  }, [isScannerOpen, handleBarcodeScan, scannerFacingMode, currentOrg?.settings?.barcodeFormat]);

  const updateItem = (index: number, updates: Partial<SaleLine>) => {
    const newItems = [...saleItems];
    const item = { ...newItems[index], ...updates };
    const unit = items.find((entry) => entry.id === item.itemId)?.unit;
    if (item.quantity !== undefined) {
      item.quantity = Math.max(getMinimumQuantity(unit), item.quantity);
    }
    if (item.quantity !== undefined) {
      item.subtotal = item.quantity * (item.unitPrice || 0);
    }
    newItems[index] = item;
    setSaleItems(newItems);
  };

  const removeItem = (index: number) => {
    setSaleItems(saleItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !selectedCustomer || !selectedLocation || saleItems.length === 0) return;

    const invalidQuantityItem = saleItems.find((line) => {
      const matchedItem = items.find((entry) => entry.id === line.itemId);
      return !matchedItem || !isValidQuantityForUnit(Number(line.quantity), matchedItem.unit);
    });
    if (invalidQuantityItem) {
      const matchedItem = items.find((entry) => entry.id === invalidQuantityItem.itemId);
      notifyError(
        supportsDecimalQuantity(matchedItem?.unit)
          ? `Enter a valid quantity for ${matchedItem?.name || 'this item'}.`
          : `${matchedItem?.name || 'This item'} only supports whole-number quantities.`
      );
      return;
    }

    setLoading(true);
    try {
      const customer = customers.find(c => c.id === selectedCustomer);
      const loc = locations.find(l => l.id === selectedLocation);

      const sale = await saleService.createSale(currentOrg.id, {
        orgId: currentOrg.id,
        customerId: selectedCustomer,
        locationId: selectedLocation,
        items: saleItems as SaleLine[],
        totalAmount, // Subtotal before tax
        paidAmount: paymentType === 'cash' ? finalTotal : paidAmount,
        paymentType,
        status: 'completed',
        userId: user.uid,
        notes,
        isGstBill,
        gstAmount,
        taxRate: isGstBill ? settingsTaxRate : 0,
        gstBillNumber: isGstBill ? gstBillNumber : '',
      });

      setCompletedSaleData({
        sale,
        customer: customer || null,
        location: loc || null,
      });

      success('Sale recorded successfully');
      setSaleItems([]);
      setSelectedCustomer('');
      setPaymentType('cash');
      setPaidAmount('');
      setNotes('');
      setIsGstBill(false);
      setGstBillNumber('');
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to record sale');
    } finally {
      setLoading(false);
    }
  };

  const fetchFreshInvoiceSnapshot = async (saleId: string) => {
    if (!currentOrg) return null;
    return await saleService.getRealtimeInvoiceData(currentOrg.id, saleId);
  };

  const handleDownloadInvoice = async (data: { sale: Sale; customer: Customer | null; location: InventoryLocation | null }) => {
    const { sale, customer, location } = data;
    if (!sale || !currentOrg || invoiceActionLoading) return;

    setInvoiceActionLoading('download');
    try {
      const snapshot = await fetchFreshInvoiceSnapshot(sale.id);
      const activeSale = snapshot?.sale || sale;
      const activeCustomer = snapshot?.customer || customer;
      const activeLocation = snapshot?.location || location;
      const activeItems = snapshot?.items || items;
      const oldDueAmount = snapshot?.oldDueAmount ?? (activeSale.previousDueAmount ?? 0);
      const totalPaid = snapshot?.paidAmount ?? (activeSale.paymentType === 'credit' ? (activeSale.paidAmount || 0) : activeSale.totalAmount);
      const currentBillDue = snapshot?.currentBillDueAmount ?? Math.max(0, activeSale.totalAmount - totalPaid);
      const totalOutstanding = snapshot?.totalOutstanding ?? (oldDueAmount + currentBillDue);
      const grandTotalPayable = totalOutstanding;
      const paidStatus = snapshot?.paidStatus ?? (currentBillDue <= 0.001 ? 'PAID' : (totalPaid > 0.001 ? 'PARTIALLY PAID' : 'UNPAID'));

      const customInvoiceNumber = activeSale.isGstBill && activeSale.gstBillNumber ? activeSale.gstBillNumber : `#${activeSale.id.slice(-8).toUpperCase()}`;

      const sellerName = currentOrg.settings?.storeName || currentOrg.name || 'Purit Network';
      const sellerTagline = currentOrg.settings?.tagline || 'smart inventory management';
      const sellerAddress = currentOrg.settings?.address || 'Main Warehouse\nKozhikode, Kerala - 673631';
      const sellerPhone = currentOrg.settings?.phone || '+91 98765 43210';
      const sellerEmail = currentOrg.settings?.email || 'support@purit.com';
      const sellerGstin = currentOrg.settings?.gstin || '32ABCDE1234F1Z5';

      const pdfData = {
        organizationName: sellerName,
        organizationSubtitle: sellerTagline,
        sellerName,
        sellerAddress,
        sellerPhone,
        sellerEmail,
        sellerGstin,
        invoiceTitle: 'Sales Invoice',
        invoiceNumber: customInvoiceNumber,
        currencyCode: currentOrg.settings.currency,
        customerName: activeCustomer?.name || 'Walk-in Customer',
        customerAddress: activeCustomer?.address || 'N/A',
        customerPhone: activeCustomer?.phone,
        customerEmail: activeCustomer?.email,
        customerGstin: activeCustomer?.gstin,
        customerDetails: [
          activeCustomer?.shopName || activeCustomer?.route,
          activeCustomer?.address || 'N/A',
          activeCustomer?.phone ? `Phone: ${activeCustomer.phone}` : null,
          activeCustomer?.email ? `Email: ${activeCustomer.email}` : null,
          activeCustomer?.gstin ? `GSTIN: ${activeCustomer.gstin}` : null,
        ].filter(Boolean) as string[],
        detailRows: [
          { label: 'Date', value: format(activeSale.timestamp, 'MMM dd, yyyy HH:mm') },
          { label: 'Payment', value: activeSale.paymentType.toUpperCase() },
          { label: 'Status', value: paidStatus },
          { label: 'Location', value: activeLocation?.name || 'Main Warehouse' },
        ],
        items: activeSale.items.map((line) => {
          const item = activeItems.find((entry) => entry.id === line.itemId);
          return {
            description: getItemDisplayName(item),
            sku: item?.isDeleted ? 'DELETED' : getItemSkuLabel(item),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
          };
        }),
        subtotal: activeSale.totalAmount - (activeSale.taxAmount || 0),
        taxLabel: activeSale.isGstBill
          ? `GST (${activeSale.taxRate ?? 18}%)`
          : (activeSale.taxAmount > 0 ? `Tax (${activeSale.taxRate ?? (currentOrg.settings.taxRate ?? 0)}%)` : undefined),
        taxAmount: activeSale.taxAmount || 0,
        total: activeSale.totalAmount,
        paidAmount: totalPaid,
        oldDueAmount,
        currentBillAmount: activeSale.totalAmount,
        currentBillDueAmount: currentBillDue,
        totalOutstanding,
        grandTotalAmount: totalOutstanding,
        paidStatus,
        paymentType: activeSale.paymentType,
        notes: activeSale.notes,
        footerReference: activeSale.isGstBill && activeSale.gstBillNumber ? activeSale.gstBillNumber : activeSale.id,
      };

      const filename = activeSale.isGstBill && activeSale.gstBillNumber ? `invoice-${activeSale.gstBillNumber}.pdf` : `invoice-${activeSale.id.slice(-8).toUpperCase()}.pdf`;
      downloadInvoicePdf(filename, pdfData);
    } catch (err) {
      console.error('Error downloading fresh invoice PDF:', err);
    } finally {
      setInvoiceActionLoading(null);
    }
  };

  const handlePrintInvoice = async (data: { sale: Sale; customer: Customer | null; location: InventoryLocation | null }) => {
    const { sale, customer, location } = data;
    if (!sale || !currentOrg || invoiceActionLoading) return;

    setInvoiceActionLoading('print');
    try {
      const snapshot = await fetchFreshInvoiceSnapshot(sale.id);
      const activeSale = snapshot?.sale || sale;
      const activeCustomer = snapshot?.customer || customer;
      const activeLocation = snapshot?.location || location;
      const activeItems = snapshot?.items || items;
      const oldDueAmount = snapshot?.oldDueAmount ?? (activeSale.previousDueAmount ?? 0);
      const totalPaid = snapshot?.paidAmount ?? (activeSale.paymentType === 'credit' ? (activeSale.paidAmount || 0) : activeSale.totalAmount);
      const currentBillDue = snapshot?.currentBillDueAmount ?? Math.max(0, activeSale.totalAmount - totalPaid);
      const totalOutstanding = snapshot?.totalOutstanding ?? (oldDueAmount + currentBillDue);
      const grandTotalPayable = totalOutstanding;
      const paidStatus = snapshot?.paidStatus ?? (currentBillDue <= 0.001 ? 'PAID' : (totalPaid > 0.001 ? 'PARTIALLY PAID' : 'UNPAID'));

      const customInvoiceNumber = activeSale.isGstBill && activeSale.gstBillNumber ? activeSale.gstBillNumber : `#${activeSale.id.slice(-8).toUpperCase()}`;

      const sellerName = currentOrg.settings?.storeName || currentOrg.name || 'Purit Network';
      const sellerTagline = currentOrg.settings?.tagline || 'smart inventory management';
      const sellerAddress = currentOrg.settings?.address || 'Main Warehouse\nKozhikode, Kerala - 673631';
      const sellerPhone = currentOrg.settings?.phone || '+91 98765 43210';
      const sellerEmail = currentOrg.settings?.email || 'support@purit.com';
      const sellerGstin = currentOrg.settings?.gstin || '32ABCDE1234F1Z5';

      const pdfData = {
        organizationName: sellerName,
        organizationSubtitle: sellerTagline,
        sellerName,
        sellerAddress,
        sellerPhone,
        sellerEmail,
        sellerGstin,
        invoiceTitle: 'Sales Invoice',
        invoiceNumber: customInvoiceNumber,
        currencyCode: currentOrg.settings.currency,
        customerName: activeCustomer?.name || 'Walk-in Customer',
        customerAddress: activeCustomer?.address || 'N/A',
        customerPhone: activeCustomer?.phone,
        customerEmail: activeCustomer?.email,
        customerGstin: activeCustomer?.gstin,
        customerDetails: [
          activeCustomer?.shopName || activeCustomer?.route,
          activeCustomer?.address || 'N/A',
          activeCustomer?.phone ? `Phone: ${activeCustomer.phone}` : null,
          activeCustomer?.email ? `Email: ${activeCustomer.email}` : null,
          activeCustomer?.gstin ? `GSTIN: ${activeCustomer.gstin}` : null,
        ].filter(Boolean) as string[],
        detailRows: [
          { label: 'Date', value: format(activeSale.timestamp, 'MMM dd, yyyy HH:mm') },
          { label: 'Payment', value: activeSale.paymentType.toUpperCase() },
          { label: 'Status', value: paidStatus },
          { label: 'Location', value: activeLocation?.name || 'Main Warehouse' },
        ],
        items: activeSale.items.map((line) => {
          const item = activeItems.find((entry) => entry.id === line.itemId);
          return {
            description: getItemDisplayName(item),
            sku: item?.isDeleted ? 'DELETED' : getItemSkuLabel(item),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
          };
        }),
        subtotal: activeSale.totalAmount - (activeSale.taxAmount || 0),
        taxLabel: activeSale.isGstBill
          ? `GST (${activeSale.taxRate ?? 18}%)`
          : (activeSale.taxAmount > 0 ? `Tax (${activeSale.taxRate ?? (currentOrg.settings.taxRate ?? 0)}%)` : undefined),
        taxAmount: activeSale.taxAmount || 0,
        total: activeSale.totalAmount,
        paidAmount: totalPaid,
        oldDueAmount,
        currentBillAmount: activeSale.totalAmount,
        currentBillDueAmount: currentBillDue,
        totalOutstanding,
        grandTotalAmount: totalOutstanding,
        paidStatus,
        paymentType: activeSale.paymentType,
        notes: activeSale.notes,
        footerReference: activeSale.isGstBill && activeSale.gstBillNumber ? activeSale.gstBillNumber : activeSale.id,
      };

      const blob = createInvoicePdfBlob(pdfData);
      const filename = activeSale.isGstBill && activeSale.gstBillNumber ? `invoice-${activeSale.gstBillNumber}.pdf` : `invoice-${activeSale.id.slice(-8).toUpperCase()}.pdf`;
      printPdfBlob(blob, filename);
    } catch (err) {
      console.error('Error generating fresh invoice PDF for print:', err);
    } finally {
      setInvoiceActionLoading(null);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSetupSubmitting(true);
    try {
      const customer = await saleService.createCustomer(currentOrg.id, customerForm);
      setCustomers(prev => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomer(customer.id);
      setShowCustomerModal(false);
      setCustomerForm(emptyCustomerForm);
      success('Customer added successfully');
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to add customer');
    } finally {
      setSetupSubmitting(false);
    }
  };

  const filteredItems = items.filter(item => 
    (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.barcode?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">New Sale</h1>
        {barcodeEnabled && (
          <button
            type="button"
            onClick={() => setIsScannerOpen(!isScannerOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              isScannerOpen 
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            <Barcode className="w-4 h-4" />
            {isScannerOpen ? 'Close Scanner' : 'Scan & Sell'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {isScannerOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-zinc-900">Scanner Camera</p>
                  <p className="text-xs text-zinc-500">
                    Back camera opens first. Place the code inside the orange {currentOrg?.settings?.barcodeFormat === 'qrcode' ? 'square' : 'barcode frame'}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScannerFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                  className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  {scannerFacingMode === 'environment' ? 'Use Front Camera' : 'Use Back Camera'}
                </button>
              </div>
              <div className="mx-auto w-full max-w-sm">
                <div className="relative overflow-hidden rounded-[28px] border border-zinc-200 bg-zinc-950 shadow-inner">
                  <video
                    ref={scannerVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-transparent to-zinc-950/40" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                    <div
                      className={`relative w-full max-w-[17rem] rounded-[28px] border-2 border-orange-400/95 shadow-[0_0_0_999px_rgba(9,9,11,0.42)] ${
                        currentOrg?.settings?.barcodeFormat === 'qrcode' ? 'aspect-square' : 'aspect-[2.35/1]'
                      }`}
                    >
                      <div className="absolute -left-1 -top-1 h-5 w-5 rounded-tl-2xl border-l-[3px] border-t-[3px] border-orange-500" />
                      <div className="absolute -right-1 -top-1 h-5 w-5 rounded-tr-2xl border-r-[3px] border-t-[3px] border-orange-500" />
                      <div className="absolute -bottom-1 -left-1 h-5 w-5 rounded-bl-2xl border-b-[3px] border-l-[3px] border-orange-500" />
                      <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-br-2xl border-b-[3px] border-r-[3px] border-orange-500" />
                    </div>
                  </div>
                  {scannerState === 'starting' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/55 text-white">
                      <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening camera...
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center text-xs text-zinc-500 mt-4">Scanner is active. Point the item code inside the frame to auto-add it, or use a hardware scanner while this mode is open.</p>
              {!scannerSupportsDetection && !scannerError && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Live detection is not supported on this browser. You can still use the camera preview to line up the code and use manual entry or a hardware scanner.
                </div>
              )}
              {scannerError && (
                <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {scannerError}
                </div>
              )}
              {lastScanFeedback && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {lastScanFeedback}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {duplicateScanPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-bold text-zinc-900">Same barcode scanned again</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Set the quantity for {duplicateScanPrompt.itemName}. The input starts at 2 and stays editable so you can type any number directly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDuplicateScanPrompt}
                  className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const item = items.find((entry) => entry.id === duplicateScanPrompt.itemId);
                    const step = getQuantityAdjustStep(item?.unit);
                    const nextValue = Math.max(
                      getMinimumQuantity(item?.unit),
                      (parseNumericInput(duplicateScanQuantityInput) || getMinimumQuantity(item?.unit)) - step
                    );
                    setDuplicateScanQuantityInput(String(nextValue));
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={String(getMinimumQuantity(items.find((entry) => entry.id === duplicateScanPrompt.itemId)?.unit))}
                  step={String(getQuantityInputStep(items.find((entry) => entry.id === duplicateScanPrompt.itemId)?.unit))}
                  value={duplicateScanQuantityInput}
                  placeholder="2"
                  onChange={(e) => setDuplicateScanQuantityInput(e.target.value)}
                  className="w-28 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-lg font-semibold text-zinc-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    const item = items.find((entry) => entry.id === duplicateScanPrompt.itemId);
                    const step = getQuantityAdjustStep(item?.unit);
                    const nextValue = Math.max(
                      getMinimumQuantity(item?.unit),
                      (parseNumericInput(duplicateScanQuantityInput) || getMinimumQuantity(item?.unit)) + step
                    );
                    setDuplicateScanQuantityInput(String(nextValue));
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={closeDuplicateScanPrompt}
                  className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDuplicateScanQuantity}
                  className="flex-1 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Update Qty
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">Customer</label>
              <button
                type="button"
                onClick={() => setShowCustomerModal(true)}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                + Add Customer
              </button>
            </div>
            <AppSelect
              value={selectedCustomer}
              onChange={setSelectedCustomer}
              placeholder="Select Customer"
              searchable
              emptyMessage="No customers found."
              options={[
                { value: '', label: 'Select Customer' },
                ...customers.map((customer) => ({
                  value: customer.id,
                  label: `${customer.name} (Bal: ${customer.balance})`,
                  keywords: `${customer.shopName || ''} ${customer.phone || ''} ${customer.route || ''}`,
                })),
              ]}
              buttonClassName="rounded-lg"
            />
          </div>

          {multiLocationEnabled && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Location</label>
              <AppSelect
                value={selectedLocation}
                onChange={setSelectedLocation}
                placeholder="Select Location"
                options={[
                  { value: '', label: 'Select Location' },
                  ...locations.map((location) => ({
                    value: location.id,
                    label: `${location.name} (${location.type})`,
                  })),
                ]}
                buttonClassName="rounded-lg"
              />
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          {barcodeEnabled && (
            <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                  <Barcode className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900">Barcode / SKU Entry</p>
                  <p className="text-xs text-zinc-500">Scan with camera, use a hardware scanner, or manually enter a barcode / SKU. Re-scanning the same code opens a quantity editor instead of auto-adding by mistake.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBarcodeScan(scanInput);
                      setScanInput('');
                    }
                  }}
                  placeholder="Scan or enter barcode / SKU..."
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleBarcodeScan(scanInput);
                    setScanInput('');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  <Camera className="h-4 w-4" />
                  Add by Code
                </button>
              </div>
              {lastScanFeedback && !isScannerOpen && (
                <p className="mt-2 text-xs font-medium text-zinc-500">{lastScanFeedback}</p>
              )}
            </div>
          )}

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={barcodeEnabled ? "Search items by name, SKU, or barcode..." : "Search items to add..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {searchTerm && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-0"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">
                      {item.sku ? `SKU: ${item.sku}` : 'SKU: N/A'}
                      {barcodeEnabled && item.barcode ? ` | Barcode: ${item.barcode}` : ''}
                    </div>
                    <div className="text-xs text-gray-500">
                      Price: {item.sellingPrice} | Available here: {getAvailableStock(item.id)} {item.unit}
                    </div>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    No items found for this search.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {saleItems.map((si, index) => {
              const item = items.find(i => i.id === si.itemId);
              const availableStock = getAvailableStock(si.itemId!);
              const quantityStep = getQuantityInputStep(item?.unit);
              const minimumQuantity = getMinimumQuantity(item?.unit);
              return (
                <div key={si.itemId} className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{getItemDisplayName(item)}</div>
                    <div className="text-xs text-gray-500">
                      {item?.sku ? `SKU: ${item.sku}` : 'SKU: N/A'}
                      {barcodeEnabled && item?.barcode ? ` | Barcode: ${item.barcode}` : ''}
                    </div>
                    <div className="text-xs text-gray-500">
                      Available: {availableStock} {item?.unit} | Subtotal: {si.subtotal}
                    </div>
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] uppercase text-gray-400 font-bold">Qty</label>
                    <input
                      type="number"
                      min={String(minimumQuantity)}
                      step={String(quantityStep)}
                      value={formatNumericInput(si.quantity)}
                      placeholder="0"
                      onChange={(e) => updateItem(index, { quantity: parseNumericInput(e.target.value) })}
                      className="w-full p-1 border rounded"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] uppercase text-gray-400 font-bold">Price</label>
                    <input
                      type="number"
                      value={formatNumericInput(si.unitPrice)}
                      placeholder="0"
                      onChange={(e) => updateItem(index, { unitPrice: parseNumericInput(e.target.value) })}
                      className="w-full p-1 border rounded"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="mt-4 p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('cash')}
                  className={`flex-1 py-2 rounded-lg border ${paymentType === 'cash' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200'}`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('credit')}
                  className={`flex-1 py-2 rounded-lg border ${paymentType === 'credit' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200'}`}
                >
                  Credit
                </button>
              </div>
            </div>
            {paymentType === 'credit' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount</label>
                <input
                  type="number"
                  value={formatNumericInput(typeof paidAmount === 'number' ? paidAmount : undefined)}
                  onChange={(e) => setPaidAmount(parseNumericInput(e.target.value) ?? '')}
                  placeholder="0"
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            )}
          </div>

          {/* GST Bill Toggle */}
          {isTaxEnabled && (
            <div className="flex flex-col gap-3 mb-4 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">GST Bill ({settingsTaxRate}%)</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !isGstBill;
                    setIsGstBill(nextVal);
                    if (nextVal) {
                      const lastNum = currentOrg?.settings?.lastGstInvoiceNumber;
                      setGstBillNumber(getNextInvoiceNumber(lastNum));
                    } else {
                      setGstBillNumber('');
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isGstBill ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isGstBill ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {isGstBill && (
                <div className="mt-1">
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">
                    GST Bill Number / Custom Invoice ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={gstBillNumber}
                    onChange={(e) => setGstBillNumber(e.target.value)}
                    placeholder="e.g. GST-2026-0001"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-4 border-t">
            <div className="flex justify-between items-center text-sm text-gray-500">
              <div>Subtotal</div>
              <div>{totalAmount.toFixed(2)}</div>
            </div>
            {isTaxEnabled && isGstBill && (
              <div className="flex justify-between items-center text-sm text-gray-500">
                <div>GST ({settingsTaxRate}%)</div>
                <div>{gstAmount.toFixed(2)}</div>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <div className="text-lg font-bold text-gray-900">Total</div>
              <div className="text-2xl font-bold text-blue-600">{finalTotal.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || saleItems.length === 0 || !selectedCustomer}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
          Confirm Sale
        </button>
      </form>

      <AnimatePresence>
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCustomerModal(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 p-6">
                <h3 className="text-xl font-bold text-zinc-900">Add New Customer</h3>
                <button onClick={() => setShowCustomerModal(false)} className="rounded-full p-2 hover:bg-zinc-100 transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleCreateCustomer} className="space-y-4 p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Customer Name</label>
                    <input
                      required
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      className="w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Shop Name</label>
                    <input
                      value={customerForm.shopName}
                      onChange={(e) => setCustomerForm({ ...customerForm, shopName: e.target.value })}
                      className="w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Phone</label>
                    <input
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      className="w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Email</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      className="w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">GSTIN (GST Number)</label>
                    <input
                      placeholder="e.g. 32ABCDE1234F1Z5"
                      value={customerForm.gstin || ''}
                      onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value })}
                      className="w-full rounded-xl border px-4 py-2 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Route</label>
                    <input
                      value={customerForm.route}
                      onChange={(e) => setCustomerForm({ ...customerForm, route: e.target.value })}
                      className="w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Opening Balance</label>
                    <input
                      type="number"
                      min="0"
                      value={formatNumericInput(customerForm.balance)}
                      onChange={(e) => setCustomerForm({ ...customerForm, balance: parseNumericInput(e.target.value) })}
                      placeholder="0"
                      className="w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Address</label>
                    <textarea
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      className="min-h-24 w-full rounded-xl border px-4 py-2"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={setupSubmitting}
                  className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {setupSubmitting ? 'Saving...' : 'Save Customer'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {completedSaleData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCompletedSaleData(null)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl p-6 text-center space-y-6"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-inner">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-zinc-900">Sale Completed Successfully!</h3>
                <p className="text-sm text-zinc-500">
                  Invoice <span className="font-mono font-semibold">{completedSaleData.sale.isGstBill && completedSaleData.sale.gstBillNumber ? completedSaleData.sale.gstBillNumber : `#${completedSaleData.sale.id.slice(-8).toUpperCase()}`}</span> has been recorded for <span className="font-semibold">{completedSaleData.customer?.name || 'Walk-in Customer'}</span>.
                </p>
                <div className="bg-zinc-50 rounded-2xl p-4 mt-2 flex flex-col items-center justify-center border border-zinc-100">
                  <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Total Amount</span>
                  <span className="text-2xl font-bold text-blue-600 mt-1">
                    {completedSaleData.sale.totalAmount.toFixed(2)} {currentOrg?.settings.currency}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handlePrintInvoice(completedSaleData)}
                  disabled={invoiceActionLoading !== null}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all disabled:opacity-50"
                >
                  {invoiceActionLoading === 'print' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      Updating calculations...
                    </>
                  ) : (
                    <>
                      <Printer className="h-4 w-4" />
                      Print Invoice Receipt
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(completedSaleData)}
                  disabled={invoiceActionLoading !== null}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {invoiceActionLoading === 'download' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      Updating calculations...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download PDF Invoice
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedSaleData(null)}
                  className="w-full py-3 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 text-sm font-semibold transition-colors"
                >
                  Create New Sale
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
