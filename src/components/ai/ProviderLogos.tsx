'use client';

import React from 'react';
import { ProviderId } from '@/lib/types';

interface ProviderLogoProps {
  providerId: ProviderId | string;
  className?: string;
  size?: number;
}

export function ProviderLogo({ providerId, className = '', size = 20 }: ProviderLogoProps) {
  switch (providerId) {
    // ================= AI PROVIDERS =================
    case 'anthropic':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          <path
            d="M13.8 2.2L11.2 21.8H8.8L11.4 2.2H13.8ZM3.5 14.8L19.5 8.2L18.7 6.1L2.7 12.7L3.5 14.8ZM21.3 14.8L5.3 8.2L6.1 6.1L22.1 12.7L21.3 14.8Z"
            fill="#D97757"
          />
        </svg>
      );

    case 'openai':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#10A37F]`}
        >
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3428 7.897a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3428 7.897zm16.5991 3.8558L13.1038 8.3843l2.0153-1.1635a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6726a.79.79 0 0 0-.4022-.6909zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2309V6.8985a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.6672zm-12.641 4.135a.7759.7759 0 0 0-.3926.6813v6.7369l-2.02-1.1683a.0757.0757 0 0 1-.038-.052V9.5824a4.4992 4.4992 0 0 1 7.228-3.454l-.142.0805-4.7735 2.7582a.7854.7854 0 0 0-.3926.6813l.0007 1.2052zM12 14.1866l3.3543-1.9348-3.3543-1.9395-3.3543 1.9395 3.3543 1.9348z" />
        </svg>
      );

    case 'gemini':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          <path
            d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"
            fill="url(#gemini-gradient)"
          />
          <defs>
            <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4E82EE" />
              <stop offset="0.5" stopColor="#9B72CB" />
              <stop offset="1" stopColor="#D96570" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'groq':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#F55036]`}
        >
          <path d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10zm4.5 11.5h-5.25v2.25h5.25v1.5H9.75c-.828 0-1.5-.672-1.5-1.5V8.25c0-.828.672-1.5 1.5-1.5h6.75v1.5H9.75v3.75h6.75v1.5z" />
        </svg>
      );

    case 'openrouter':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#6366F1]`}
        >
          <circle cx="6" cy="6" r="3" fill="currentColor" />
          <circle cx="18" cy="6" r="3" fill="currentColor" />
          <circle cx="12" cy="18" r="3" fill="currentColor" />
          <path d="M7.5 8L10.5 16M16.5 8L13.5 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'cloudflare':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#F38020]`}
        >
          <path d="M18.3 10.5c-.3-2.5-2.4-4.5-5-4.5-1.9 0-3.6 1.1-4.4 2.7-.6-.3-1.3-.5-2-.5-2.2 0-4 1.8-4 4 0 .3 0 .7.1 1-1.8.4-3 2-3 3.8 0 2.2 1.8 4 4 4h14c2.8 0 5-2.2 5-5 0-2.4-1.7-4.4-4-4.8-.2-.3-.5-.5-.7-.7z" />
        </svg>
      );

    case 'ollama':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[var(--text)]`}
        >
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="15" cy="9" r="1.5" />
          <path d="M8 4c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v2H8V4zm11 9c0-3.9-3.1-7-7-7s-7 3.1-7 7c0 2.2 1 4.2 2.6 5.5V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.5c1.6-1.3 2.4-3.3 2.4-5.5z" />
        </svg>
      );

    case 'custom':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${className} text-[var(--primary)]`}
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <path d="M7 8l3 3-3 3" />
        </svg>
      );

    // ================= SEARCH PROVIDERS =================
    case 'brave':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#FB542B]`}
        >
          {/* Brave lion silhouette */}
          <path d="M12 2L4 6v6c0 5.5 3.5 10.7 8 12 4.5-1.3 8-6.5 8-12V6l-8-4zm0 3.2l5.5 2.8v4.5c0 3.8-2.3 7.4-5.5 8.7-3.2-1.3-5.5-4.9-5.5-8.7V8l5.5-2.8zM9.5 9.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm5 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm-2.5 4.5c-1.5 0-2.5.8-2.5 1.5h5c0-.7-1-1.5-2.5-1.5z" />
        </svg>
      );

    case 'tavily':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#6366F1]`}
        >
          {/* Tavily crystal prism mark */}
          <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <line x1="12" y1="2" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="15" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );

    case 'serper':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#34A853]`}
        >
          {/* Serper Google Search lens & pin */}
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M11 7v8M7 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'serpapi':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#4285F4]`}
        >
          {/* SerpApi badge with magnifier */}
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
          <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <line x1="12.5" y1="12.5" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'searxng':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#00A896]`}
        >
          {/* SearXNG privacy search mark */}
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="14" y1="13" x2="16" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    // ================= IMAGE GENERATION PROVIDERS =================
    case 'google-imagen':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Google Imagen 3 aperture lens */}
          <circle cx="12" cy="12" r="9" stroke="url(#imagen-grad)" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" fill="url(#imagen-grad)" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="url(#imagen-grad)" strokeWidth="1.5" />
          <defs>
            <linearGradient id="imagen-grad" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
              <stop stopColor="#EA4335" />
              <stop offset="0.33" stopColor="#FBBC05" />
              <stop offset="0.66" stopColor="#34A853" />
              <stop offset="1" stopColor="#4285F4" />
            </linearGradient>
          </defs>
        </svg>
      );

    case 'cloudflare-flux':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#F38020]`}
        >
          {/* Cloudflare Flux orange spark & frame */}
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
          <polygon points="13,4 7,14 12,14 11,20 17,10 12,10" fill="currentColor" />
        </svg>
      );

    case 'stability':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#A855F7]`}
        >
          {/* Stability AI 3D star / cube mark */}
          <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.4l6.8 3.8L12 12 5.2 8.2 12 4.4zM4.8 9.8l6.2 3.5v7l-6.2-3.5V9.8zm8.2 10.5v-7l6.2-3.5v7l-6.2 3.5z" />
        </svg>
      );

    case 'fal':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#EC4899]`}
        >
          {/* fal.ai swift geometric speed mark */}
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M14 6l-6 7h5l-2 5 7-8h-5l2-4z" fill="currentColor" />
        </svg>
      );

    case 'replicate':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[var(--text)]`}
        >
          {/* Replicate geometric blocks */}
          <rect x="3" y="4" width="18" height="3" rx="0.5" />
          <rect x="3" y="10" width="12" height="3" rx="0.5" />
          <rect x="3" y="16" width="6" height="3" rx="0.5" />
        </svg>
      );

    case 'together':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`${className} text-[#0EA5E9]`}
        >
          {/* Together AI interlocking ribbon */}
          <path
            d="M7 6a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0V6zm0 8a5 5 0 0 0 10 0v-4a5 5 0 0 0-10 0v4z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );

    default:
      return (
        <div className={`flex items-center justify-center font-bold text-xs ${className}`}>
          AI
        </div>
      );
  }
}
