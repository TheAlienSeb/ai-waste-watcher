
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
    
    // Change this from a function to an event (object with addListener method)
    interface StorageChangeEvent {
      addListener(callback: (changes: StorageChanges, areaName: string) => void): void;
      removeListener(callback: (changes: StorageChanges, areaName: string) => void): void;
      hasListener(callback: (changes: StorageChanges, areaName: string) => void): boolean;
    }
    
    const onChanged: StorageChangeEvent;
  }
  
  namespace runtime {
    interface MessageEvent {
      addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => void | boolean): void;
      removeListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => void | boolean): void;
    }
    
    function sendMessage(message: any, responseCallback?: (response: any) => void): void;
    const onMessage: MessageEvent;
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
    
    interface UpdateEvent {
      addListener(callback: (tabId: number, changeInfo: object, tab: Tab) => void): void;
      removeListener(callback: (tabId: number, changeInfo: object, tab: Tab) => void): void;
    }
    
    function query(queryInfo: object, callback: (result: Tab[]) => void): void;
    const onUpdated: UpdateEvent;
    function sendMessage(tabId: number, message: any, responseCallback?: (response: any) => void): void;
  }
  
  namespace webNavigation {
    interface CompletedEvent {
      addListener(callback: (details: object) => void): void;
      removeListener(callback: (details: object) => void): void;
    }
    
    const onCompleted: CompletedEvent;
  }
}

// Global chrome variable
declare const chrome: typeof chrome;
