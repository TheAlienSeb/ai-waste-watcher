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

// Track session IDs by tab to prevent duplicates on page refresh
let tabSessions = {};

// Improve URL matching in the listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Generate a new session ID for this tab on page load
    tabSessions[tabId] = {
      sessionId: Date.now().toString(36) + Math.random().toString(36).substr(2),
      url: tab.url,
      timestamp: Date.now()
    };

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
      // First reconcile to ensure accuracy
      recalculateTotalsFromHistory()
        .then(() => {
          // Then fetch the updated stats
          return chrome.storage.local.get(['prompts', 'totalStats']);
        })
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
      // Call comprehensive reset function
      performFullReset()
        .then(() => {
          // Notify all tabs that stats were reset
          return notifyAllTabsOfReset();
        })
        .then(() => {
          sendResponse({status: "All stats and history reset successfully"});
        })
        .catch(error => {
          console.error("Error during full reset:", error);
          sendResponse({status: "error", message: error.message});
        });
      
      return true; // Keep the message channel open
    },

    // Add to the chrome.runtime.onMessage.addListener function

    statsReset: () => {
      // Create fresh zeroed stats
      const zeroStats = {
        waterUsage: 0,
        carbonEmissions: 0,
        energyConsumption: 0,
        cost: 0,
        tokenCount: 0,
        promptCount: 0
      };
      
      // Reset both the history and the totals to ensure complete reset
      chrome.storage.local.set({
        totalStats: zeroStats,
        prompts: [] // Also clear history to ensure nothing adds up
      })
      .then(() => {
        console.log("Stats reset in storage");
        
        // Broadcast to all tabs that stats were reset
        chrome.tabs.query({}, function(tabs) {
          for (const tab of tabs) {
            try {
              chrome.tabs.sendMessage(tab.id, {action: "statsResetConfirmed"});
            } catch (e) {
              // Ignore errors for tabs that don't have our content script
            }
          }
        });
        
        sendResponse({status: "success"});
      })
      .catch(error => {
        console.error("Error resetting stats in storage:", error);
        sendResponse({status: "error", message: error.message});
      });
      
      return true; // Keep the message channel open
    },

    // Fix the statsReset handler

    statsReset: () => {
      console.log("Received statsReset message, clearing storage");
      // Create fresh zeroed stats
      const zeroStats = {
        waterUsage: 0,
        carbonEmissions: 0,
        energyConsumption: 0,
        cost: 0,
        tokenCount: 0,
        promptCount: 0
      };
      
      // Reset both the history and the totals to ensure complete reset
      chrome.storage.local.set({
        totalStats: zeroStats,
        prompts: [], // Also clear history to ensure nothing adds up
        recentPrompts: {},
        processedItems: {},
        tabMetrics: {}
      })
      .then(() => {
        console.log("Background stats and history have been completely reset");
        
        // Use safer implementation to broadcast to tabs
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            // Skip non-http URLs
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
              return;
            }
            
            // Try to ping first to check if content script exists
            chrome.tabs.sendMessage(tab.id, { action: "ping" })
              .then(response => {
                if (response && response.status === "pong") {
                  return chrome.tabs.sendMessage(tab.id, { action: "statsResetConfirmed" });
                }
              })
              .catch(() => {
                // Silently catch errors - tab doesn't have content script
              });
          });
        });
        
        sendResponse({status: "success"});
      })
      .catch(error => {
        console.error("Error resetting stats in storage:", error);
        sendResponse({status: "error", message: error.message});
      });
      
      return true; // Keep the message channel open
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

// Update the storePromptData function

