import React from 'react';
import { CheckCircle2, Clock, Send, ShieldAlert, XCircle } from 'lucide-react';
import type { Campaign, DeliveryStatus } from '../types/sms';

export const DeliveryStatusText: React.FC<{ status: DeliveryStatus }> = ({ status }) => {
  switch (status) {
    case 'delivered':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Delivered
        </span>
      );
    case 'sent':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Send className="h-3.5 w-3.5 shrink-0" />
          Sent to carrier
        </span>
      );
    case 'sending':
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {status === 'sending' ? 'Sending' : 'Queued'}
        </span>
      );
    case 'opted_out':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Opted out
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Failed
        </span>
      );
  }
};

export const CampaignStatusText: React.FC<{ status: Campaign['status'] }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">Completed</span>;
    case 'running':
    case 'queued':
      return <span className="text-xs font-medium text-amber-700 whitespace-nowrap">Dispatching</span>;
    case 'partial_failure':
      return <span className="text-xs font-medium text-red-700 whitespace-nowrap">With failures</span>;
  }
};
