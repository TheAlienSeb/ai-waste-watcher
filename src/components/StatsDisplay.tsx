
import React from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Cloud, CloudRain, Battery, DollarSign } from 'lucide-react';

type StatsDisplayProps = {
  stats: {
    waterUsage: number;
    carbonEmissions: number;
    energyConsumption: number;
    cost: number;
    promptCount: number;
  };
  formatNumber: (num: number) => string;
};

const StatsDisplay = ({ stats, formatNumber }: StatsDisplayProps) => {
  // Calculate cost of energy (approximation)
  // Average electricity cost is around $0.15 per kWh
  // 1 kWh = 3,600,000 Joules
  const energyCost = (stats.energyConsumption / 3600000) * 0.15;
  
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Total Cost - Top Left */}
      <Card className="p-3 bg-white/60 backdrop-blur-sm border-purple-100 shadow-sm">
        <div className="flex items-center mb-2">
          <DollarSign className="h-4 w-4 mr-2 text-purple-500" />
          <h3 className="text-sm font-medium text-purple-700">Total Cost</h3>
        </div>
        <div className="mt-1">
          <div className="text-lg font-semibold">${stats.cost.toFixed(4)}</div>
          <Progress value={Math.min(stats.cost * 100, 100)} className="h-1.5 mt-1 bg-purple-100" />
          <p className="text-xs mt-1 text-purple-600">
            ~${(stats.cost * 12).toFixed(2)}/year at this rate
          </p>
        </div>
      </Card>

      {/* Energy Cost - Top Right */}
      <Card className="p-3 bg-white/60 backdrop-blur-sm border-yellow-100 shadow-sm">
        <div className="flex items-center mb-2">
          <Battery className="h-4 w-4 mr-2 text-yellow-500" />
          <h3 className="text-sm font-medium text-yellow-700">Energy Cost</h3>
        </div>
        <div className="mt-1">
          <div className="text-lg font-semibold">${energyCost.toFixed(6)}</div>
          <Progress value={Math.min(energyCost * 1000, 100)} className="h-1.5 mt-1 bg-yellow-100" />
          <p className="text-xs mt-1 text-yellow-600">
            {formatNumber(stats.energyConsumption)} J ({(stats.energyConsumption / 3600).toFixed(4)} Wh)
          </p>
        </div>
      </Card>

      {/* Water Usage - Bottom Left */}
      <Card className="p-3 bg-white/60 backdrop-blur-sm border-blue-100 shadow-sm">
        <div className="flex items-center mb-2">
          <CloudRain className="h-4 w-4 mr-2 text-blue-500" />
          <h3 className="text-sm font-medium text-blue-700">Water Usage</h3>
        </div>
        <div className="mt-1">
          <div className="text-lg font-semibold">{formatNumber(stats.waterUsage)} mL</div>
          <Progress value={Math.min(stats.waterUsage / 10, 100)} className="h-1.5 mt-1 bg-blue-100" />
          <p className="text-xs mt-1 text-blue-600">
            {(stats.waterUsage / 1000).toFixed(2)} liters total
          </p>
        </div>
      </Card>

      {/* Carbon Emissions - Bottom Right */}
      <Card className="p-3 bg-white/60 backdrop-blur-sm border-green-100 shadow-sm">
        <div className="flex items-center mb-2">
          <Cloud className="h-4 w-4 mr-2 text-green-500" />
          <h3 className="text-sm font-medium text-green-700">Carbon Emissions</h3>
        </div>
        <div className="mt-1">
          <div className="text-lg font-semibold">{formatNumber(stats.carbonEmissions)} g</div>
          <Progress value={Math.min(stats.carbonEmissions / 5, 100)} className="h-1.5 mt-1 bg-green-100" />
          <p className="text-xs mt-1 text-green-600">
            {(stats.carbonEmissions / 1000).toFixed(3)} kg CO₂e
          </p>
        </div>
      </Card>
    </div>
  );
};

export default StatsDisplay;
