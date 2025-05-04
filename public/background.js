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

// Track active tabs with AI sites
let activeAITabs = {};

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
        
        // Track this as an active AI tab
        activeAITabs[tabId] = domain;
        
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
      } else {
        // Not an AI site, remove from tracking if it was previously
        if (activeAITabs[tabId]) {
          delete activeAITabs[tabId];
        }
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
  if (activeAITabs[tabId]) {
    delete activeAITabs[tabId];
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    // Handle captured prompts
    promptDetected: () => {
      // Store the prompt data
      storePromptData(message.data)
        .then(result => {
          sendResponse({status: "Prompt data received", data: result});
        })
        .catch(error => {
          console.error("Error storing prompt data:", error);
          sendResponse({status: "Error storing data", error: error.message});
        });
    },
    
    // Handle captured responses
    responseDetected: () => {
      // Store the response data
      storeResponseData(message.data)
        .then(result => {
          sendResponse({status: "Response data received", data: result});
        })
        .catch(error => {
          console.error("Error storing response data:", error);
          sendResponse({status: "Error storing data", error: error.message});
        });
    },
    
    // Handle direct stats updates from content script
    statsUpdated: () => {
      // Update storage with provided stats (overwrite approach)
      updateStats(message.data)
        .then(() => {
          sendResponse({status: "Stats updated successfully"});
          // Notify any open popups about the update
          notifyPopupsAboutUpdate(message.data);
        })
        .catch(error => {
          console.error("Error updating stats:", error);
          sendResponse({status: "Error updating stats", error: error.message});
        });
    },
    
    // Check current site
    checkCurrentSite: () => {
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
    },
    
    // Simple ping to verify communication
    ping: () => {
      console.log("Ping received from content script");
      sendResponse({status: "pong"});
    },
    
    // Send the latest stats to the popup
    getLatestStats: () => {
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
    },
    
    // Get total stats from all content scripts
    getCurrentStats: () => {
      // Send request to all active AI tabs to get their current stats
      requestStatsFromAllTabs()
        .then(combinedStats => {
          sendResponse({
            status: "success",
            data: combinedStats
          });
        })
        .catch(error => {
          console.error("Error gathering stats from tabs:", error);
          // Fall back to storage
          chrome.storage.local.get(['totalStats'])
            .then(result => {
              sendResponse({
                status: "fallback",
                data: result.totalStats || {}
              });
            })
            .catch(storageError => {
              sendResponse({status: "error", message: error.message});
            });
        });
    },
    
    // Reset all stats
    resetAllStats: () => {
      // Reset storage stats
      chrome.storage.local.set({
        totalStats: {
          waterUsage: 0,
          carbonEmissions: 0,
          energyConsumption: 0,
          cost: 0,
          tokenCount: 0,
          promptCount: 0
        },
        prompts: []
      })
      .then(() => {
        // Also tell all active tabs to reset their stats
        resetStatsInAllTabs()
          .then(() => {
            sendResponse({status: "All stats reset successfully"});
          })
          .catch(error => {
            console.error("Error resetting tab stats:", error);
            sendResponse({status: "Stats in storage reset, but some tabs may not have reset"});
          });
      })
      .catch(error => {
        console.error("Error resetting stats in storage:", error);
        sendResponse({status: "error", message: error.message});
      });
    }
  };
  
  // Execute handler if it exists
  if (handlers[message.action]) {
    handlers[message.action]();
    return true; // Keep the message channel open for async response
  }
  
  return false;
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
    
    // Check for duplicate prompts (prevent multiple entries on page refresh)
    const isDuplicate = prompts.some(prompt => {
      const timeDiff = new Date() - new Date(prompt.timestamp);
      const isSameSiteAndModel = prompt.model === data.model && prompt.site === data.site;
      const isRecentPrompt = timeDiff < 10000; // Within 10 seconds
      
      return isSameSiteAndModel && isRecentPrompt;
    });
    
    if (isDuplicate) {
      console.log("Detected duplicate prompt, skipping storage");
      return totalStats;
    }
    
    // Add timestamp to the data
    const promptWithTimestamp = {
      ...data,
      timestamp: new Date().toISOString(),
      inputTokens: data.inputTokenCount || 0,
      responseTokens: 0, // Will be updated when response comes in
      // Ensure complete data is stored
      waterUsage: data.waterUsage || 0,
      carbonEmissions: data.carbonEmissions || 0,
      energyConsumption: data.energyConsumption || 0,
      cost: data.cost || 0,
      model: data.model || 'unknown',
      site: data.site || 'unknown'
    };
    
    // Update the total stats
    totalStats.waterUsage += data.waterUsage || 0;
    totalStats.carbonEmissions += data.carbonEmissions || 0;
    totalStats.energyConsumption += data.energyConsumption || 0;
    totalStats.cost += data.cost || 0;
    totalStats.tokenCount += data.inputTokenCount || 0;
    totalStats.promptCount += 1;
    
    // Add to prompts list (limit to last 100)
    prompts.unshift(promptWithTimestamp);
//     if (prompts.length > 100) {
//         prompts.length = 100;
//     }
    
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

// Store response data in chrome.storage
async function storeResponseData(data) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['prompts', 'totalStats']);
    
    // Initialize if doesn't exist
    const totalStats = result.totalStats || {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      tokenCount: 0,
      promptCount: 0
    };
    
    const prompts = result.prompts || [];
    
    // Check for duplicates by site, timestamp, and token count
    const isDuplicate = prompts.some(prompt => {
      // Check if this is a duplicate response (same model, site, and very close timestamp)
      const timeDiff = new Date() - new Date(prompt.timestamp);
      const isSameSiteAndModel = prompt.model === data.model && prompt.site === data.site;
      const isRecentPrompt = timeDiff < 30000; // Within 30 seconds
      const hasSimilarTokens = Math.abs(prompt.responseTokens - (data.tokenCount || 0)) < 10;
      
      return isSameSiteAndModel && isRecentPrompt && hasSimilarTokens;
    });
    
    if (isDuplicate) {
      console.log("Detected duplicate response, skipping storage");
      // Return existing stats without adding duplicate
      return totalStats;
    }
    
    // Update the total stats with response contribution
    totalStats.waterUsage += data.waterUsage || 0;
    totalStats.carbonEmissions += data.carbonEmissions || 0;
    totalStats.energyConsumption += data.energyConsumption || 0;
    totalStats.cost += data.cost || 0;
    totalStats.tokenCount += data.tokenCount || 0;
    
    // If there's a recent prompt, try to match it with this response
    let updatedPrompt = false;
    
    if (prompts.length > 0) {
      // Look through recent prompts (last 3) to find a matching one
      for (let i = 0; i < Math.min(3, prompts.length); i++) {
        const prompt = prompts[i];
        
        // Check if this is the prompt corresponding to this response
        const timeDiff = new Date() - new Date(prompt.timestamp);
        const isSameSiteAndModel = prompt.model === data.model && prompt.site === data.site;
        const isRecentPrompt = timeDiff < 60000; // Within 60 seconds
        const needsResponseData = !prompt.responseTokens || prompt.responseTokens === 0;
        
        if (isSameSiteAndModel && isRecentPrompt && needsResponseData) {
          console.log(`Matching response to prompt at index ${i}`);
          
          // Update the prompt with response data
          prompts[i] = {
            ...prompt,
            responseTokens: data.tokenCount || 0,
            waterUsage: (prompt.waterUsage || 0) + (data.waterUsage || 0),
            carbonEmissions: (prompt.carbonEmissions || 0) + (data.carbonEmissions || 0),
            energyConsumption: (prompt.energyConsumption || 0) + (data.energyConsumption || 0),
            cost: (prompt.cost || 0) + (data.cost || 0),
            text: data.text || prompt.text
          };
          
          updatedPrompt = true;
          break;
        }
      }
    }
    
    if (!updatedPrompt) {
      console.log("Could not find matching prompt for this response");
    }
    
    // Store updated data
    await chrome.storage.local.set({
      prompts: prompts,
      totalStats: totalStats
    });
    
    // Return the updated total stats
    return totalStats;
  } catch (error) {
    console.error("Error in storeResponseData:", error);
    throw error;
  }
}

