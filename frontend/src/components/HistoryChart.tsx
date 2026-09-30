import { useEffect, useRef } from 'react';
import { Chart, registerables, type ScriptableContext } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { formatChartDateLabel, formatFullDateTime } from '../lib/utils';

Chart.register(...registerables);

export interface HistoryPoint {
  time: number;
  pct: number;
}

interface HistoryChartProps {
  points: HistoryPoint[];
  color: string;
}

function cssColor(name: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return '#8E8E93';
  return alpha === undefined ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`;
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function HistoryChart({ points, color }: HistoryChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const chart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: cssColor('--card'),
            borderColor: cssColor('--divider', 0.6),
            borderWidth: 1,
            titleColor: cssColor('--text'),
            bodyColor: cssColor('--text-secondary'),
            titleFont: { family: 'Inter Variable', size: 11 },
            bodyFont: { family: 'Inter Variable', size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items) => formatFullDateTime(Number(items[0].parsed.x)),
              label: (item) => {
                const y = (item.parsed as { y: number | null }).y;
                return y === null ? '' : `${y.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              tooltipFormat: 'PPPP',
            },
            grid: { display: false },
            ticks: {
              source: 'auto',
              maxTicksLimit: 5,
              maxRotation: 0,
              color: cssColor('--text-secondary'),
              font: { family: 'Inter Variable', size: 11 },
              callback: (value) => formatChartDateLabel(Number(value)),
            },
          },
          y: {
            min: 0,
            max: 115,
            beginAtZero: true,
            ticks: {
              stepSize: 50,
              callback: (value) => `${Number(value)}%`,
              color: cssColor('--text-secondary'),
              font: { family: 'Inter Variable', size: 11 },
            },
            grid: {
              color: cssColor('--divider', 0.5),
            },
            border: { display: false },
          },
        },
      },
    });

    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets = [
      {
        data: points.map((p) => ({ x: p.time, y: p.pct })),
        borderColor: color,
        backgroundColor: withAlpha(color, 0.06),
        borderWidth: 2,
        stepped: 'before',
        tension: 0,
        fill: true,
        pointRadius: (ctx: ScriptableContext<'line'>) => {
          const data = ctx.chart.data.datasets[0]?.data;
          return data && ctx.dataIndex === data.length - 1 ? 4 : 0;
        },
        pointBackgroundColor: color,
        pointBorderColor: cssColor('--card'),
        pointBorderWidth: 2,
        pointHoverRadius: 4,
        pointHitRadius: 12,
      },
    ];
    chart.update();
  }, [points, color]);

  return <canvas ref={canvasRef} />;
}