'use client';

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { ChartSpecification } from '@/lib/types';
import { BarChart3 } from 'lucide-react';

interface InlineChartProps {
  specification: ChartSpecification;
  className?: string;
}

export function InlineChart({ specification, className = '' }: InlineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Dispose old instance if exists
    if (instanceRef.current) {
      instanceRef.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    instanceRef.current = chart;

    const { type, title, xAxis, series, pieData } = specification;

    let option: echarts.EChartsOption = {};

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#F0F4F2' : '#151A17';
    const mutedColor = isDark ? '#8C9B92' : '#6A756D';
    const borderColor = isDark ? '#25312A' : '#E1E5DF';
    const splitColor = isDark ? '#1B241E' : '#EDF1EB';

    if (type === 'pie') {
      option = {
        title: {
          text: title,
          textStyle: { fontSize: 13, fontWeight: 'bold', color: textColor },
          left: 'center',
          top: 8,
        },
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)',
        },
        series: [
          {
            type: 'pie',
            radius: ['38%', '68%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 6,
              borderColor: isDark ? '#161B18' : '#fff',
              borderWidth: 2,
            },
            data: pieData || [
              { name: 'Segment A', value: 40 },
              { name: 'Segment B', value: 60 },
            ],
            color: ['#245C45', '#398568', '#4F8C71', '#82B49E', '#C2DDD0'],
          },
        ],
      };
    } else {
      // Bar or Line or Scatter
      option = {
        title: {
          text: title,
          textStyle: { fontSize: 13, fontWeight: 'bold', color: textColor },
          left: 10,
          top: 8,
        },
        tooltip: {
          trigger: 'axis',
        },
        grid: {
          left: '4%',
          right: '4%',
          bottom: '8%',
          top: 45,
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: xAxis?.data || [],
          axisLabel: { fontSize: 10, color: mutedColor },
          axisLine: { lineStyle: { color: borderColor } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { fontSize: 10, color: mutedColor },
          splitLine: { lineStyle: { color: splitColor } },
        },
        series: series.map((s, idx) => ({
          name: s.name,
          type: type === 'line' ? 'line' : 'bar',
          data: s.data,
          itemStyle: {
            color: s.color || (idx === 0 ? '#245C45' : '#398568'),
            borderRadius: type === 'bar' ? [4, 4, 0, 0] : 0,
          },
          smooth: type === 'line',
        })),
      };
    }

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      instanceRef.current = null;
    };
  }, [specification]);

  return (
    <div className={`my-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-xs ${className}`}>
      <div className="flex items-center justify-between px-2 pt-1 pb-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
          <BarChart3 className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>{specification.title}</span>
        </div>
      </div>

      <div ref={chartRef} className="w-full h-56 min-h-[220px]" />

      {specification.summary && (
        <div className="border-t border-[var(--border-subtle)] px-3 py-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--surface)]">
          {specification.summary}
        </div>
      )}
    </div>
  );
}