async function storePromptData(data) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['prompts', 'totalStats', 'recentPrompts', 'tabMetrics']);
    
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
    const tabMetrics = result.tabMetrics || {};
    
    // Create fingerprint for this prompt
    const promptFingerprint = `${data.model}-${data.site}-${data.inputTokenCount || 0}`;
    const recentPrompts = result.recentPrompts || {};
    
    // Check for duplicate prompts in the last 10 minutes
    const now = Date.now();
    if (recentPrompts[promptFingerprint] && (now - recentPrompts[promptFingerprint]) < 600000) { // 10 minutes
      console.log("Detected duplicate prompt via fingerprint, skipping");
      return totalStats;
    }
    
    // Also check the existing prompts array for exact duplicates (within last 2 minutes)
    const recentDuplicate = prompts.find(p => {
      const timeDiff = new Date(now) - new Date(p.timestamp);
      return p.model === data.model && 
             p.site === data.site && 
             Math.abs(p.inputTokens - (data.inputTokenCount || 0)) < 5 &&
             timeDiff < 120000; // 2 minutes
    });
    
    if (recentDuplicate) {
      console.log("Found duplicate in recent prompts array, skipping");
      return totalStats;
    }
    
    // Record this prompt fingerprint to prevent future duplicates
    recentPrompts[promptFingerprint] = now;
    
    // Clean up old entries
    for (const key in recentPrompts) {
      if (now - recentPrompts[key] > 600000) { // 10 minutes
        delete recentPrompts[key];
      }
    }
    
    // Store updated fingerprints
    await chrome.storage.local.set({ recentPrompts });
    
    // If sender tab info available, check for duplicates from page refresh
    if (data.tabId) {
      const tabId = data.tabId.toString();
      const tabMetric = tabMetrics[tabId];
      
      // If we've seen metrics for this tab already
      if (tabMetric && tabMetric.model === data.model && tabMetric.site === data.site) {
        const timeSinceLastPrompt = Date.now() - tabMetric.lastPromptTime;
        
        // If this is a prompt within 5 seconds of the last one on the same tab/model/site
        if (timeSinceLastPrompt < 5000) {
          console.log("Likely page refresh - skipping prompt recording");
          return totalStats;
        }
      }
      
      // Update tab metrics with this prompt timestamp
      tabMetrics[tabId] = {
        model: data.model,
        site: data.site,
        lastPromptTime: Date.now()
      };
      
      await chrome.storage.local.set({ tabMetrics });
    }
    
    // Continue with normal prompt storage...
    const promptWithTimestamp = {
      ...data,
      timestamp: new Date().toISOString(),
      inputTokens: data.inputTokenCount || 0,
      responseTokens: 0, // Will be updated when response comes in
      waterUsage: data.waterUsage || 0,
      carbonEmissions: data.carbonEmissions || 0,
      energyConsumption: data.energyConsumption || 0,
      cost: data.cost || 0,
      model: data.model || 'unknown',
      site: data.site || 'unknown'
    };
    
    // Add to prompts list (limit to last 100)
    prompts.unshift(promptWithTimestamp);
    if (prompts.length > 100) {
      prompts.length = 100;
    }
    
    // Store updated prompts
    await chrome.storage.local.set({
      prompts: prompts
    });
    
    // Recalculate totals based on all history entries
    const totals = await recalculateTotalsFromHistory();
    
    return totals;
  } catch (error) {
    console.error("Error in storePromptData:", error);
    throw error;
  }
}

// Update the storeResponseData function similarly
async function storeResponseData(data) {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['prompts', 'processedItems']);
    
    // Initialize if doesn't exist
    const prompts = result.prompts || [];
    const processedItems = result.processedItems || {};
    
    // Create a fingerprint of this response data
    const fingerprint = `${data.model}-${data.site}-${data.tokenCount}-${data.inputTokenCount}`;
    
    // Check if we've seen this item within the last hour
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (processedItems[fingerprint] && (now - processedItems[fingerprint]) < oneHour) {
      console.log("Detected duplicate response via fingerprint, skipping storage");
      return totalStats;
    }
    
    // Record this item to prevent duplicates
    processedItems[fingerprint] = now;
    
    // Clean up old processed items (older than 1 hour)
    for (const key in processedItems) {
      if (now - processedItems[key] > oneHour) {
        delete processedItems[key];
      }
    }
    
    // Store updated processedItems
    await chrome.storage.local.set({ processedItems });
    
    // Find the corresponding prompt and update it with response data
    let foundMatchingPrompt = false;
    
    if (prompts.length > 0) {
      // Go through the most recent prompts (first few in the array)
      for (let i = 0; i < Math.min(5, prompts.length); i++) {
        if (prompts[i].model === data.model && 
            prompts[i].site === data.site && 
            (!prompts[i].responseTokens || prompts[i].responseTokens === 0)) {
            
          console.log(`Found matching prompt at index ${i}, updating with response data`);
          
          // Update the prompt with response data
          prompts[i].responseTokens = data.tokenCount || 0;
          prompts[i].text = data.text || "";
          prompts[i].waterUsage = (prompts[i].waterUsage || 0) + (data.waterUsage || 0);
          prompts[i].carbonEmissions = (prompts[i].carbonEmissions || 0) + (data.carbonEmissions || 0);
          prompts[i].energyConsumption = (prompts[i].energyConsumption || 0) + (data.energyConsumption || 0);
          prompts[i].cost = (prompts[i].cost || 0) + (data.cost || 0);
          
          foundMatchingPrompt = true;
          break;
        }
      }
    }
    
    // If no matching prompt was found, add this as a new entry
    if (!foundMatchingPrompt) {
      console.log("No matching prompt found, creating new history entry");
      
      const responseEntry = {
        ...data,
        timestamp: new Date().toISOString(),
        inputTokens: data.inputTokenCount || 0,
        responseTokens: data.tokenCount || 0,
        waterUsage: data.waterUsage || 0,
        carbonEmissions: data.carbonEmissions || 0,
        energyConsumption: data.energyConsumption || 0,
        cost: data.cost || 0,
        model: data.model || 'unknown',
        site: data.site || 'unknown'
      };
      
      // Add to prompts list
      prompts.unshift(responseEntry);
      
      if (prompts.length > 100) {
        prompts.length = 100;
      }
    }
    
    // Store updated prompts
    await chrome.storage.local.set({
      prompts: prompts
    });
    
    // Recalculate totals based on all history entries
    const totals = await recalculateTotalsFromHistory();
    
    return totals;
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
    
    // Start reconciliation interval
    startReconciliationInterval();
  });
});

