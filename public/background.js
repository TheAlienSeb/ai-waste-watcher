// Background script for AI Waste Watcher
let aiSites = [
  "chat.openai.com",        // OpenAI ChatGPT
  "chatgpt.com",            // ChatGPT alternative URL
  "bard.google.com",        // Google Bard (legacy)
  "gemini.google.com",      // Google Gemini
  "claude.ai",              // Anthropic Claude
  "perplexity.ai",          // Perplexity AI
  "notion.so",              // Notion AI
  "writesonic.com",         // Writesonic
  "jasper.ai",              // Jasper AI
  "bing.com/chat",          // Microsoft Bing AI Chat
  "you.com",                // You.com AI
  "huggingface.co",         // Hugging Face
  "runwayml.com",           // Runway ML
  "character.ai",           // Character AI
  "poe.com",                // Poe AI
  "cohere.com",             // Cohere
  "anthropic.com",          // Anthropic website
  "replicate.com"           // Replicate
];

// Track which tabs have content scripts loaded
let tabsWithContentScripts = {};

// Improve URL matching in the listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      // Check if the tab is an AI site
      const url = new URL(tab.url);
      const domain = url.hostname + url.pathname;
      
      // More robust check that also looks for subdomains
      if (aiSites.some(site => domain.includes(site))) {
        console.log("AI site detected:", domain);
        
        // Check if content script is ready
        chrome.tabs.sendMessage(tabId, { action: "ping" })
          .then(response => {
            if (response && response.status === "pong") {
              console.log("Content script is ready");
              tabsWithContentScripts[tabId] = true;
              // Notify content script that we're on an AI site
              return chrome.tabs.sendMessage(tabId, { action: "aiSiteDetected", site: domain });
            }
          })
          .catch(error => {
            console.log("Content script not ready yet, will try injection:", error);
            // Try to inject the content script manually if it's not loaded
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            })
            .then(() => {
              console.log("Content script injected manually");
              tabsWithContentScripts[tabId] = true;
              // Wait briefly for script to initialize
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: "aiSiteDetected", site: domain })
                  .catch(e => console.error("Error after injection:", e));
              }, 500);
            })
            .catch(e => console.error("Error injecting content script:", e));
          });
      }
    } catch (e) {
      console.error("Error parsing URL:", e);
    }
  }
});

// Listen for tab removals to clean up our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabsWithContentScripts[tabId]) {
    delete tabsWithContentScripts[tabId];
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "promptDetected") {
    // Store the prompt data
    storePromptData(message.data)
      .then(result => {
        sendResponse({status: "Prompt data received", data: result});
      })
      .catch(error => {
        console.error("Error storing prompt data:", error);
        sendResponse({status: "Error storing data", error: error.message});
      });
    return true; // Keep the message channel open for async response
  } 
  else if (message.action === "checkCurrentSite") {
    // Respond to requests to check the current site
    if (sender.tab && sender.tab.url) {
      try {
        const url = new URL(sender.tab.url);
        const domain = url.hostname + url.pathname;
        
        if (aiSites.some(site => domain.includes(site))) {
          chrome.tabs.sendMessage(sender.tab.id, { 
            action: "aiSiteDetected", 
            site: domain 
          })
          .then(() => {
            sendResponse({status: "Site checked and notification sent"});
          })
          .catch(error => {
            console.error("Error sending site notification:", error);
            sendResponse({status: "Error communicating with content script", error: error.message});
          });
        } else {
          sendResponse({status: "Not on an AI site"});
        }
      } catch (error) {
        console.error("Error checking current site:", error);
        sendResponse({status: "Error processing URL", error: error.message});
      }
    }
    return true; // Keep the message channel open
  } 
  else if (message.action === "ping") {
    // Simple ping to verify communication
    console.log("Ping received from content script");
    sendResponse({status: "pong"});
    return true;
  }
  else if (message.action === "getLatestStats") {
    // Send the latest stats to the popup
    chrome.storage.local.get(['prompts', 'totalStats'])
      .then(result => {
        sendResponse({
          status: "success", 
          data: result
        });
      })
      .catch(error => {
        console.error("Error getting stats:", error);
        sendResponse({status: "error", message: error.message});
      });
    return true; // Keep the message channel open
  }
});

// Add listener for browser action (extension icon click)
chrome.action.onClicked.addListener((tab) => {
  // We'll handle this in the popup HTML directly
  // Since we have default_popup set in the manifest
});

// Store prompt data in chrome.storage
async function storePromptData(data) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['prompts', 'totalStats']);
    
    // Initialize if doesn't exist
    const prompts = result.prompts || [];
    const totalStats = result.totalStats || {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      tokenCount: 0,
      promptCount: 0
    };
    
    // Add timestamp to the data
    const promptWithTimestamp = {
      ...data,
      timestamp: new Date().toISOString()
    };
    
    // Update the total stats
    totalStats.waterUsage += data.waterUsage;
    totalStats.carbonEmissions += data.carbonEmissions;
    totalStats.energyConsumption += data.energyConsumption;
    totalStats.cost += data.cost;
    totalStats.tokenCount += data.tokenCount;
    totalStats.promptCount += 1;
    
    // Add to prompts list (limit to last 100)
    prompts.unshift(promptWithTimestamp);
    if (prompts.length > 100) {
      prompts.length = 100;
    }
    
    // Store updated data
    await chrome.storage.local.set({
      prompts: prompts,
      totalStats: totalStats
    });
    
    // Return the updated total stats
    return totalStats;
  } catch (error) {
    console.error("Error in storePromptData:", error);
    throw error;
  }
}