// Update stats directly with values from content script
async function updateStats(data) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['totalStats']);
    
    // Initialize if doesn't exist
    const totalStats = result.totalStats || {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      tokenCount: 0,
      promptCount: 0
    };
    
    // Check if the incoming values make sense (not zeros)
    let hasValidData = false;
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'number' && data[key] > 0) {
        hasValidData = true;
      }
    });
    
    if (!hasValidData) {
      console.log("Ignoring update with empty/zero stats");
      return totalStats;
    }
    
    // Update with latest values from content script - but only if they're greater
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'number' && totalStats.hasOwnProperty(key)) {
        // Only update if the new value is higher (prevents resets)
        if (data[key] >= totalStats[key]) {
          totalStats[key] = data[key];
        }
      }
    });
    
    // Store updated data
    await chrome.storage.local.set({
      totalStats: totalStats
    });
    
    return totalStats;
  } catch (error) {
    console.error("Error in updateStats:", error);
    throw error;
  }
}

// Ask all tabs with AI sites for their current stats
async function requestStatsFromAllTabs() {
  try {
    const tabPromises = Object.keys(activeAITabs).map(tabId => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(parseInt(tabId), { action: "getCurrentStats" })
          .then(response => {
            if (response && response.data) {
              resolve(response.data);
            } else {
              resolve({}); // Return empty object if no valid response
            }
          })
          .catch(() => resolve({})); // Ignore errors from individual tabs
      });
    });
    
    // Wait for all tabs to respond
    const allTabStats = await Promise.all(tabPromises);
    
    // Combine stats from all tabs
    const combinedStats = {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      tokenCount: 0,
      promptCount: 0
    };
    
    allTabStats.forEach(tabStat => {
      Object.keys(combinedStats).forEach(key => {
        if (typeof tabStat[key] === 'number') {
          combinedStats[key] += tabStat[key];
        }
      });
    });
    
    return combinedStats;
  } catch (error) {
    console.error("Error gathering stats from tabs:", error);
    throw error;
  }
}

// Reset stats in all active AI tabs
async function resetStatsInAllTabs() {
  const tabPromises = Object.keys(activeAITabs).map(tabId => {
    return chrome.tabs.sendMessage(parseInt(tabId), { action: "resetStats" })
      .catch(() => {}); // Ignore errors from individual tabs
  });
  
  return Promise.all(tabPromises);
}

// Notify any open popups about stat updates
function notifyPopupsAboutUpdate(stats) {
  chrome.runtime.sendMessage({
    action: "statsUpdated",
    data: stats
  }).catch(() => {
    // This is expected to fail if no popups are open
    // We can safely ignore this error
  });
}

// Initialize statistics storage if needed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['prompts', 'totalStats'], result => {
    const needsInit = !result.totalStats;
    
    if (needsInit) {
      chrome.storage.local.set({
        prompts: [],
        totalStats: {
          waterUsage: 0,
          carbonEmissions: 0,
          energyConsumption: 0,
          cost: 0,
          tokenCount: 0,
          promptCount: 0
        }
      });
      console.log("Initialized storage for AI Waste Watcher");
    }
  });
});
