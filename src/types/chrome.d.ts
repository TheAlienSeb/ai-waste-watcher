
// Type definitions for Chrome extension API
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | object | null): Promise<any>;
      set(items: object): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    
    const local: StorageArea;
    const sync: StorageArea;
    
    interface StorageChange {
      oldValue?: any;
      newValue?: any;
    }
    
    type StorageChanges = {
      [key: string]: StorageChange;
    };
    
    function onChanged(callback: (changes: StorageChanges, areaName: string) => void): void;
  }
  
  namespace runtime {
    function sendMessage(message: any, responseCallback?: (response: any) => void): void;
    function onMessage(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => void | boolean): void;
  }
  
  namespace tabs {
    interface Tab {
      id: number;
      url?: string;
      title?: string;
      favIconUrl?: string;
      status?: string;
      active: boolean;
    }
    
    function query(queryInfo: object, callback: (result: Tab[]) => void): void;
    function onUpdated(callback: (tabId: number, changeInfo: object, tab: Tab) => void): void;
    function sendMessage(tabId: number, message: any, responseCallback?: (response: any) => void): void;
  }
  
  namespace webNavigation {
    function onCompleted(callback: (details: object) => void): void;
  }
}

// Global chrome variable
declare const chrome: typeof chrome;
