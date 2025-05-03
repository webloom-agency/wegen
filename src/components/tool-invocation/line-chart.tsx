"use client";

import * as React from "react";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
  Legend,
  ResponsiveContainer,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { JsonViewPopup } from "../json-view-popup";

// LineChart component props interface
export interface LineChartProps {
  // Chart title (required)
  title: string;
  // Chart data array (required)
  data: Array<{
    xAxisLabel: string; // X-axis point label (e.g. date, month, category)
    series: Array<{
      seriesName: string; // Line series name
      value: number; // Value at this point
    }>;
  }>;
  // Chart description (optional)
  description?: string;
  // Y-axis label (optional)
  yAxisLabel?: string;
}

// Color variable names (chart-1 ~ chart-5)
const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const createKey = (label: string) => {
  return label.replaceAll(" ", "").toLowerCase();
};

export function LineChart(props: LineChartProps) {
  const { title, data, description, yAxisLabel } = props;

  // Get series names from the first data item (assuming all items have the same series)
  const seriesNames = data[0]?.series.map((item) => item.seriesName) || [];

  // Generate chart configuration dynamically
  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {};

    // Configure each series
    seriesNames.forEach((seriesName, index) => {
      // Colors cycle through chart-1 ~ chart-5
      const colorIndex = index % chartColors.length;

      config[createKey(seriesName)] = {
        label: seriesName,
        color: chartColors[colorIndex],
      };
    });

    return config;
  }, [seriesNames]);

  // Generate chart data for Recharts
  const chartData = React.useMemo(() => {
    return data.map((item) => {
      const result: any = {
        name: item.xAxisLabel,
      };

      // Add each series value to the result
      item.series.forEach(({ seriesName, value }) => {
        result[createKey(seriesName)] = value;
      });

      return result;
    });
  }, [data]);

  return (
    <Card className="bg-background">
      <CardHeader className="flex flex-col gap-2 relative">
        <CardTitle className="flex items-center">
          Line Chart - {title}
          <div className="absolute right-4 top-0">
            <JsonViewPopup data={props} />
          </div>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div>
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height="400px">
              <RechartsLineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) =>
                    typeof value === "string" && value.length > 3
                      ? value.slice(0, 3)
                      : value
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  label={
                    yAxisLabel
                      ? {
                          value: yAxisLabel,
                          angle: -90,
                          position: "insideLeft",
                        }
                      : undefined
                  }
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Legend />
                {seriesNames.map((seriesName) => (
                  <Line
                    key={seriesName}
                    type="monotone"
                    dataKey={createKey(seriesName)}
                    stroke={`var(--color-${createKey(seriesName)})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </RechartsLineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
