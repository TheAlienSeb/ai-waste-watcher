
// Background script for AI Waste Watcher
let aiSites = [
  "chat.openai.com",
  "claude.ai",
  "perplexity.ai",
  "bard.google.com",
  "cohere.ai",
  "anthropic.com"
];

// Define the impact data type
type ImpactData = {
  waterUsage: number;
  carbonEmissions: number;
  energyConsumption: number;
  cost: number;
  tokenCount: number;
  model: string;
  site: string;
  timestamp?: string;
};

type TotalStats = {
  waterUsage: number;
  carbonEmissions: number;
  energyConsumption: number;
  cost: number;
  promptCount: number;
};

// Listen for changes to tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the tab is an AI site
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    if (aiSites.some(site => domain.includes(site))) {
      console.log("AI site detected:", domain);
      // Notify content script that we're on an AI site
      chrome.tabs.sendMessage(tabId, { action: "aiSiteDetected", site: domain });
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "promptDetected") {
    // Store the prompt data
    storePromptData(message.data);
    sendResponse({status: "Prompt data received"});
  } else if (message.action === "checkCurrentSite" && sender.tab?.url) {
    const url = new URL(sender.tab.url);
    const domain = url.hostname;
    
    if (aiSites.some(site => domain.includes(site))) {
      console.log("AI site detected from content script check:", domain);
      chrome.tabs.sendMessage(sender.tab.id as number, { 
        action: "aiSiteDetected", 
        site: domain 
      });
    }
  }
  return true;
});

// Store prompt data in chrome.storage
async function storePromptData(data: ImpactData) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['prompts', 'totalStats']);
    
    // Update prompts array
    const prompts: ImpactData[] = result.prompts || [];
    prompts.push({
      ...data,
      timestamp: new Date().toISOString()
    });
    
    // Update total stats
    const totalStats: TotalStats = result.totalStats || {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      promptCount: 0
    };
    
    totalStats.waterUsage += data.waterUsage;
    totalStats.carbonEmissions += data.carbonEmissions;
    totalStats.energyConsumption += data.energyConsumption;
    totalStats.cost += data.cost;
    totalStats.promptCount += 1;
    
    // Save the updated data
    await chrome.storage.local.set({ 
      prompts: prompts,
      totalStats: totalStats
    });
    
    console.log("Data stored successfully:", data);
  } catch (error) {
    console.error("Error storing prompt data:", error);
  }
}

// This makes TypeScript happy with module format
export {};
