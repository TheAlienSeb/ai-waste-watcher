import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cloud, CloudRain, Battery, DollarSign, MessageSquare, ArrowDown, ArrowUp, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Prompt = {
  waterUsage: number;
  carbonEmissions: number;
  energyConsumption: number;
  cost: number;
  tokenCount: number;
  inputTokenCount?: number;
  responseTokens?: number;
  model: string;
  site: string;
  timestamp: string;
  text?: string;
};

type PromptHistoryProps = {
  prompts: Prompt[];
  formatNumber: (num: number) => string;
};

const PromptHistory = ({ prompts, formatNumber }: PromptHistoryProps) => {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<{[key: number]: boolean}>({});
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format energy in appropriate units
  const formatEnergy = (joules: number) => {
    if (joules < 1000) {
      return `${formatNumber(joules)} J`;
    } else if (joules < 3600000) {
      return `${formatNumber(joules / 3600)} Wh`;
    } else {
      return `${formatNumber(joules / 3600000)} kWh`;
    }
  };
  
  // Format model name nicely
  const formatModelName = (model: string) => {
    if (model === 'gpt-4o') return 'GPT-4o';
    if (model === 'gpt-4') return 'GPT-4';
    if (model === 'gpt-3.5') return 'GPT-3.5';
    if (model.includes('claude')) return 'Claude';
    if (model.includes('gemini')) return 'Gemini';
    if (model.includes('perplexity')) return 'Perplexity';
    return model.charAt(0).toUpperCase() + model.slice(1);
  };
  
  // Extract domain from full site URL
  const formatSite = (site: string) => {
    try {
      // Try to extract domain if it's a full URL
      if (site.includes('.')) {
        const domain = site.split('/')[0].split('.');
        if (domain.length >= 2) {
          return domain[domain.length - 2];
        }
      }
      return site.split('/')[0]; // Fallback to first part
    } catch (e) {
      return site;
    }
  };
  
  // Toggle expanded state for a prompt
  const toggleExpanded = (index: number) => {
    setExpanded(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Filter prompts by model
  const filteredPrompts = filter === "all" 
    ? prompts 
    : prompts.filter(prompt => prompt.model.includes(filter));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2">
        <h3 className="text-sm font-medium">Prompt History</h3>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            <SelectItem value="gpt">OpenAI</SelectItem>
            <SelectItem value="claude">Claude</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="perplexity">Perplexity</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <ScrollArea className="h-[375px] pr-4">
        {filteredPrompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-muted-foreground mb-2">No prompts recorded yet</div>
            <p className="text-xs text-muted-foreground max-w-[250px]">
              Start using AI services like ChatGPT, Claude, or Perplexity to track your environmental impact
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPrompts.map((prompt, index) => {
              // Calculate if we have input tokens data
              const hasInputData = !!(prompt.inputTokenCount);
              const totalTokens = prompt.tokenCount || 0;
              const inputTokens = prompt.inputTokenCount || 0;
              const responseTokens = prompt.responseTokens || prompt.tokenCount || 0;
              const isExpanded = expanded[index] || false;
              
              return (
                <Card 
                  key={index} 
                  className="p-3 bg-white/80 backdrop-blur-sm border-slate-100 shadow-sm"
                  onClick={() => toggleExpanded(index)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-1">
                      <Badge variant="outline" className="bg-primary/10 text-primary text-xs font-normal px-1.5 py-0">
                        {formatModelName(prompt.model)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">via {formatSite(prompt.site)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(prompt.timestamp)}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground mb-3">
                    <MessageSquare className="h-3 w-3" />
                    <div className="flex space-x-1">
                      {hasInputData ? (
                        <>
                          <span className="flex items-center">
                            <ArrowUp className="h-2 w-2 mr-0.5" />
                            {inputTokens}
                             tokens
                          </span>
                          <span className="flex items-center">
                            <ArrowDown className="h-2 w-2 mr-0.5 text-blue-500" />
                            {responseTokens}
                             tokens
                          </span>
                        </>
                      ) : (
                        <span>{totalTokens} tokens</span>
                      )}
                    </div>
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
                      <span className="text-xs">{formatEnergy(prompt.energyConsumption)}</span>
                    </div>
                    <div className="flex items-center">
                      <DollarSign className="h-3 w-3 mr-1 text-purple-500" />
                      <span className="text-xs">${prompt.cost.toFixed(4)}</span>
                    </div>
                  </div>
                  
                  {isExpanded && prompt.text && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-xs text-muted-foreground font-medium mb-1">Response Preview:</div>
                      <div className="text-xs line-clamp-3 text-slate-600">
                        {prompt.text}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default PromptHistory;
