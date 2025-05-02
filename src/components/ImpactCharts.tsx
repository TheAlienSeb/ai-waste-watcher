
import React from 'react';
import { Card } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, 
  PieChart, Pie, Cell, Tooltip
} from 'recharts';

type Prompt = {
  waterUsage: number;
  carbonEmissions: number;
  energyConsumption: number;
  cost: number;
  tokenCount: number;
  model: string;
  site: string;
  timestamp: string;
};

type ImpactChartsProps = {
  prompts: Prompt[];
};

const ImpactCharts = ({ prompts }: ImpactChartsProps) => {
  // For models distribution pie chart
  const getModelData = () => {
    const modelCounts: Record<string, number> = {};
    prompts.forEach(prompt => {
      modelCounts[prompt.model] = (modelCounts[prompt.model] || 0) + 1;
    });
    
    return Object.keys(modelCounts).map(model => ({
      name: model,
      value: modelCounts[model]
    }));
  };
  
  // For site distribution pie chart
  const getSiteData = () => {
    const siteCounts: Record<string, number> = {};
    prompts.forEach(prompt => {
      // Extract domain name for display
      const domain = prompt.site.split('.')[0];
      siteCounts[domain] = (siteCounts[domain] || 0) + 1;
    });
    
    return Object.keys(siteCounts).map(site => ({
      name: site,
      value: siteCounts[site]
    }));
  };
  
  // For resource usage over time
  const getTimeData = () => {
    // Get the last 7 days of data grouped by day
    const last7Days: Record<string, { 
      date: string, 
      water: number, 
      carbon: number, 
      energy: number,
      cost: number
    }> = {};
    
    // Create date keys for the last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      last7Days[dateStr] = { date: dateStr, water: 0, carbon: 0, energy: 0, cost: 0 };
    }
    
    // Sum up values for each day
    prompts.forEach(prompt => {
      const date = new Date(prompt.timestamp);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Only include if within the last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
      
      if (date >= sevenDaysAgo && last7Days[dateStr]) {
        last7Days[dateStr].water += prompt.waterUsage;
        last7Days[dateStr].carbon += prompt.carbonEmissions;
        last7Days[dateStr].energy += prompt.energyConsumption;
        last7Days[dateStr].cost += prompt.cost;
      }
    });
    
    return Object.values(last7Days);
  };

  const modelData = getModelData();
  const siteData = getSiteData();
  const timeData = getTimeData();
  
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  
  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="text-muted-foreground mb-2">No data to display</div>
        <p className="text-xs text-muted-foreground max-w-[250px]">
          Charts will appear once you start using AI services
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card className="p-3 bg-white/60 backdrop-blur-sm">
        <h3 className="text-sm font-medium mb-2">Resource Usage Over Time</h3>
        <div className="h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeData}>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }}
                axisLine={{ stroke: '#e0e0e0' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip 
                formatter={(value) => {
                  return typeof value === 'number' ? [`${value.toFixed(2)}`, ''] : [value, ''];
                }}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{ fontSize: '11px' }}
              />
              <Bar dataKey="water" name="Water (mL)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-white/60 backdrop-blur-sm">
          <h3 className="text-sm font-medium mb-2">Models Used</h3>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={40}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name }) => name}
                  labelLine={false}
                >
                  {modelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value, name, props) => [`${value} prompts`, props.payload.name]}
                  contentStyle={{ fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        
        <Card className="p-3 bg-white/60 backdrop-blur-sm">
          <h3 className="text-sm font-medium mb-2">Sites Used</h3>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={siteData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={40}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name }) => name}
                  labelLine={false}
                >
                  {siteData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value, name, props) => [`${value} prompts`, props.payload.name]}
                  contentStyle={{ fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ImpactCharts;
