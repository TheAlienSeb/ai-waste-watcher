
import React from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cloud, CloudRain, Battery, DollarSign } from 'lucide-react';

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

type PromptHistoryProps = {
  prompts: Prompt[];
  formatNumber: (num: number) => string;
};

const PromptHistory = ({ prompts, formatNumber }: PromptHistoryProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <ScrollArea className="h-[375px] pr-4">
      {prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="text-muted-foreground mb-2">No prompts recorded yet</div>
          <p className="text-xs text-muted-foreground max-w-[250px]">
            Start using AI services like ChatGPT, Claude, or Perplexity to track your environmental impact
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map((prompt, index) => (
            <Card key={index} className="p-3 bg-white/60 backdrop-blur-sm border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm truncate pr-2">
                  {prompt.model}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(prompt.timestamp)}
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground mb-3">
                {prompt.tokenCount} tokens via {prompt.site}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center">
                  <CloudRain className="h-3 w-3 mr-1 text-blue-500" />
                  <span className="text-xs">{formatNumber(prompt.waterUsage)} mL</span>
                </div>
                <div className="flex items-center">
                  <Cloud className="h-3 w-3 mr-1 text-green-500" />
                  <span className="text-xs">{formatNumber(prompt.carbonEmissions)} g</span>
                </div>
                <div className="flex items-center">
                  <Battery className="h-3 w-3 mr-1 text-yellow-500" />
                  <span className="text-xs">{formatNumber(prompt.energyConsumption)} J</span>
                </div>
                <div className="flex items-center">
                  <DollarSign className="h-3 w-3 mr-1 text-purple-500" />
                  <span className="text-xs">${prompt.cost.toFixed(4)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </ScrollArea>
  );
};

export default PromptHistory;