// Add this function to recalculate totals based on history

async function recalculateTotalsFromHistory() {
  try {
    // Get all prompts from storage
    const result = await chrome.storage.local.get(['prompts']);
    const prompts = result.prompts || [];
    
    // Initialize fresh totals
    const calculatedTotals = {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      tokenCount: 0,
      promptCount: prompts.length
    };
    
    // Sum up all values from the history
    prompts.forEach(prompt => {
      calculatedTotals.waterUsage += prompt.waterUsage || 0;
      calculatedTotals.carbonEmissions += prompt.carbonEmissions || 0;
      calculatedTotals.energyConsumption += prompt.energyConsumption || 0;
      calculatedTotals.cost += prompt.cost || 0;
      calculatedTotals.tokenCount += (prompt.inputTokens || 0) + (prompt.responseTokens || 0);
    });
    
    // Update the storage with recalculated totals
    await chrome.storage.local.set({
      totalStats: calculatedTotals
    });
    
    console.log("Recalculated totals from history:", calculatedTotals);
    return calculatedTotals;
  } catch (error) {
    console.error("Error recalculating totals from history:", error);
    throw error;
  }
}

// Periodically reconcile totals with history
function startReconciliationInterval() {
  // Reconcile once on startup
  recalculateTotalsFromHistory().catch(err => 
    console.error("Error during startup reconciliation:", err)
  );
  
  // Set up interval for regular reconciliation
  const RECONCILE_INTERVAL = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    recalculateTotalsFromHistory().catch(err => 
      console.error("Error during scheduled reconciliation:", err)
    );
  }, RECONCILE_INTERVAL);
}

// Add this comprehensive reset function:
async function performFullReset() {
  try {
    // Fresh zero stats object
    const zeroStats = {
      waterUsage: 0,
      carbonEmissions: 0,
      energyConsumption: 0,
      cost: 0,
      tokenCount: 0,
      promptCount: 0
    };
    
    // Reset ALL storage items related to stats
    await chrome.storage.local.set({
      totalStats: zeroStats,
      prompts: [],                  // Clear history entirely
      recentPrompts: {},            // Clear recent prompts tracking
      processedItems: {},           // Clear response tracking
      tabMetrics: {},               // Clear tab metrics
      lastUpdated: Date.now()       // Set reset timestamp
    });
    
    console.log("All storage data reset successfully");
    return true;
  } catch (error) {
    console.error("Error during storage reset:", error);
    throw error;
  }
}

// Replace the notifyAllTabsOfReset function with this improved version

async function notifyAllTabsOfReset() {
  try {
    const tabs = await chrome.tabs.query({});
    
    // Send reset confirmation to all tabs
    for (const tab of tabs) {
      try {
        // Skip chrome:// and extension:// URLs
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))) {
          continue;
        }
        
        // First check if the content script is present by sending a ping
        const response = await chrome.tabs.sendMessage(tab.id, { action: "ping" })
          .catch(() => null); // Silently catch errors
        
        // Only send the reset message if we got a response to our ping
        if (response && response.status === "pong") {
          await chrome.tabs.sendMessage(tab.id, { action: "completeStatsReset" })
            .catch(() => {}); // Ignore errors
        }
      } catch (err) {
        // Ignore individual tab errors
        console.log(`Skipping message to tab ${tab.id}: ${err.message}`);
      }
    }
    
    console.log("Reset notification sent to applicable tabs");
    return true;
  } catch (error) {
    console.error("Error in notifyAllTabsOfReset:", error);
    return false; // Don't throw, just return false
  }
}
