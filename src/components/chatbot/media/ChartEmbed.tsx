"use client"

import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
} from 'chart.js'
import { Line, Bar, Pie, Doughnut, Radar, PolarArea } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale
)

export type ChartType = 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'polarArea'

export interface ChartData {
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    backgroundColor?: string | string[]
    borderColor?: string | string[]
    borderWidth?: number
    fill?: boolean
    tension?: number
  }>
}

export interface ChartEmbedProps {
  type: ChartType
  data: ChartData
  title?: string
  width?: number
  height?: number
}

const defaultColors = [
  '#8b5cf6',
  '#3b82f6', 
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#84cc16'
]

const ChartEmbed: React.FC<ChartEmbedProps> = ({
  type,
  data,
  title,
  width = 650,
  height = 400
}) => {
  // Apply default colors if not provided
  const enhancedData = {
    ...data,
    datasets: data.datasets.map((dataset, index) => ({
      ...dataset,
      backgroundColor: dataset.backgroundColor || defaultColors[index % defaultColors.length],
      borderColor: dataset.borderColor || defaultColors[index % defaultColors.length],
      borderWidth: dataset.borderWidth ?? 2,
    }))
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#f8fafc',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: !!title,
        text: title,
        color: '#f8fafc',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: '#8b5cf6',
        borderWidth: 1
      }
    },
    scales: (type === 'line' || type === 'bar') ? {
      x: {
        ticks: { color: '#cbd5f5' },
        grid: { color: 'rgba(148,163,184,0.1)' }
      },
      y: {
        ticks: { color: '#cbd5f5' },
        grid: { color: 'rgba(148,163,184,0.1)' }
      }
    } : undefined,
    elements: {
      point: {
        radius: type === 'line' ? 4 : 0,
        hoverRadius: type === 'line' ? 6 : 0
      }
    }
  }

  const renderChart = () => {
    switch (type) {
      case 'line':
        return <Line data={enhancedData} options={chartOptions as any} />
      case 'bar':
        return <Bar data={enhancedData} options={chartOptions as any} />
      case 'pie':
        return <Pie data={enhancedData} options={chartOptions as any} />
      case 'doughnut':
        return <Doughnut data={enhancedData} options={chartOptions as any} />
      case 'radar':
        return <Radar data={enhancedData} options={chartOptions as any} />
      case 'polarArea':
        return <PolarArea data={enhancedData} options={chartOptions as any} />
      default:
        return <Line data={enhancedData} options={chartOptions as any} />
    }
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: `${width}px`,
      margin: '16px 0',
      padding: '20px',
      background: 'rgba(15,23,42,0.8)',
      border: '1px solid rgba(148,163,184,0.3)',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }}>
      <div style={{ height: `${height}px`, position: 'relative' }}>
        {renderChart()}
      </div>
    </div>
  )
}

export const parseChartData = (dataString: string): ChartData | null => {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(dataString)
    if (parsed.labels && Array.isArray(parsed.labels) && parsed.datasets && Array.isArray(parsed.datasets)) {
      return parsed as ChartData
    }
  } catch {
    // If JSON parsing fails, try to parse simple CSV-like format
    const lines = dataString.trim().split('\n')
    if (lines.length < 2) return null

    const labels = lines[0].split(',').map(s => s.trim()).filter(s => s)
    const datasets: ChartData['datasets'] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(s => s.trim())
      if (values.length === labels.length) {
        const numbers = values.map(v => parseFloat(v)).filter(n => !isNaN(n))
        if (numbers.length === values.length) {
          datasets.push({
            label: `Dataset ${i}`,
            data: numbers
          })
        }
      }
    }

    if (datasets.length > 0) {
      return { labels, datasets }
    }
  }

  return null
}

export default ChartEmbed
