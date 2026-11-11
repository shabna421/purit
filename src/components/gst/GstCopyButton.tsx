import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyTextToClipboard } from '../../utils/gstUtils';

interface GstCopyButtonProps {
  value: string | number;
  label?: string;
  className?: string;
  title?: string;
}

export const GstCopyButton: React.FC<GstCopyButtonProps> = ({
  value,
  label,
  className = '',
  title = 'Copy value for GST portal',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const str = String(value);
    const success = await copyTextToClipboard(str);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      className={`inline-flex items-center gap-1 p-1 rounded-md text-zinc-400 hover:text-orange-600 hover:bg-orange-50 transition-colors ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          {label && <span className="text-[10px] font-semibold text-emerald-600">Copied</span>}
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          {label && <span className="text-[10px] font-medium">{label}</span>}
        </>
      )}
    </button>
  );
};

