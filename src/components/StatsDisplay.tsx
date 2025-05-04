import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Cloud, CloudRain, Battery, DollarSign, HelpCircle, X } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,   // <- add this
} from '@radix-ui/react-popover';

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
  // Calculate cost of energy based on the new formula from the research
  // For a typical query: ~0.3 watt-hours per 500 token response
  // We'll use a conversion factor of 3600000 to convert from Joules to watt-hours
  // 1 kWh = 3,600,000 Joules
  // Average electricity cost is around $0.15 per kWh
  const energyInWattHours = stats.energyConsumption / 3600000;
  const energyCost = energyInWattHours * 0.15;
  
  // Calculate environmental equivalences
  const waterBottles = (stats.waterUsage / 500).toFixed(2);
  const showerSeconds = (stats.waterUsage / (65000 / 60)).toFixed(1);
  const carMiles = (stats.carbonEmissions / 400).toFixed(2);
  const flightMinutes = (stats.carbonEmissions / (90 * 1000 / 60)).toFixed(1);
  const lightbulbHours = (energyInWattHours / 10).toFixed(1);
  
  return (
    <div className="space-y-4">
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
            <Progress 
              value={Math.min(energyInWattHours / 5, 100)} 
              className="h-1.5 mt-1 bg-yellow-100" 
            />
            <p className="text-xs mt-1 text-yellow-600">
              {formatNumber(energyInWattHours)} Wh ({(energyInWattHours * 1000).toFixed(2)} mWh)
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
            <Progress 
              value={Math.min(stats.waterUsage / 500, 100)} 
              className="h-1.5 mt-1 bg-blue-100" 
            />
            <p className="text-xs mt-1 text-blue-600">
              {(stats.waterUsage / 1000).toFixed(3)} liters total
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
            <Progress 
              value={Math.min(stats.carbonEmissions / 50, 100)} 
              className="h-1.5 mt-1 bg-green-100" 
            />
            <p className="text-xs mt-1 text-green-600">
              {(stats.carbonEmissions / 1000).toFixed(3)} kg CO₂e
            </p>
          </div>
        </Card>
      </div>

      {/* Environmental Equivalence Section with Help Button */}
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>
            <button className="absolute -top-12 right-1 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <HelpCircle className="h-5 w-5 text-slate-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Environmental Equivalents</h4>
                <PopoverClose className="h-4 w-4 text-slate-500 hover:text-slate-800">
                  <X className="h-4 w-4" />
                </PopoverClose>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-start">
                  <Cloud className="h-3.5 w-3.5 mr-2 mt-0.5 text-green-500" />
                  <div>
                    <p className="text-xs font-medium text-green-700">Carbon Emissions:</p>
                    <p className="text-xs text-slate-600">
                      Equal to a car driving <span className="font-medium">{carMiles} miles</span> or
                      <span className="font-medium"> {flightMinutes} minutes</span> of flight time
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <CloudRain className="h-3.5 w-3.5 mr-2 mt-0.5 text-blue-500" />
                  <div>
                    <p className="text-xs font-medium text-blue-700">Water Usage:</p>
                    <p className="text-xs text-slate-600">
                      Equal to <span className="font-medium">{waterBottles} water bottles</span> or
                      <span className="font-medium"> {showerSeconds} seconds</span> of showering
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Battery className="h-3.5 w-3.5 mr-2 mt-0.5 text-yellow-500" />
                  <div>
                    <p className="text-xs font-medium text-yellow-700">Energy Consumption:</p>
                    <p className="text-xs text-slate-600">
                      Could power a 10W LED lightbulb for <span className="font-medium">{lightbulbHours} hours</span>
                    </p>
                  </div>
                </div>
                
                <div className="pt-1 text-[10px] text-slate-500 italic">
                  Data based on industry research & standards for datacenter environmental metrics
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default StatsDisplay;
