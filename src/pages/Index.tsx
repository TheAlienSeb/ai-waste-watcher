
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Battery,
  Cloud,
  CloudLightning,
  DollarSign,
  BarChart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import StatsDisplay from '@/components/StatsDisplay';
import PromptHistory from '@/components/PromptHistory';
import ImpactCharts from '@/components/ImpactCharts';

type TotalStats = {
  waterUsage: number;
  carbonEmissions: number;
  energyConsumption: number;
  cost: number;
  promptCount: number;
};

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

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  } else {
    return num.toFixed(2);
  }
};

const Index = () => {
  const [stats, setStats] = useState<TotalStats>({
    waterUsage: 0,
    carbonEmissions: 0,
    energyConsumption: 0,
    cost: 0,
    promptCount: 0,
  });
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Load data from Chrome storage when the component mounts
    const loadData = async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          const data = await chrome.storage.local.get(['totalStats', 'prompts']);
          if (data.totalStats) {
            setStats(data.totalStats);
          }
          if (data.prompts) {
            setPrompts(data.prompts);
          }
        } else {
          // Demo data for development environment
          setStats({
            waterUsage: 1250,
            carbonEmissions: 325,
            energyConsumption: 2750,
            cost: 0.15,
            promptCount: 25,
          });
          
          const demoPrompts = Array(10).fill(0).map((_, i) => ({
            waterUsage: Math.random() * 100 + 20,
            carbonEmissions: Math.random() * 30 + 5,
            energyConsumption: Math.random() * 200 + 50,
            cost: Math.random() * 0.02 + 0.001,
            tokenCount: Math.floor(Math.random() * 500 + 100),
            model: ['gpt-4', 'gpt-3.5', 'claude', 'perplexity'][Math.floor(Math.random() * 4)],
            site: ['chat.openai.com', 'claude.ai', 'perplexity.ai'][Math.floor(Math.random() * 3)],
            timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          }));
          setPrompts(demoPrompts);
        }
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "Error loading data",
          description: "Could not load your AI usage data.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    
    // Set up listener for storage changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.totalStats) {
          setStats(changes.totalStats.newValue);
        }
        if (changes.prompts) {
          setPrompts(changes.prompts.newValue);
        }
      });
    }
  }, []);

  const resetStats = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ 
          totalStats: {
            waterUsage: 0,
            carbonEmissions: 0,
            energyConsumption: 0,
            cost: 0,
            promptCount: 0
          },
          prompts: []
        });
        
        toast({
          title: "Stats Reset",
          description: "Your AI usage data has been reset.",
        });
      } else {
        // Reset local state for development
        setStats({
          waterUsage: 0,
          carbonEmissions: 0,
          energyConsumption: 0,
          cost: 0,
          promptCount: 0
        });
        setPrompts([]);
      }
    } catch (error) {
      console.error("Error resetting stats:", error);
      toast({
        title: "Error",
        description: "Failed to reset stats.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="w-[350px] h-[500px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your AI usage data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[350px] min-h-[500px] p-4 bg-gradient-to-br from-green-50 to-blue-50">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-green-800 flex items-center gap-2">
          <CloudLightning className="h-5 w-5" /> AI Waste Watcher
        </h1>
        <div className="text-xs text-green-700 font-medium">
          {stats.promptCount} prompts tracked
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full bg-white/70 mb-4">
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
          <TabsTrigger value="charts" className="flex-1">Charts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-0">
          <StatsDisplay stats={stats} formatNumber={formatNumber} />
          
          <div className="mt-6 text-center">
            <button
              onClick={resetStats}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Reset All Stats
            </button>
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="mt-0">
          <PromptHistory prompts={prompts} formatNumber={formatNumber} />
        </TabsContent>
        
        <TabsContent value="charts" className="mt-0">
          <ImpactCharts prompts={prompts} />
        </TabsContent>
      </Tabs>
      
      <div className="text-xs text-center text-muted-foreground mt-6">
        <p>Data is based on estimated model calculations.</p>
        <p className="text-[10px] mt-1">
          Created with ❤️ for a more sustainable AI future
        </p>
      </div>
    </div>
  );
};

export default Index;
