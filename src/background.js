
// Background script for AI Waste Watcher
let aiSites = [
  "chat.openai.com",
  "claude.ai",
  "perplexity.ai",
  "bard.google.com",
  "cohere.ai",
  "anthropic.com"
];

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
  }
  return true;
});

// Store prompt data in chrome.storage
async function storePromptData(data) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['prompts', 'totalStats']);
    
    // Update prompts array
    const prompts = result.prompts || [];
    prompts.push({
      ...data,
      timestamp: new Date().toISOString()
    });
    
    // Update total stats
    const totalStats = result.totalStats || {
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
